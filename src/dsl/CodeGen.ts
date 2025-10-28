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
import { ExpressionTransformer } from './ExpressionTransformer.js';
import { eliminateCommonSubexpressionsStructured, eliminateCommonSubexpressions } from './CSE.js';
import { CodeGenError } from './Errors.js';
import { serializeExpression } from './ExpressionUtils.js';

/**
 * Code generation options
 */
export interface CodeGenOptions {
  format?: 'typescript' | 'javascript' | 'python' | 'csharp';
  includeComments?: boolean;
  simplify?: boolean;
  cse?: boolean;
  epsilon?: number;  // Add epsilon guards for zero denominators
  emitGuards?: boolean;  // Emit runtime guards for edge cases
  csharpFloatType?: 'float' | 'double';  // C# float precision
  csharpNamingConvention?: 'camelCase' | 'PascalCase';  // C# naming convention
}
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function shouldTrackForForwardReuse(expr: Expression): boolean {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return false;
    default:
      return true;
  }
}
/**
 * Code generator for expressions
 */
export class ExpressionCodeGen {
  private format: 'typescript' | 'javascript' | 'python' | 'csharp';
  private csharpFloatType: 'float' | 'double';

  constructor(
    format: 'typescript' | 'javascript' | 'python' | 'csharp' = 'typescript',
    csharpFloatType: 'float' | 'double' = 'float'
  ) {
    this.format = format;
    this.csharpFloatType = csharpFloatType;
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
    } else if ((this.format === 'typescript' || this.format === 'javascript' || this.format === 'csharp') && (op === '^' || op === '**')) {
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
      // Fall back to Math.pow / MathF.Pow for complex expressions or larger exponents
      if (this.format === 'csharp') {
        const mathClass = this.csharpFloatType === 'float' ? 'MathF' : 'Math';
        return `${mathClass}.Pow(${left}, ${right})`;
      } else {
        return `Math.pow(${left}, ${right})`;
      }
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
      if (args.length !== 3) {
        throw new CodeGenError(
          'clamp requires 3 arguments: clamp(x, min, max)',
          expr.name,
          this.format
        );
      }
      const [x, min, max] = args;
      if (this.format === 'typescript' || this.format === 'javascript') {
        return `Math.max(${min}, Math.min(${max}, ${x}))`;
      } else if (this.format === 'python') {
        return `max(${min}, min(${max}, ${x}))`;
      } else if (this.format === 'csharp') {
        const mathClass = this.csharpFloatType === 'float' ? 'MathF' : 'Math';
        return `${mathClass}.Max(${min}, ${mathClass}.Min(${max}, ${x}))`;
      }
    }

    // Map function names for different formats
    const funcName = this.mapFunctionName(expr.name);

    return `${funcName}(${args.join(', ')})`;
  }

  private genComponent(expr: ComponentAccess): string {
    const obj = this.generate(expr.object);
    if (this.format === 'csharp') {
      // C# uses PascalCase for properties
      return `${obj}.${capitalize(expr.component)}`;
    }
    return `${obj}.${expr.component}`;
  }

  // Math functions that should be mapped across all formats
  private static readonly MATH_FUNCTIONS = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'exp', 'log', 'sqrt', 'abs', 'pow', 'min', 'max'
  ] as const;

  // Python built-in functions that don't need the math. prefix
  private static readonly PYTHON_BUILTINS = ['abs', 'pow', 'min', 'max'];

  private mapFunctionName(name: string): string {
    // Check if this is a known math function
    if (!ExpressionCodeGen.MATH_FUNCTIONS.includes(name as any)) {
      return name;
    }

    // Define format-specific mappers
    const mappers: Record<string, (fn: string) => string> = {
      typescript: (fn) => `Math.${fn}`,
      javascript: (fn) => `Math.${fn}`,
      python: (fn) =>
        ExpressionCodeGen.PYTHON_BUILTINS.includes(fn) ? fn : `math.${fn}`,
      csharp: (fn) => {
        const mathClass = this.csharpFloatType === 'float' ? 'MathF' : 'Math';
        const capitalized = fn.charAt(0).toUpperCase() + fn.slice(1);
        return `${mathClass}.${capitalized}`;
      }
    };

    const mapper = mappers[this.format];
    return mapper ? mapper(name) : name;
  }
}

/**
 * Generate C# struct for gradient return type
 */
function generateCSharpGradientStruct(
  func: FunctionDef,
  gradients: GradientResult,
  floatType: string
): string[] {
  const lines: string[] = [];
  const structName = `${capitalize(func.name)}GradResult`;

  lines.push(`public struct ${structName}`);
  lines.push('{');
  lines.push(`    public ${floatType} Value;`);

  for (const [paramName, gradient] of gradients.gradients.entries()) {
    const propName = capitalize(`d${paramName}`);
    if (isStructuredGradient(gradient)) {
      // Generate a nested struct type for structured gradients
      const components = Array.from(gradient.components.keys());
      lines.push(`    public ${capitalize(paramName)}Grad ${propName};`);
    } else {
      lines.push(`    public ${floatType} ${propName};`);
    }
  }

  lines.push('}');

  // Generate nested struct types for structured gradients
  for (const [paramName, gradient] of gradients.gradients.entries()) {
    if (isStructuredGradient(gradient)) {
      lines.push('');
      lines.push(`public struct ${capitalize(paramName)}Grad`);
      lines.push('{');
      for (const comp of gradient.components.keys()) {
        lines.push(`    public ${floatType} ${capitalize(comp)};`);
      }
      lines.push('}');
    }
  }

  return lines;
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
  const csharpFloatType = options.csharpFloatType || 'float';
  const includeComments = options.includeComments !== false;
  const shouldSimplify = options.simplify !== false; // Default to true

  // Note: We don't simplify here yet - we'll do it after forward expression substitution
  const gradientsToUse = gradients;

  const codegen = new ExpressionCodeGen(format, csharpFloatType);
  const lines: string[] = [];

  // For C#, we need to generate a struct for the return type first
  if (format === 'csharp') {
    lines.push(...generateCSharpGradientStruct(func, gradientsToUse, csharpFloatType));
    lines.push('');
  }

  // Function signature
  const paramNames = func.parameters.map(p => p.name).join(', ');

  if (format === 'typescript' || format === 'javascript') {
    lines.push(`function ${func.name}_grad(${paramNames}) {`);
  } else if (format === 'python') {
    lines.push(`def ${func.name}_grad(${paramNames}):`);
  } else if (format === 'csharp') {
    const params = func.parameters.map(p => {
      if (p.paramType && p.paramType.components) {
        return `${capitalize(p.name)}Struct ${p.name}`;
      }
      return `${csharpFloatType} ${p.name}`;
    }).join(', ');
    const returnType = `${capitalize(func.name)}GradResult`;
    lines.push(`public static ${returnType} ${capitalize(func.name)}_Grad(${params})`);
    lines.push('{');
  }

  // Forward pass - compute intermediate variables
  // Track which expressions are already computed for CSE reuse
  const forwardExpressionMap = new Map<string, string>();

  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const generatedExpr = codegen.generate(stmt.expression);

      if (shouldTrackForForwardReuse(stmt.expression)) {
        const exprKey = serializeExpression(stmt.expression);
        if (!forwardExpressionMap.has(exprKey)) {
          forwardExpressionMap.set(exprKey, varName);
        }
      }

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${generatedExpr};`);
      } else if (format === 'python') {
        lines.push(`  ${varName} = ${generatedExpr}`);
      } else if (format === 'csharp') {
        lines.push(`    ${csharpFloatType} ${varName} = ${generatedExpr};`);
      }
    }
  }

  // Compute output value - reuse forward pass variables if possible
  const valueExpr = func.returnExpr;
  const valueKey = serializeExpression(valueExpr);
  const existingVar = forwardExpressionMap.get(valueKey);
  const valueCode = codegen.generate(valueExpr);

  if (existingVar) {
    // Reuse existing variable
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const value = ${existingVar};`);
    } else if (format === 'python') {
      lines.push(`  value = ${existingVar}`);
    } else if (format === 'csharp') {
      lines.push(`    ${csharpFloatType} value = ${existingVar};`);
    }
  } else {
    // Compute new value
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const value = ${valueCode};`);
    } else if (format === 'python') {
      lines.push(`  value = ${valueCode}`);
    } else if (format === 'csharp') {
      lines.push(`    ${csharpFloatType} value = ${valueCode};`);
    }
    if (shouldTrackForForwardReuse(valueExpr) && !forwardExpressionMap.has(valueKey)) {
      forwardExpressionMap.set(valueKey, 'value');
    }
  }

  // Apply forward expression substitution multiple times until no more changes
  // This handles nested expressions like sqrt(dx*dx + dy*dy) where dx = pix - pjx
  reuseForwardExpressionsInGradients(gradientsToUse.gradients, forwardExpressionMap);
  reuseForwardExpressionsInGradients(gradientsToUse.gradients, forwardExpressionMap);
  reuseForwardExpressionsInGradients(gradientsToUse.gradients, forwardExpressionMap);

  // Simplify gradients after forward expression substitution
  if (shouldSimplify) {
    const simplified = simplifyGradients(gradientsToUse.gradients);
    gradientsToUse.gradients.clear();
    for (const [key, value] of simplified.entries()) {
      gradientsToUse.gradients.set(key, value);
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
        } else if (format === 'python') {
          lines.push(`  ${varName} = ${code}`);
        } else if (format === 'csharp') {
          lines.push(`    ${csharpFloatType} ${varName} = ${code};`);
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
      } else if (format === 'python') {
        lines.push(`  ${gradName} = {`);
        for (const comp of components) {
          const [key, value] = comp.split(': ');
          lines.push(`    "${key}": ${value},`);
        }
        lines.push(`  }`);
      } else if (format === 'csharp') {
        lines.push(`    var ${gradName} = new ${capitalize(paramName)}Grad`);
        lines.push(`    {`);
        for (const comp of components) {
          const [key, value] = comp.split(': ');
          lines.push(`        ${capitalize(key)} = ${value},`);
        }
        lines.push(`    };`);
      }
    } else {
      // Scalar gradient
      const code = codegen.generate(gradient);
      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${gradName} = ${code};`);
      } else if (format === 'python') {
        lines.push(`  ${gradName} = ${code}`);
      } else if (format === 'csharp') {
        lines.push(`    ${csharpFloatType} ${gradName} = ${code};`);
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
  } else if (format === 'python') {
    lines.push(`  return {`);
    lines.push(`    "value": value,`);
    for (const gradName of gradNames) {
      lines.push(`    "${gradName}": ${gradName},`);
    }
    lines.push(`  }`);
  } else if (format === 'csharp') {
    lines.push(`    return new ${capitalize(func.name)}GradResult`);
    lines.push(`    {`);
    lines.push(`        Value = value,`);
    for (const gradName of gradNames) {
      lines.push(`        ${capitalize(gradName)} = ${gradName},`);
    }
    lines.push(`    };`);
    lines.push('}');
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
  const csharpFloatType = options.csharpFloatType || 'float';
  const codegen = new ExpressionCodeGen(format, csharpFloatType);
  const lines: string[] = [];

  // Function signature
  const paramNames = func.parameters.map(p => p.name).join(', ');

  if (format === 'typescript' || format === 'javascript') {
    lines.push(`function ${func.name}(${paramNames}) {`);
  } else if (format === 'python') {
    lines.push(`def ${func.name}(${paramNames}):`);
  } else if (format === 'csharp') {
    const floatType = csharpFloatType;
    const params = func.parameters.map(p => {
      if (p.paramType && p.paramType.components) {
        // Structured parameter - create a struct type name
        return `${capitalize(p.name)}Struct ${p.name}`;
      }
      return `${floatType} ${p.name}`;
    }).join(', ');

    // Generate struct definitions for structured parameters first (we'll prepend them later)
    lines.push(`public static ${floatType} ${capitalize(func.name)}(${params})`);
    lines.push('{');
  }

  // Body
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const expr = codegen.generate(stmt.expression);

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${expr};`);
      } else if (format === 'python') {
        lines.push(`  ${varName} = ${expr}`);
      } else if (format === 'csharp') {
        lines.push(`    ${csharpFloatType} ${varName} = ${expr};`);
      }
    }
  }

  // Return
  const returnExpr = codegen.generate(func.returnExpr);
  if (format === 'typescript' || format === 'javascript') {
    lines.push(`  return ${returnExpr};`);
    lines.push('}');
  } else if (format === 'python') {
    lines.push(`  return ${returnExpr}`);
  } else if (format === 'csharp') {
    lines.push(`    return ${returnExpr};`);
    lines.push('}');
  }

  // For C#, prepend struct definitions
  if (format === 'csharp') {
    const structLines: string[] = [];
    for (const param of func.parameters) {
      if (param.paramType && param.paramType.components) {
        structLines.push(`public struct ${capitalize(param.name)}Struct`);
        structLines.push('{');
        for (const comp of param.paramType.components) {
          structLines.push(`    public ${csharpFloatType} ${capitalize(comp)};`);
        }
        structLines.push('}');
        structLines.push('');
      }
    }
    if (structLines.length > 0) {
      return structLines.join('\n') + lines.join('\n');
    }
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

class ForwardExpressionSubstituter extends ExpressionTransformer {
  constructor(private readonly forwardExpressions: Map<string, string>) {
    super();
  }

  override transform(expr: Expression): Expression {
    const key = serializeExpression(expr);
    const varName = this.forwardExpressions.get(key);
    if (varName) {
      return {
        kind: 'variable',
        name: varName
      };
    }
    return super.transform(expr);
  }
}

function reuseForwardExpressionsInGradients(
  gradients: Map<string, Expression | StructuredGradient>,
  forwardExpressions: Map<string, string>
): void {
  if (forwardExpressions.size === 0) {
    return;
  }

  const substituter = new ForwardExpressionSubstituter(forwardExpressions);

  for (const [paramName, gradient] of gradients.entries()) {
    if (isStructuredGradient(gradient)) {
      for (const [component, expr] of gradient.components.entries()) {
        gradient.components.set(component, substituter.transform(expr));
      }
    } else {
      gradients.set(paramName, substituter.transform(gradient));
    }
  }
}

/**
 * Type guard for StructuredGradient
 */
function isStructuredGradient(grad: Expression | StructuredGradient): grad is StructuredGradient {
  return 'components' in grad;
}
