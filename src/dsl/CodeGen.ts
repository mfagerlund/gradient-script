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
import { simplifyGradients, simplifyPostCSE } from './Simplify.js';
import { ExpressionTransformer } from './ExpressionTransformer.js';
import { optimizeWithEGraph } from './egraph/index.js';
import { CodeGenError } from './Errors.js';
import { serializeExpression } from './ExpressionUtils.js';
import { inlineExpression } from './Inliner.js';

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

  // Build substitution map for inlining (to match gradient expressions which are fully inlined)
  const substitutionMap = new Map<string, Expression>();
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      substitutionMap.set(stmt.variable, stmt.expression);
    }
  }

  // Collect forward variable names and expressions for optimization
  const forwardVars = new Set<string>();
  const forwardVarExprs = new Map<string, Expression>();
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      forwardVars.add(stmt.variable);
      forwardVarExprs.set(stmt.variable, stmt.expression);
    }
  }

  // Optimize forward expressions with e-graph
  let optimizedForwardExprs = forwardVarExprs;
  let forwardCseTemps = new Map<string, Expression>();

  if (options.cse !== false && forwardVarExprs.size > 0) {
    const forOptimizer = new Map<string, Map<string, Expression>>();
    forOptimizer.set('_forward', forwardVarExprs);
    const forwardResult = optimizeWithEGraph(forOptimizer, { verbose: false });

    // Rename forward temps to avoid conflicts with gradient temps (use _fwd prefix)
    const rawTemps = forwardResult.intermediates;
    const renameMap = new Map<string, string>();
    for (const oldName of rawTemps.keys()) {
      const newName = oldName.replace('_tmp', '_fwd');
      renameMap.set(oldName, newName);
    }

    // Apply renaming to temp definitions
    for (const [oldName, expr] of rawTemps) {
      const newName = renameMap.get(oldName)!;
      forwardCseTemps.set(newName, renameTempRefs(expr, renameMap));
    }

    // Apply renaming to optimized expressions
    optimizedForwardExprs = new Map();
    for (const [varName, expr] of (forwardResult.gradients.get('_forward') || forwardVarExprs)) {
      optimizedForwardExprs.set(varName, renameTempRefs(expr, renameMap));
    }
  }

  // Helper to rename temp references in an expression
  function renameTempRefs(expr: Expression, renameMap: Map<string, string>): Expression {
    if (expr.kind === 'variable') {
      const newName = renameMap.get(expr.name);
      return newName ? { kind: 'variable', name: newName } : expr;
    } else if (expr.kind === 'binary') {
      return {
        kind: 'binary',
        operator: expr.operator,
        left: renameTempRefs(expr.left, renameMap),
        right: renameTempRefs(expr.right, renameMap)
      };
    } else if (expr.kind === 'unary') {
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: renameTempRefs(expr.operand, renameMap)
      };
    } else if (expr.kind === 'call') {
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(a => renameTempRefs(a, renameMap))
      };
    } else if (expr.kind === 'component') {
      return {
        kind: 'component',
        object: renameTempRefs(expr.object, renameMap),
        component: expr.component
      };
    }
    return expr;
  }

  // Helper to find which forward vars an expression depends on
  function findForwardVarDeps(expr: Expression): Set<string> {
    const deps = new Set<string>();
    function visit(e: Expression): void {
      if (e.kind === 'variable' && forwardVars.has(e.name)) {
        deps.add(e.name);
      } else if (e.kind === 'binary') {
        visit(e.left);
        visit(e.right);
      } else if (e.kind === 'unary') {
        visit(e.operand);
      } else if (e.kind === 'call') {
        e.args.forEach(visit);
      } else if (e.kind === 'component') {
        visit(e.object);
      }
    }
    visit(expr);
    return deps;
  }

  // Track which CSE temps need to be emitted after which forward var
  const fwdTempAfterVar = new Map<string, Array<{ name: string; expr: Expression }>>();
  const fwdTempsBeforeAny: Array<{ name: string; expr: Expression }> = [];

  for (const [tempName, tempExpr] of forwardCseTemps) {
    const deps = findForwardVarDeps(tempExpr);
    if (deps.size === 0) {
      fwdTempsBeforeAny.push({ name: tempName, expr: tempExpr });
    } else {
      let lastDep = '';
      for (const stmt of func.body) {
        if (stmt.kind === 'assignment' && deps.has(stmt.variable)) {
          lastDep = stmt.variable;
        }
      }
      if (lastDep) {
        if (!fwdTempAfterVar.has(lastDep)) {
          fwdTempAfterVar.set(lastDep, []);
        }
        fwdTempAfterVar.get(lastDep)!.push({ name: tempName, expr: tempExpr });
      }
    }
  }

  // Emit forward CSE temps that don't depend on forward vars
  for (const { name: tempName, expr } of fwdTempsBeforeAny) {
    const code = codegen.generate(expr);
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const ${tempName} = ${code};`);
    } else if (format === 'python') {
      lines.push(`  ${tempName} = ${code}`);
    } else if (format === 'csharp') {
      lines.push(`    ${csharpFloatType} ${tempName} = ${code};`);
    }
  }

  // Generate forward variable assignments with interleaved temps
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const expr = optimizedForwardExprs.get(varName) || stmt.expression;
      const generatedExpr = codegen.generate(expr);

      if (shouldTrackForForwardReuse(stmt.expression)) {
        // Register the original expression
        const exprKey = serializeExpression(stmt.expression);
        if (!forwardExpressionMap.has(exprKey)) {
          forwardExpressionMap.set(exprKey, varName);
        }

        // Also register the fully inlined form (this is what gradient expressions will have)
        const inlinedExpr = inlineExpression(stmt.expression, substitutionMap);
        const inlinedKey = serializeExpression(inlinedExpr);
        if (inlinedKey !== exprKey && !forwardExpressionMap.has(inlinedKey)) {
          forwardExpressionMap.set(inlinedKey, varName);
        }
      }

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${generatedExpr};`);
      } else if (format === 'python') {
        lines.push(`  ${varName} = ${generatedExpr}`);
      } else if (format === 'csharp') {
        lines.push(`    ${csharpFloatType} ${varName} = ${generatedExpr};`);
      }

      // Emit any forward CSE temps that depend on this var
      const tempsForVar = fwdTempAfterVar.get(varName) || [];
      for (const { name: tempName, expr: tempExpr } of tempsForVar) {
        const tempCode = codegen.generate(tempExpr);
        if (format === 'typescript' || format === 'javascript') {
          lines.push(`  const ${tempName} = ${tempCode};`);
        } else if (format === 'python') {
          lines.push(`  ${tempName} = ${tempCode}`);
        } else if (format === 'csharp') {
          lines.push(`    ${csharpFloatType} ${tempName} = ${tempCode};`);
        }
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

  // Apply e-graph optimization (CSE + algebraic simplification)
  const shouldApplyCSE = options.cse !== false; // Default to true
  let cseIntermediates = new Map<string, Expression>();

  if (shouldApplyCSE) {
    // Collect all gradient components into a single map for global optimization
    const allGradientComponents = new Map<string, Map<string, Expression>>();
    for (const [paramName, gradient] of gradientsToUse.gradients.entries()) {
      if (isStructuredGradient(gradient)) {
        allGradientComponents.set(paramName, gradient.components);
      }
    }

    // Run e-graph optimization globally across ALL gradient expressions
    const globalCSE = optimizeWithEGraph(allGradientComponents, { verbose: false });
    cseIntermediates = globalCSE.intermediates;

    // Update gradient components with optimized versions
    for (const [paramName, simplifiedComponents] of globalCSE.gradients.entries()) {
      const gradient = gradientsToUse.gradients.get(paramName);
      if (gradient && isStructuredGradient(gradient)) {
        gradient.components = simplifiedComponents;
      }
    }

    // Post-CSE simplification: apply rules that were skipped to avoid CSE interference
    // Specifically: a + a → 2 * a (now safe because temps have been extracted)
    for (const [varName, expr] of cseIntermediates) {
      cseIntermediates.set(varName, simplifyPostCSE(expr));
    }
    for (const [paramName, gradient] of gradientsToUse.gradients.entries()) {
      if (isStructuredGradient(gradient)) {
        for (const [comp, expr] of gradient.components.entries()) {
          gradient.components.set(comp, simplifyPostCSE(expr));
        }
      }
    }
  }

  // Generate CSE intermediate variables
  if (cseIntermediates.size > 0) {
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
    lines.push('');
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
 * Generate the original forward function (with optional e-graph optimization)
 */
export function generateForwardFunction(
  func: FunctionDef,
  options: CodeGenOptions = {}
): string {
  const format = options.format || 'typescript';
  const csharpFloatType = options.csharpFloatType || 'float';
  const shouldOptimize = options.cse !== false; // Optimize by default
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
        return `${capitalize(p.name)}Struct ${p.name}`;
      }
      return `${floatType} ${p.name}`;
    }).join(', ');

    lines.push(`public static ${floatType} ${capitalize(func.name)}(${params})`);
    lines.push('{');
  }

  // Collect all forward variable names (for dependency tracking)
  const forwardVars = new Set<string>();
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      forwardVars.add(stmt.variable);
    }
  }

  // Collect expressions for optimization
  const varExpressions = new Map<string, Expression>();
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      varExpressions.set(stmt.variable, stmt.expression);
    }
  }

  // Optimize with e-graph if enabled
  let optimizedExprs = varExpressions;
  let cseTemps = new Map<string, Expression>();

  if (shouldOptimize && varExpressions.size > 0) {
    const forOptimizer = new Map<string, Map<string, Expression>>();
    forOptimizer.set('_forward', varExpressions);
    const result = optimizeWithEGraph(forOptimizer, { verbose: false });
    cseTemps = result.intermediates;
    optimizedExprs = result.gradients.get('_forward') || varExpressions;
  }

  // Helper to find which forward vars an expression depends on
  function findForwardVarDeps(expr: Expression): Set<string> {
    const deps = new Set<string>();
    function visit(e: Expression): void {
      if (e.kind === 'variable' && forwardVars.has(e.name)) {
        deps.add(e.name);
      } else if (e.kind === 'binary') {
        visit(e.left);
        visit(e.right);
      } else if (e.kind === 'unary') {
        visit(e.operand);
      } else if (e.kind === 'call') {
        e.args.forEach(visit);
      } else if (e.kind === 'component') {
        visit(e.object);
      }
    }
    visit(expr);
    return deps;
  }

  // Track which temps need to be emitted after which forward var
  const tempAfterVar = new Map<string, Array<{ name: string; expr: Expression }>>();
  const tempsEmittedBeforeAny: Array<{ name: string; expr: Expression }> = [];

  for (const [tempName, tempExpr] of cseTemps) {
    const deps = findForwardVarDeps(tempExpr);
    if (deps.size === 0) {
      // Temp only depends on params - emit before any forward vars
      tempsEmittedBeforeAny.push({ name: tempName, expr: tempExpr });
    } else {
      // Find the last forward var this temp depends on
      let lastDep = '';
      for (const stmt of func.body) {
        if (stmt.kind === 'assignment' && deps.has(stmt.variable)) {
          lastDep = stmt.variable;
        }
      }
      if (lastDep) {
        if (!tempAfterVar.has(lastDep)) {
          tempAfterVar.set(lastDep, []);
        }
        tempAfterVar.get(lastDep)!.push({ name: tempName, expr: tempExpr });
      }
    }
  }

  // Emit temps that don't depend on forward vars
  for (const { name: tempName, expr } of tempsEmittedBeforeAny) {
    const code = codegen.generate(expr);
    if (format === 'typescript' || format === 'javascript') {
      lines.push(`  const ${tempName} = ${code};`);
    } else if (format === 'python') {
      lines.push(`  ${tempName} = ${code}`);
    } else if (format === 'csharp') {
      lines.push(`    ${csharpFloatType} ${tempName} = ${code};`);
    }
  }

  // Generate variable assignments with interleaved temps
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      const varName = stmt.variable;
      const expr = optimizedExprs.get(varName) || stmt.expression;
      const code = codegen.generate(expr);

      if (format === 'typescript' || format === 'javascript') {
        lines.push(`  const ${varName} = ${code};`);
      } else if (format === 'python') {
        lines.push(`  ${varName} = ${code}`);
      } else if (format === 'csharp') {
        lines.push(`    ${csharpFloatType} ${varName} = ${code};`);
      }

      // Emit any temps that depend on this var
      const tempsForVar = tempAfterVar.get(varName) || [];
      for (const { name: tempName, expr: tempExpr } of tempsForVar) {
        const tempCode = codegen.generate(tempExpr);
        if (format === 'typescript' || format === 'javascript') {
          lines.push(`  const ${tempName} = ${tempCode};`);
        } else if (format === 'python') {
          lines.push(`  ${tempName} = ${tempCode}`);
        } else if (format === 'csharp') {
          lines.push(`    ${csharpFloatType} ${tempName} = ${tempCode};`);
        }
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

