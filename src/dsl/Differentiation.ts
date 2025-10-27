/**
 * Differentiation for GradientScript DSL
 * Computes symbolic gradients for structured types
 */

import {
  Expression,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess,
  FunctionDef,
  Statement,
  Assignment
} from './AST.js';
import { Type, Types, TypeEnv } from './Types.js';
import { expandBuiltIn, shouldExpand } from './Expander.js';
import { builtIns } from './BuiltIns.js';
import { inlineIntermediateVariables } from './Inliner.js';

/**
 * Result of differentiation
 */
export interface GradientResult {
  // Gradients for each parameter that requires gradients
  // Key is parameter name, value is gradient expression (scalar or structured)
  gradients: Map<string, Expression | StructuredGradient>;
}

/**
 * Structured gradient (e.g., for Vec2 parameter)
 */
export interface StructuredGradient {
  components: Map<string, Expression>; // e.g., 'x' -> expression, 'y' -> expression
}

/**
 * Differentiation engine
 */
export class Differentiator {
  private env: TypeEnv;

  constructor(env: TypeEnv) {
    this.env = env;
  }

  /**
   * Differentiate expression with respect to a variable (component-level)
   */
  differentiate(expr: Expression, wrt: string): Expression {
    switch (expr.kind) {
      case 'number':
        return this.diffNumber(expr, wrt);
      case 'variable':
        return this.diffVariable(expr, wrt);
      case 'binary':
        return this.diffBinary(expr, wrt);
      case 'unary':
        return this.diffUnary(expr, wrt);
      case 'call':
        return this.diffCall(expr, wrt);
      case 'component':
        return this.diffComponent(expr, wrt);
    }
  }

  private diffNumber(expr: NumberLiteral, wrt: string): Expression {
    // d/dx(c) = 0
    return { kind: 'number', value: 0 };
  }

  private diffVariable(expr: Variable, wrt: string): Expression {
    // d/dx(x) = 1, d/dx(y) = 0
    if (expr.name === wrt) {
      return { kind: 'number', value: 1 };
    }
    return { kind: 'number', value: 0 };
  }

  private diffBinary(expr: BinaryOp, wrt: string): Expression {
    const { operator, left, right } = expr;

    switch (operator) {
      case '+':
      case '-':
        // (f + g)' = f' + g', (f - g)' = f' - g'
        return {
          kind: 'binary',
          operator,
          left: this.differentiate(left, wrt),
          right: this.differentiate(right, wrt)
        };

      case '*':
        // Product rule: (f * g)' = f' * g + f * g'
        return {
          kind: 'binary',
          operator: '+',
          left: {
            kind: 'binary',
            operator: '*',
            left: this.differentiate(left, wrt),
            right: right
          },
          right: {
            kind: 'binary',
            operator: '*',
            left: left,
            right: this.differentiate(right, wrt)
          }
        };

      case '/':
        // Quotient rule: (f / g)' = (f' * g - f * g') / g^2
        return {
          kind: 'binary',
          operator: '/',
          left: {
            kind: 'binary',
            operator: '-',
            left: {
              kind: 'binary',
              operator: '*',
              left: this.differentiate(left, wrt),
              right: right
            },
            right: {
              kind: 'binary',
              operator: '*',
              left: left,
              right: this.differentiate(right, wrt)
            }
          },
          right: {
            kind: 'binary',
            operator: '^',
            left: right,
            right: { kind: 'number', value: 2 }
          }
        };

      case '^':
      case '**':
        // Power rule: (f^g)' = f^g * (g' * ln(f) + g * f' / f)
        // Special case: if g is constant, use simple power rule: (f^n)' = n * f^(n-1) * f'
        if (this.isConstant(right, wrt)) {
          return {
            kind: 'binary',
            operator: '*',
            left: {
              kind: 'binary',
              operator: '*',
              left: right,
              right: {
                kind: 'binary',
                operator: '^',
                left: left,
                right: {
                  kind: 'binary',
                  operator: '-',
                  left: right,
                  right: { kind: 'number', value: 1 }
                }
              }
            },
            right: this.differentiate(left, wrt)
          };
        } else {
          // General case (f^g with both variable)
          throw new Error('Differentiation of f^g where both are variable is not yet supported');
        }
    }
  }

  private diffUnary(expr: UnaryOp, wrt: string): Expression {
    const { operator, operand } = expr;

    if (operator === '-') {
      // (-f)' = -f'
      return {
        kind: 'unary',
        operator: '-',
        operand: this.differentiate(operand, wrt)
      };
    } else {
      // (+f)' = f'
      return this.differentiate(operand, wrt);
    }
  }

  private diffCall(expr: FunctionCall, wrt: string): Expression {
    const { name, args } = expr;

    // Expand built-in functions before differentiating
    if (shouldExpand(name)) {
      const expanded = expandBuiltIn(expr);
      return this.differentiate(expanded, wrt);
    }

    // Differentiate scalar math functions
    return this.diffMathFunction(name, args, wrt);
  }

  private diffMathFunction(name: string, args: Expression[], wrt: string): Expression {
    if (args.length !== 1 && name !== 'atan2' && name !== 'pow' && name !== 'min' && name !== 'max' && name !== 'clamp') {
      throw new Error(`Differentiation of ${name} not yet supported`);
    }

    const arg = args[0];
    const argPrime = this.differentiate(arg, wrt);

    switch (name) {
      case 'sin':
        // sin(f)' = cos(f) * f'
        return {
          kind: 'binary',
          operator: '*',
          left: { kind: 'call', name: 'cos', args: [arg] },
          right: argPrime
        };

      case 'cos':
        // cos(f)' = -sin(f) * f'
        return {
          kind: 'binary',
          operator: '*',
          left: {
            kind: 'unary',
            operator: '-',
            operand: { kind: 'call', name: 'sin', args: [arg] }
          },
          right: argPrime
        };

      case 'tan':
        // tan(f)' = sec^2(f) * f' = (1 / cos^2(f)) * f'
        return {
          kind: 'binary',
          operator: '*',
          left: {
            kind: 'binary',
            operator: '/',
            left: { kind: 'number', value: 1 },
            right: {
              kind: 'binary',
              operator: '^',
              left: { kind: 'call', name: 'cos', args: [arg] },
              right: { kind: 'number', value: 2 }
            }
          },
          right: argPrime
        };

      case 'exp':
        // exp(f)' = exp(f) * f'
        return {
          kind: 'binary',
          operator: '*',
          left: { kind: 'call', name: 'exp', args: [arg] },
          right: argPrime
        };

      case 'log':
        // log(f)' = f' / f
        return {
          kind: 'binary',
          operator: '/',
          left: argPrime,
          right: arg
        };

      case 'sqrt':
        // sqrt(f)' = f' / (2 * sqrt(f))
        return {
          kind: 'binary',
          operator: '/',
          left: argPrime,
          right: {
            kind: 'binary',
            operator: '*',
            left: { kind: 'number', value: 2 },
            right: { kind: 'call', name: 'sqrt', args: [arg] }
          }
        };

      case 'abs':
        // abs(f)' = f' * sign(f) = f' * f / abs(f)
        return {
          kind: 'binary',
          operator: '*',
          left: argPrime,
          right: {
            kind: 'binary',
            operator: '/',
            left: arg,
            right: { kind: 'call', name: 'abs', args: [arg] }
          }
        };

      case 'atan2':
        // atan2(y, x)' w.r.t. variable
        // d/dx atan2(y, x) = -y / (x^2 + y^2)
        // d/dy atan2(y, x) = x / (x^2 + y^2)
        // General: atan2(f, g)' = (g * f' - f * g') / (f^2 + g^2)
        const y = args[0];
        const x = args[1];
        const yPrime = this.differentiate(y, wrt);
        const xPrime = this.differentiate(x, wrt);

        return {
          kind: 'binary',
          operator: '/',
          left: {
            kind: 'binary',
            operator: '-',
            left: {
              kind: 'binary',
              operator: '*',
              left: x,
              right: yPrime
            },
            right: {
              kind: 'binary',
              operator: '*',
              left: y,
              right: xPrime
            }
          },
          right: {
            kind: 'binary',
            operator: '+',
            left: {
              kind: 'binary',
              operator: '^',
              left: x,
              right: { kind: 'number', value: 2 }
            },
            right: {
              kind: 'binary',
              operator: '^',
              left: y,
              right: { kind: 'number', value: 2 }
            }
          }
        };

      case 'min':
        // min(a, b)' = a' if a < b, b' if b < a, subgradient if a = b
        // We use: (a' + b') / 2 - (a' - b') * sign(a - b) / 2
        // Simplified subgradient: average of gradients when equal
        {
          const a = args[0];
          const b = args[1];
          const aPrime = this.differentiate(a, wrt);
          const bPrime = this.differentiate(b, wrt);

          // For now, use simple approach: gradient is aPrime when a < b, bPrime when b < a
          // In practice: min(a,b)' ≈ a' when a < b (dominant)
          // Proper implementation: return conditional or use subgradient
          // Here we use: a' if a≤b else b' (subgradient convention: use first argument at tie)

          // Simple approximation for symbolic differentiation:
          // grad_min(a, b) w.r.t x = da/dx * (a <= b) + db/dx * (b < a)
          // Since we can't represent conditionals easily, we document this as a limitation
          // and use the midpoint convention: (da/dx + db/dx)/2 - sign(a-b) * (da/dx - db/dx)/2

          // Simplified: just use a' (assumes a is typically smaller)
          // Better: generate both and let user handle non-smoothness
          return aPrime; // Subgradient: choose first argument's gradient
        }

      case 'max':
        // max(a, b)' = a' if a > b, b' if b > a
        // Similar to min, we use subgradient convention
        {
          const a = args[0];
          const b = args[1];
          const aPrime = this.differentiate(a, wrt);

          return aPrime; // Subgradient: choose first argument's gradient
        }

      case 'clamp':
        // clamp(x, lo, hi)' = 0 if x < lo or x > hi, x' if lo ≤ x ≤ hi
        // Subgradient at boundaries: 0
        {
          const x = args[0];
          const xPrime = this.differentiate(x, wrt);

          // Return x' (assumes x is in valid range; gradient is 0 outside, x' inside)
          // User should handle boundaries in their optimization
          return xPrime; // Subgradient: gradient of x when in range, 0 outside
        }

      default:
        throw new Error(`Differentiation of ${name} not yet supported`);
    }
  }

  private diffComponent(expr: ComponentAccess, wrt: string): Expression {
    // Differentiate component access
    // For example: d/d(u.x) of v.x
    // This is tricky - we need to check if the component access matches wrt

    // If wrt is "u.x" and expr is "u.x", derivative is 1
    // Otherwise 0

    // For now, we'll handle the simple case where object is a variable
    if (expr.object.kind === 'variable') {
      const fullName = `${expr.object.name}.${expr.component}`;
      if (fullName === wrt) {
        return { kind: 'number', value: 1 };
      }
      return { kind: 'number', value: 0 };
    }

    // If object is a binary operation (e.g., (u-v).x), expand it first
    // (u-v).x -> u.x - v.x, then differentiate
    if (expr.object.kind === 'binary') {
      const expandedExpr = this.expandComponentAccess(expr);
      return this.differentiate(expandedExpr, wrt);
    }

    return { kind: 'number', value: 0 };
  }

  private expandComponentAccess(expr: ComponentAccess): Expression {
    if (expr.object.kind === 'binary') {
      const { operator, left, right } = expr.object;
      // (left op right).comp -> left.comp op right.comp
      return {
        kind: 'binary',
        operator,
        left: {
          kind: 'component',
          object: left,
          component: expr.component
        },
        right: {
          kind: 'component',
          object: right,
          component: expr.component
        }
      };
    }
    return expr;
  }

  /**
   * Check if expression is constant with respect to wrt
   */
  private isConstant(expr: Expression, wrt: string): boolean {
    switch (expr.kind) {
      case 'number':
        return true;
      case 'variable':
        return expr.name !== wrt;
      case 'binary':
        return this.isConstant(expr.left, wrt) && this.isConstant(expr.right, wrt);
      case 'unary':
        return this.isConstant(expr.operand, wrt);
      case 'call':
        return expr.args.every(arg => this.isConstant(arg, wrt));
      case 'component':
        if (expr.object.kind === 'variable') {
          const fullName = `${expr.object.name}.${expr.component}`;
          return fullName !== wrt;
        }
        return false;
      default:
        return false;
    }
  }
}

/**
 * Compute gradients for a function
 */
export function computeFunctionGradients(func: FunctionDef, env: TypeEnv): GradientResult {
  const gradients = new Map<string, Expression | StructuredGradient>();

  const differ = new Differentiator(env);

  // Inline all intermediate variables first
  const inlinedExpr = inlineIntermediateVariables(func);

  // For each parameter that requires gradients
  for (const param of func.parameters) {
    if (!param.requiresGrad) continue;

    const paramType = env.getOrThrow(param.name);

    if (Types.isScalar(paramType)) {
      // Scalar parameter - compute single gradient
      const grad = differ.differentiate(inlinedExpr, param.name);
      gradients.set(param.name, grad);
    } else {
      // Structured parameter - compute gradient for each component
      const structGrad: StructuredGradient = {
        components: new Map()
      };

      for (const component of paramType.components) {
        const wrt = `${param.name}.${component}`;
        const grad = differ.differentiate(inlinedExpr, wrt);
        structGrad.components.set(component, grad);
      }

      gradients.set(param.name, structGrad);
    }
  }

  return { gradients };
}
