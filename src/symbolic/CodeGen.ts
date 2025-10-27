/**
 * Code generator for symbolic gradients.
 * Generates executable JavaScript/TypeScript code with mathematical annotations.
 * @internal
 */

import {
  ASTNode,
  ASTVisitor,
  NumberNode,
  VariableNode,
  BinaryOpNode,
  UnaryOpNode,
  FunctionCallNode,
  VectorAccessNode,
  VectorConstructorNode,
  Program
} from './AST';

/**
 * Code generation visitor - generates JavaScript expressions
 */
class CodeGenVisitor implements ASTVisitor<string> {
  visitNumber(node: NumberNode): string {
    return String(node.value);
  }

  visitVariable(node: VariableNode): string {
    return node.name;
  }

  visitUnaryOp(node: UnaryOpNode): string {
    const operand = node.operand.accept(this);

    // Add parentheses if operand is complex
    if (needsParens(node.operand)) {
      return `${node.op}(${operand})`;
    }

    return `${node.op}${operand}`;
  }

  visitBinaryOp(node: BinaryOpNode): string {
    const left = node.left.accept(this);
    const right = node.right.accept(this);

    // Handle precedence with parentheses
    const leftStr = needsParens(node.left, node.op) ? `(${left})` : left;
    const rightStr = needsParens(node.right, node.op, 'right') ? `(${right})` : right;

    if (node.op === '**') {
      return `Math.pow(${leftStr}, ${rightStr})`;
    }

    return `${leftStr} ${node.op} ${rightStr}`;
  }

  visitFunctionCall(node: FunctionCallNode): string {
    const args = node.args.map(arg => arg.accept(this)).join(', ');

    // Map function names to Math functions
    const funcMap: Record<string, string> = {
      'sin': 'Math.sin',
      'cos': 'Math.cos',
      'tan': 'Math.tan',
      'asin': 'Math.asin',
      'acos': 'Math.acos',
      'atan': 'Math.atan',
      'sinh': 'Math.sinh',
      'cosh': 'Math.cosh',
      'tanh': 'Math.tanh',
      'exp': 'Math.exp',
      'log': 'Math.log',
      'ln': 'Math.log',
      'sqrt': 'Math.sqrt',
      'abs': 'Math.abs',
      'sign': 'Math.sign',
      'floor': 'Math.floor',
      'ceil': 'Math.ceil',
      'round': 'Math.round',
      'pow': 'Math.pow',
      'min': 'Math.min',
      'max': 'Math.max',
      'atan2': 'Math.atan2',
      'heaviside': '(x => x > 0 ? 1 : 0)',
      'sigmoid': '(x => 1 / (1 + Math.exp(-x)))'
    };

    const funcName = funcMap[node.name] || node.name;

    return `${funcName}(${args})`;
  }

  visitVectorAccess(node: VectorAccessNode): string {
    const vector = node.vector.accept(this);
    return `${vector}.${node.component}`;
  }

  visitVectorConstructor(node: VectorConstructorNode): string {
    const components = node.components.map(c => c.accept(this)).join(', ');
    return `${node.vectorType}(${components})`;
  }
}

/**
 * Check if node needs parentheses based on operator precedence
 */
function needsParens(node: ASTNode, parentOp?: string, position: 'left' | 'right' = 'left'): boolean {
  if (node.type === 'Number' || node.type === 'Variable' ||
      node.type === 'FunctionCall' || node.type === 'VectorAccess') {
    return false;
  }

  if (node.type === 'UnaryOp') {
    return false; // Unary operators have high precedence
  }

  if (node.type === 'BinaryOp' && parentOp) {
    const binNode = node as BinaryOpNode;
    const nodePrecedence = getPrecedence(binNode.op);
    const parentPrecedence = getPrecedence(parentOp);

    // Need parens if lower precedence
    if (nodePrecedence < parentPrecedence) {
      return true;
    }

    // For same precedence, check associativity
    if (nodePrecedence === parentPrecedence) {
      // Right-associative operators: ** (power)
      if (parentOp === '**') {
        return position === 'left'; // Left operand needs parens
      }

      // Left-associative: need parens on right for -, /
      if ((parentOp === '-' || parentOp === '/') && position === 'right') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get operator precedence (higher = tighter binding)
 */
function getPrecedence(op: string): number {
  switch (op) {
    case '+':
    case '-':
      return 1;
    case '*':
    case '/':
      return 2;
    case '**':
      return 3;
    default:
      return 0;
  }
}

/**
 * Generate mathematical notation for expressions (LaTeX-style comments)
 */
class MathNotationVisitor implements ASTVisitor<string> {
  visitNumber(node: NumberNode): string {
    return String(node.value);
  }

  visitVariable(node: VariableNode): string {
    return node.name;
  }

  visitUnaryOp(node: UnaryOpNode): string {
    const operand = node.operand.accept(this);

    if (needsParens(node.operand)) {
      return `${node.op}(${operand})`;
    }

    return `${node.op}${operand}`;
  }

  visitBinaryOp(node: BinaryOpNode): string {
    const left = node.left.accept(this);
    const right = node.right.accept(this);

    const leftStr = needsParens(node.left, node.op) ? `(${left})` : left;
    const rightStr = needsParens(node.right, node.op, 'right') ? `(${right})` : right;

    if (node.op === '**') {
      return `${leftStr}^${rightStr}`;
    }

    return `${leftStr} ${node.op} ${rightStr}`;
  }

  visitFunctionCall(node: FunctionCallNode): string {
    const args = node.args.map(arg => arg.accept(this)).join(', ');
    return `${node.name}(${args})`;
  }

  visitVectorAccess(node: VectorAccessNode): string {
    const vector = node.vector.accept(this);
    return `${vector}.${node.component}`;
  }

  visitVectorConstructor(node: VectorConstructorNode): string {
    const components = node.components.map(c => c.accept(this)).join(', ');
    return `${node.vectorType}(${components})`;
  }
}

/**
 * Generate JavaScript code from AST
 */
export function generateCode(node: ASTNode): string {
  const visitor = new CodeGenVisitor();
  return node.accept(visitor);
}

/**
 * Generate mathematical notation from AST
 */
export function generateMathNotation(node: ASTNode): string {
  const visitor = new MathNotationVisitor();
  return node.accept(visitor);
}

/**
 * Generate complete gradient computation code
 */
export interface CodeGenOptions {
  /** Include mathematical notation as comments */
  includeMath?: boolean;
  /** Variable declaration style */
  varStyle?: 'const' | 'let' | 'var';
  /** Include forward pass computation */
  includeForward?: boolean;
  /** Format code with indentation */
  indent?: string;
}

/**
 * Generate complete gradient code for a program
 */
export function generateGradientCode(
  program: Program,
  gradients: Map<string, ASTNode>,
  options: CodeGenOptions = {}
): string {
  const {
    includeMath = true,
    varStyle = 'const',
    includeForward = true,
    indent = '  '
  } = options;

  const lines: string[] = [];

  // Header comment
  lines.push('// Auto-generated gradient computation');
  lines.push('// Generated by ScalarAutograd symbolic differentiation');
  lines.push('');

  if (includeForward) {
    lines.push('// Forward pass');

    for (const assignment of program.assignments) {
      const code = generateCode(assignment.expression);

      if (includeMath) {
        const math = generateMathNotation(assignment.expression);
        lines.push(`// ${assignment.variable} = ${math}`);
      }

      lines.push(`${varStyle} ${assignment.variable} = ${code};`);
      lines.push('');
    }

    lines.push('// Gradient computation (reverse-mode autodiff)');
    lines.push('');
  }

  // Generate gradients in topological order
  const paramNames = Array.from(gradients.keys()).filter(name => name !== program.output);

  for (const param of paramNames) {
    const gradNode = gradients.get(param);
    if (!gradNode) continue;

    const code = generateCode(gradNode);

    if (includeMath) {
      const math = generateMathNotation(gradNode);
      lines.push(`// ∂${program.output}/∂${param} = ${math}`);
    }

    lines.push(`${varStyle} grad_${param} = ${code};`);
    lines.push('');
  }

  // Export result
  lines.push('// Result');
  lines.push(`${varStyle} result = {`);
  lines.push(`${indent}value: ${program.output},`);
  lines.push(`${indent}gradients: {`);
  for (const param of paramNames) {
    lines.push(`${indent}${indent}${param}: grad_${param},`);
  }
  lines.push(`${indent}}`);
  lines.push('};');

  return lines.join('\n');
}

/**
 * Generate gradient code as a function
 */
export function generateGradientFunction(
  program: Program,
  gradients: Map<string, ASTNode>,
  functionName: string,
  parameters: string[],
  options: CodeGenOptions = {}
): string {
  const {
    includeMath = true,
    indent = '  '
  } = options;

  const lines: string[] = [];

  // Function signature
  lines.push(`/**`);
  lines.push(` * Compute ${program.output} and its gradients`);
  for (const param of parameters) {
    lines.push(` * @param ${param} - Input parameter`);
  }
  lines.push(` * @returns Object with value and gradients`);
  lines.push(` */`);
  lines.push(`function ${functionName}(${parameters.join(', ')}) {`);

  // Forward pass
  if (includeMath) {
    lines.push(`${indent}// Forward pass`);
  }

  for (const assignment of program.assignments) {
    const code = generateCode(assignment.expression);

    if (includeMath) {
      const math = generateMathNotation(assignment.expression);
      lines.push(`${indent}// ${assignment.variable} = ${math}`);
    }

    lines.push(`${indent}const ${assignment.variable} = ${code};`);
  }

  lines.push('');

  if (includeMath) {
    lines.push(`${indent}// Gradient computation`);
  }

  // Gradients
  for (const param of parameters) {
    const gradNode = gradients.get(param);
    if (!gradNode) continue;

    const code = generateCode(gradNode);

    if (includeMath) {
      const math = generateMathNotation(gradNode);
      lines.push(`${indent}// ∂${program.output}/∂${param} = ${math}`);
    }

    lines.push(`${indent}const grad_${param} = ${code};`);
  }

  lines.push('');
  lines.push(`${indent}return {`);
  lines.push(`${indent}${indent}value: ${program.output},`);
  lines.push(`${indent}${indent}gradients: { ${parameters.map(p => `${p}: grad_${p}`).join(', ')} }`);
  lines.push(`${indent}};`);
  lines.push('}');

  return lines.join('\n');
}
