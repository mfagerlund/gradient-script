/**
 * Numerical gradient checking for GradientScript DSL
 * Validates symbolic gradients against finite difference approximations
 */

import {
  Expression,
  FunctionDef,
  Parameter
} from './AST.js';
import { Type, Types, TypeEnv } from './Types.js';
import { GradientResult, StructuredGradient } from './Differentiation.js';
import { expandBuiltIn, shouldExpand } from './Expander.js';

/**
 * Numerical value (scalar or structured)
 */
type NumValue = number | { [key: string]: number };

/**
 * Gradient checking result
 */
export interface GradCheckResult {
  passed: boolean;
  errors: GradCheckError[];
  maxError: number;
  meanError: number;
  totalChecks: number;
}

/**
 * Format gradient check results as a human-readable string
 */
export function formatGradCheckResult(result: GradCheckResult, funcName: string): string {
  if (result.passed) {
    return `✓ ${funcName}: ${result.totalChecks} gradients verified (max error: ${result.maxError.toExponential(2)})`;
  }

  const lines: string[] = [
    `✗ ${funcName}: ${result.errors.length}/${result.totalChecks} gradients FAILED`
  ];

  // Group errors by parameter
  const byParam = new Map<string, GradCheckError[]>();
  for (const err of result.errors) {
    const key = err.parameter;
    if (!byParam.has(key)) byParam.set(key, []);
    byParam.get(key)!.push(err);
  }

  for (const [param, errs] of byParam) {
    if (errs.length === 1 && !errs[0].component) {
      // Scalar parameter
      const e = errs[0];
      lines.push(`  ${param}: analytical=${e.analytical.toFixed(6)}, numerical=${e.numerical.toFixed(6)}, error=${e.error.toExponential(2)}`);
    } else {
      // Structured parameter - show on one line if possible
      const components = errs.map(e => `${e.component}:${e.error.toExponential(1)}`).join(', ');
      lines.push(`  ${param}: {${components}}`);
    }
  }

  return lines.join('\n');
}

export interface GradCheckError {
  parameter: string;
  component?: string;
  analytical: number;
  numerical: number;
  error: number;
  relativeError: number;
}

/**
 * Gradient checker
 */
export class GradientChecker {
  private epsilon: number;
  private tolerance: number;

  constructor(epsilon: number = 1e-5, tolerance: number = 1e-4) {
    this.epsilon = epsilon;
    this.tolerance = tolerance;
  }

  /**
   * Check gradients for a function
   */
  check(
    func: FunctionDef,
    gradients: GradientResult,
    env: TypeEnv,
    testPoint: Map<string, NumValue>
  ): GradCheckResult {
    const errors: GradCheckError[] = [];
    let totalChecks = 0;

    // For each parameter that has gradients
    for (const [paramName, gradient] of gradients.gradients.entries()) {
      const paramType = env.getOrThrow(paramName);
      const paramValue = testPoint.get(paramName);

      if (!paramValue) {
        throw new Error(`Test point missing value for parameter: ${paramName}`);
      }

      if (Types.isScalar(paramType)) {
        // Scalar parameter
        totalChecks++;
        if (typeof paramValue !== 'number') {
          throw new Error(`Expected scalar value for ${paramName}`);
        }

        const analytical = this.evaluateExpression(gradient as Expression, testPoint);
        const numerical = this.numericalGradientScalar(func, testPoint, paramName);

        const error = Math.abs(analytical - numerical);
        const relativeError = Math.abs(error / (numerical + 1e-10));

        if (error > this.tolerance || relativeError > this.tolerance) {
          errors.push({
            parameter: paramName,
            analytical,
            numerical,
            error,
            relativeError
          });
        }
      } else {
        // Structured parameter
        if (typeof paramValue === 'number') {
          throw new Error(`Expected structured value for ${paramName}`);
        }

        const structGrad = gradient as StructuredGradient;

        for (const [comp, expr] of structGrad.components.entries()) {
          totalChecks++;
          const analytical = this.evaluateExpression(expr, testPoint);
          const numerical = this.numericalGradientComponent(func, testPoint, paramName, comp);

          const error = Math.abs(analytical - numerical);
          const relativeError = Math.abs(error / (numerical + 1e-10));

          if (error > this.tolerance || relativeError > this.tolerance) {
            errors.push({
              parameter: paramName,
              component: comp,
              analytical,
              numerical,
              error,
              relativeError
            });
          }
        }
      }
    }

    const maxError = errors.length > 0 ? Math.max(...errors.map(e => e.error)) : 0;
    const meanError = errors.length > 0
      ? errors.reduce((sum, e) => sum + e.error, 0) / errors.length
      : 0;

    return {
      passed: errors.length === 0,
      errors,
      maxError,
      meanError,
      totalChecks
    };
  }

  /**
   * Compute numerical gradient for scalar parameter using finite differences
   */
  private numericalGradientScalar(
    func: FunctionDef,
    testPoint: Map<string, NumValue>,
    paramName: string
  ): number {
    const originalValue = testPoint.get(paramName) as number;

    // f(x + h)
    testPoint.set(paramName, originalValue + this.epsilon);
    const fPlus = this.evaluateFunction(func, testPoint);

    // f(x - h)
    testPoint.set(paramName, originalValue - this.epsilon);
    const fMinus = this.evaluateFunction(func, testPoint);

    // Restore original value
    testPoint.set(paramName, originalValue);

    // Central difference: (f(x+h) - f(x-h)) / (2h)
    return (fPlus - fMinus) / (2 * this.epsilon);
  }

  /**
   * Compute numerical gradient for structured parameter component
   */
  private numericalGradientComponent(
    func: FunctionDef,
    testPoint: Map<string, NumValue>,
    paramName: string,
    component: string
  ): number {
    const originalValue = testPoint.get(paramName) as { [key: string]: number };
    const originalComp = originalValue[component];

    // f(x + h)
    originalValue[component] = originalComp + this.epsilon;
    const fPlus = this.evaluateFunction(func, testPoint);

    // f(x - h)
    originalValue[component] = originalComp - this.epsilon;
    const fMinus = this.evaluateFunction(func, testPoint);

    // Restore original value
    originalValue[component] = originalComp;

    // Central difference
    return (fPlus - fMinus) / (2 * this.epsilon);
  }

  /**
   * Evaluate function at a test point
   */
  private evaluateFunction(func: FunctionDef, testPoint: Map<string, NumValue>): number {
    // Inline and evaluate the return expression
    const inlined = this.inlineWithValues(func, testPoint);
    return this.evaluateExpression(inlined, testPoint);
  }

  /**
   * Inline function body with test point values
   */
  private inlineWithValues(func: FunctionDef, testPoint: Map<string, NumValue>): Expression {
    const substitutions = new Map<string, Expression>();

    // Add intermediate variable assignments
    for (const stmt of func.body) {
      if (stmt.kind === 'assignment') {
        substitutions.set(stmt.variable, stmt.expression);
      }
    }

    return this.substituteExpression(func.returnExpr, substitutions, testPoint);
  }

  /**
   * Substitute variables in expression
   */
  private substituteExpression(
    expr: Expression,
    subs: Map<string, Expression>,
    testPoint: Map<string, NumValue>
  ): Expression {
    switch (expr.kind) {
      case 'number':
        return expr;

      case 'variable':
        if (subs.has(expr.name)) {
          return this.substituteExpression(subs.get(expr.name)!, subs, testPoint);
        }
        return expr;

      case 'binary':
        return {
          kind: 'binary',
          operator: expr.operator,
          left: this.substituteExpression(expr.left, subs, testPoint),
          right: this.substituteExpression(expr.right, subs, testPoint)
        };

      case 'unary':
        return {
          kind: 'unary',
          operator: expr.operator,
          operand: this.substituteExpression(expr.operand, subs, testPoint)
        };

      case 'call':
        // Expand built-ins before evaluation
        if (shouldExpand(expr.name)) {
          const expanded = expandBuiltIn({
            ...expr,
            args: expr.args.map(arg => this.substituteExpression(arg, subs, testPoint))
          });
          return expanded;
        }

        return {
          kind: 'call',
          name: expr.name,
          args: expr.args.map(arg => this.substituteExpression(arg, subs, testPoint))
        };

      case 'component':
        return {
          kind: 'component',
          object: this.substituteExpression(expr.object, subs, testPoint),
          component: expr.component
        };
    }
  }

  /**
   * Evaluate an expression numerically
   */
  private evaluateExpression(expr: Expression, testPoint: Map<string, NumValue>): number {
    switch (expr.kind) {
      case 'number':
        return expr.value;

      case 'variable':
        const value = testPoint.get(expr.name);
        if (typeof value === 'number') {
          return value;
        }
        throw new Error(`Cannot evaluate variable ${expr.name}: not a scalar`);

      case 'binary':
        const left = this.evaluateExpression(expr.left, testPoint);
        const right = this.evaluateExpression(expr.right, testPoint);

        switch (expr.operator) {
          case '+': return left + right;
          case '-': return left - right;
          case '*': return left * right;
          case '/': return left / right;
          case '^':
          case '**': return Math.pow(left, right);
        }
        break;

      case 'unary':
        const operand = this.evaluateExpression(expr.operand, testPoint);
        if (expr.operator === '-') return -operand;
        if (expr.operator === '+') return operand;
        break;

      case 'call':
        // Expand built-ins before evaluation
        if (shouldExpand(expr.name)) {
          const expanded = expandBuiltIn(expr);
          return this.evaluateExpression(expanded, testPoint);
        }

        const args = expr.args.map(arg => this.evaluateExpression(arg, testPoint));
        return this.evaluateMathFunction(expr.name, args);

      case 'component':
        if (expr.object.kind === 'variable') {
          const objValue = testPoint.get(expr.object.name);
          if (typeof objValue === 'object' && objValue !== null) {
            return objValue[expr.component];
          }
        }
        throw new Error(`Cannot evaluate component access: ${JSON.stringify(expr)}`);
    }

    throw new Error(`Cannot evaluate expression: ${JSON.stringify(expr)}`);
  }

  /**
   * Evaluate math function
   */
  private evaluateMathFunction(name: string, args: number[]): number {
    switch (name) {
      case 'sin': return Math.sin(args[0]);
      case 'cos': return Math.cos(args[0]);
      case 'tan': return Math.tan(args[0]);
      case 'asin': return Math.asin(args[0]);
      case 'acos': return Math.acos(args[0]);
      case 'atan': return Math.atan(args[0]);
      case 'atan2': return Math.atan2(args[0], args[1]);
      case 'exp': return Math.exp(args[0]);
      case 'log': return Math.log(args[0]);
      case 'sqrt': return Math.sqrt(args[0]);
      case 'abs': return Math.abs(args[0]);
      case 'pow': return Math.pow(args[0], args[1]);
      case 'min': return Math.min(args[0], args[1]);
      case 'max': return Math.max(args[0], args[1]);
      default:
        throw new Error(`Unknown math function: ${name}`);
    }
  }
}
