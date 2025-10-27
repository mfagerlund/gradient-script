/**
 * Code generation for GradientScript DSL
 * Generates TypeScript/JavaScript code with gradient functions
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
  Assignment
} from './AST.js';
import { Type, Types, TypeEnv } from './Types.js';
import { GradientResult, StructuredGradient } from './Differentiation.js';
import { simplifyGradients } from './Simplify.js';
import { eliminateCommonSubexpressionsStructured, eliminateCommonSubexpressions } from './CSE.js';

/**
 * Code generation options
 */
export interface CodeGenOptions {
  format?: 'typescript' | 'javascript' | 'python';
  includeComments?: boolean;
  simplify?: boolean;
  cse?: boolean;
  epsilon?: number;  // Add epsilon guards for zero denominators
  emitGuards?: boolean;  // Emit runtime guards for edge cases
}

/**
 * Code generator for expressions
 */
export class ExpressionCodeGen {
  private format: 'typescript' | 'javascript' | 'python';

  constructor(format: 'typescript' | 'javascript' | 'python' = 'typescript') {
    this.format = format;
  }

  /**
   * Generate code for an expression
   */
  generate(expr: Expression): string {
    switch (expr.kind) {
      case 'number':
        return this.genNumber(expr);
      case 'variable':
        return this.genVariable(expr);
      case 'binary':
        return this.genBinary(expr);
      case 'unary':
        return this.genUnary(expr);
      case 'call':
        return this.genCall(expr);
      case 'component':
        return this.genComponent(expr);
    }
  }

  private genNumber(expr: NumberLiteral): string {
    return String(expr.value);
  }

  private genVariable(expr: Variable): string {
    return expr.name;
  }

  private genBinary(expr: BinaryOp): string {
    // Generate left and right with precedence-aware parentheses
    const left = this.genWithPrecedence(expr.left, expr, 'left');
    const right = this.genWithPrecedence(expr.right, expr, 'right');

    // Handle operator mapping for different formats
    let op = expr.operator;
    if (this.format === 'python' && (op === '^' || op === '**')) {
      op = '**'; // Python uses **
    } else if ((this.format === 'typescript' || this.format === 'javascript') && (op === '^' || op === '**')) {
      // Optimize: x^2 -> x*x, x^3 -> x*x*x (faster than Math.pow)
      // Only for simple expressions (variables, component access)
      const isSimple = expr.left.kind === 'variable' ||
                       expr.left.kind === 'component' ||
                       expr.left.kind === 'number';

      if (isSimple && expr.right.kind === 'number') {
        const exponent = expr.right.value;
        if (Number.isInteger(exponent) && exponent >= 0 && exponent <= 3) {
          if (exponent === 0) {
            return '1';
          } else if (exponent === 1) {
            return left;
          } else if (exponent === 2) {
            return `${left} * ${left}`;
          } else if (exponent === 3) {
            return `${left} * ${left} * ${left}`;
          }
        }
      }
      // Fall back to Math.pow for complex expressions or larger exponents
      return `Math.pow(${left}, ${right})`;
    }

    return `${left} ${op} ${right}`;
  }

  /**
   * Generate expression with parentheses if needed based on precedence
   */
  private genWithPrecedence(expr: Expression, parent: BinaryOp, side: 'left' | 'right'): string {
    // Always parenthesize binary operations that are children of other binary ops
    // unless they have higher precedence
    if (expr.kind === 'binary') {
      const needsParens = this.needsParentheses(expr, parent, side);
      const code = this.generate(expr);
      return needsParens ? `(${code})` : code;
    }

    // Unary expressions need parentheses when they're operands of binary operations
    // with higher or equal precedence, to avoid ambiguity
    if (expr.kind === 'unary') {
      const code = this.generate(expr);
      // Unary minus with binary operation inside needs parens when parent is * or /
      if (parent.operator === '*' || parent.operator === '/' || parent.operator === '^' || parent.operator === '**') {
        return `(${code})`;
      }
      return code;
    }

    return this.generate(expr);
  }

  /**
   * Determine if child expression needs parentheses
   */
  private needsParentheses(child: BinaryOp, parent: BinaryOp, side: 'left' | 'right'): boolean {
    const childPrec = this.getPrecedence(child.operator);
    const parentPrec = this.getPrecedence(parent.operator);

    // Lower precedence always needs parentheses
    if (childPrec < parentPrec) {
      return true;
    }

    // Same precedence: check associativity
    if (childPrec === parentPrec) {
      // For non-associative or right-associative on left side, need parens
      if (side === 'left' && (parent.operator === '/' || parent.operator === '-')) {
        return true;
      }
      // For subtraction/division on right side, need parens
      if (side === 'right' && (child.operator === '+' || child.operator === '-')) {
        return parent.operator === '-';
      }
      if (side === 'right' && (child.operator === '*' || child.operator === '/')) {
        return parent.operator === '/';
      }
    }

    return false;
  }

  /**
   * Get operator precedence (higher number = higher precedence)
   */
  private getPrecedence(op: string): number {
    switch (op) {
      case '+':
      case '-':
        return 1;
      case '*':
      case '/':
        return 2;
      case '^':
      case '**':
        return 3;
      default:
        return 0;
    }
  }

  private genUnary(expr: UnaryOp): string {
    const operand = this.generate(expr.operand);
    return `${expr.operator}${operand}`;
  }

  private genCall(expr: FunctionCall): string {
    const args = expr.args.map(arg => this.generate(arg));

    // Handle clamp specially (not in Math)
    if (expr.name === 'clamp') {
      // clamp(x, min, max) -> Math.max(min, Math.min(max, x))
      if (args.length !== 3) {
        throw new Error('clamp requires 3 arguments: clamp(x, min, max)');
      }
      const [x, min, max] = args;
      if (this.format === 'typescript' || this.format === 'javascript') {
        return `Math.max(${min}, Math.min(${max}, ${x}))`;
      } else if (this.format === 'python') {
        return `max(${min}, min(${max}, ${x}))`;
      }
    }

    // Map function names for different formats
    const funcName = this.mapFunctionName(expr.name);

    return `${funcName}(${args.join(', ')})`;
  }

  private genComponent(expr: ComponentAccess): string {
    const obj = this.generate(expr.object);
    return `${obj}.${expr.component}`;
  }

  private mapFunctionName(name: string): string {
    if (this.format === 'typescript' || this.format === 'javascript') {
      const mathFuncs: Record<string, string> = {
        'sin': 'Math.sin',
        'cos': 'Math.cos',
        'tan': 'Math.tan',
        'asin': 'Math.asin',
        'acos': 'Math.acos',
        'atan': 'Math.atan',
        'atan2': 'Math.atan2',
        'exp': 'Math.exp',
        'log': 'Math.log',
        'sqrt': 'Math.sqrt',
        'abs': 'Math.abs',
        'pow': 'Math.pow',
        'min': 'Math.min',
        'max': 'Math.max'
      };
      return mathFuncs[name] || name;
    } else if (this.format === 'python') {
      const mathFuncs: Record<string, string> = {
        'atan2': 'math.atan2',
        'sin': 'math.sin',
        'cos': 'math.cos',
        'tan': 'math.tan',
        'asin': 'math.asin',
        'acos': 'math.acos',
        'atan': 'math.atan',
        'exp': 'math.exp',
        'log': 'math.log',
        'sqrt': 'math.sqrt',
        'abs': 'abs',
        'pow': 'pow',
        'min': 'min',
        'max': 'max'
      };
      return mathFuncs[name] || name;
    }

    return name;
  }
}

/**
 * Generate complete gradient function code
 */
export function generateGradientFunction(
  func: FunctionDef,
  gradients: GradientResult,
  env: TypeEnv,
  options: CodeGenOptions = {}
): string {
  const format = options.format || 'typescript';
  const includeComments = options.includeComments !== false;
  const shouldSimplify = options.simplify !== false; // Default to true

  // Simplify gradients if requested
  const gradientsToUse = shouldSimplify
    ? { gradients: simplifyGradients(gradients.gradients) }
    : gradients;

  const codegen = new ExpressionCodeGen(format);
  const lines: string[] = [];

  // Function signature
  const paramNames = func.parameters.map(p => p.name).join(', ');

  if (format === 'typescript' || format === 'javascript') {
    lines.push(`function ${func.name}_grad(${paramNames}) {`);
  } else if (format === 'python') {
    lines.push(`def ${func.name}_grad(${paramNames}):`);
  }

  // Forward pass - compute intermediate variables
  // Track which expressions are already computed for CSE reuse
  const forwardPassVars = new Map<string, string>();

  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const expr = codegen.generate(stmt.expression);

      // Track this for CSE reuse (store expression -> variable name mapping)
      forwardPassVars.set(expr, varName);

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${expr};`);
      } else {
        lines.push(`  ${varName} = ${expr}`);
      }
    }
  }

  // Compute output value - reuse forward pass variables if possible
  let valueExpr = func.returnExpr;
  const valueCode = codegen.generate(valueExpr);
  const existingVar = forwardPassVars.get(valueCode);

  if (existingVar) {
    // Reuse existing variable
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const value = ${existingVar};`);
    } else {
      lines.push(`  value = ${existingVar}`);
    }
  } else {
    // Compute new value
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const value = ${valueCode};`);
    } else {
      lines.push(`  value = ${valueCode}`);
    }
  }

  lines.push('');

  // Generate gradients
  const comment = format === 'python' ? '#' : '//';
  if (includeComments) {
    lines.push(`  ${comment} Gradients`);
  }

  // Apply CSE if requested
  const shouldApplyCSE = options.cse !== false; // Default to true
  const cseIntermediates = new Map<string, Expression>();

  if (shouldApplyCSE) {
    // Collect all gradient expressions for CSE analysis
    for (const [paramName, gradient] of gradientsToUse.gradients.entries()) {
      if (isStructuredGradient(gradient)) {
        const cseResult = eliminateCommonSubexpressionsStructured(gradient.components);

        // Merge intermediates
        for (const [name, expr] of cseResult.intermediates.entries()) {
          cseIntermediates.set(name, expr);
        }

        // Update gradient components with CSE-simplified versions
        gradient.components = cseResult.components;
      }
    }

    // Generate intermediate variables from CSE
    if (cseIntermediates.size > 0) {
      // Check if we should emit guards (opt-in)
      const shouldEmitGuards = options.emitGuards === true;
      const epsilon = options.epsilon || 1e-10;

      // Identify potential denominators (sum of squares patterns)
      const denominatorVars = new Set<string>();
      for (const [varName, expr] of cseIntermediates.entries()) {
        const code = codegen.generate(expr);
        // Check if this looks like a denominator (contains + and squared terms)
        if (code.includes('+') && (code.includes('* ') || code.includes('Math.pow'))) {
          denominatorVars.add(varName);
        }
      }

      for (const [varName, expr] of cseIntermediates.entries()) {
        const code = codegen.generate(expr);
        if (format === 'typescript' || format === 'javascript') {
          lines.push(`  const ${varName} = ${code};`);
        } else {
          lines.push(`  ${varName} = ${code}`);
        }
      }

      // Emit epsilon guard if needed
      if (shouldEmitGuards && denominatorVars.size > 0) {
        lines.push('');
        if (includeComments) {
          lines.push(`  ${comment} Guard against division by zero`);
        }
        for (const denom of denominatorVars) {
          if (format === 'typescript' || format === 'javascript') {
            lines.push(`  if (Math.abs(${denom}) < ${epsilon}) {`);
            lines.push(`    ${comment} Return zero gradients for degenerate case`);
            // Emit zero gradient structure
            const zeroGrads: string[] = [];
            for (const [paramName, gradient] of gradientsToUse.gradients.entries()) {
              if (isStructuredGradient(gradient)) {
                const components = Array.from(gradient.components.keys());
                const zeroStruct = components.map(c => `${c}: 0`).join(', ');
                zeroGrads.push(`d${paramName}: { ${zeroStruct} }`);
              } else {
                zeroGrads.push(`d${paramName}: 0`);
              }
            }
            lines.push(`    return { value, ${zeroGrads.join(', ')} };`);
            lines.push(`  }`);
          }
        }
      }

      lines.push('');
    }
  }

  for (const [paramName, gradient] of gradientsToUse.gradients.entries()) {
    // Use shorter names: du, dv instead of grad_u, grad_v
    const gradName = `d${paramName}`;

    if (isStructuredGradient(gradient)) {
      // Structured gradient
      if (includeComments) {
        lines.push(`  ${comment} Gradient for ${paramName}`);
      }

      const components: string[] = [];
      for (const [comp, expr] of gradient.components.entries()) {
        const code = codegen.generate(expr);
        components.push(`${comp}: ${code}`);
      }

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${gradName} = {`);
        for (const comp of components) {
          lines.push(`    ${comp},`);
        }
        lines.push(`  };`);
      } else {
        lines.push(`  ${gradName} = {`);
        for (const comp of components) {
          const [key, value] = comp.split(': ');
          lines.push(`    "${key}": ${value},`);
        }
        lines.push(`  }`);
      }
    } else {
      // Scalar gradient
      const code = codegen.generate(gradient);
      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${gradName} = ${code};`);
      } else {
        lines.push(`  ${gradName} = ${code}`);
      }
    }
  }

  lines.push('');

  // Return result
  const gradNames = Array.from(gradientsToUse.gradients.keys()).map(n => `d${n}`);
  const returnObj = gradNames.map(n => `${n}: ${n}`).join(', ');

  if (format === 'typescript' || format === 'javascript') {
    lines.push(`  return {`);
    lines.push(`    value,`);
    for (const gradName of gradNames) {
      lines.push(`    ${gradName},`);
    }
    lines.push(`  };`);
    lines.push('}');
  } else {
    lines.push(`  return {`);
    lines.push(`    "value": value,`);
    for (const gradName of gradNames) {
      lines.push(`    "${gradName}": ${gradName},`);
    }
    lines.push(`  }`);

  }

  return lines.join('\n');
}

/**
 * Generate the original forward function
 */
export function generateForwardFunction(
  func: FunctionDef,
  options: CodeGenOptions = {}
): string {
  const format = options.format || 'typescript';
  const codegen = new ExpressionCodeGen(format);
  const lines: string[] = [];

  // Function signature
  const paramNames = func.parameters.map(p => p.name).join(', ');

  if (format === 'typescript' || format === 'javascript') {
    lines.push(`function ${func.name}(${paramNames}) {`);
  } else {
    lines.push(`def ${func.name}(${paramNames}):`);
  }

  // Body
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const expr = codegen.generate(stmt.expression);

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${expr};`);
      } else {
        lines.push(`  ${varName} = ${expr}`);
      }
    }
  }

  // Return
  const returnExpr = codegen.generate(func.returnExpr);
  if (format === 'typescript' || format === 'javascript') {
    lines.push(`  return ${returnExpr};`);
    lines.push('}');
  } else {
    lines.push(`  return ${returnExpr}`);
  }

  return lines.join('\n');
}

/**
 * Generate complete output with both forward and gradient functions
 */
export function generateComplete(
  func: FunctionDef,
  gradients: GradientResult,
  env: TypeEnv,
  options: CodeGenOptions = {}
): string {
  const lines: string[] = [];

  const format = options.format || 'typescript';

  if (options.includeComments !== false) {
    const comment = format === 'python' ? '#' : '//';
    lines.push(`${comment} Generated by GradientScript`);
    lines.push('');
  }

  // Forward function
  lines.push(generateForwardFunction(func, options));
  lines.push('');

  // Gradient function
  lines.push(generateGradientFunction(func, gradients, env, options));

  return lines.join('\n');
}

/**
 * Type guard for StructuredGradient
 */
function isStructuredGradient(grad: Expression | StructuredGradient): grad is StructuredGradient {
  return 'components' in grad;
}
