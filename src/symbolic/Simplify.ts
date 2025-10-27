/**
 * Expression simplification for symbolic gradients.
 * Applies algebraic simplification rules to make formulas more readable.
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
  VectorConstructorNode
} from './AST';

/**
 * Simplification visitor
 */
class SimplificationVisitor implements ASTVisitor<ASTNode> {
  visitNumber(node: NumberNode): ASTNode {
    return node;
  }

  visitVariable(node: VariableNode): ASTNode {
    return node;
  }

  visitUnaryOp(node: UnaryOpNode): ASTNode {
    const operand = node.operand.accept(this);

    // Simplify -(-x) = x
    if (node.op === '-' && operand.type === 'UnaryOp') {
      const unary = operand as UnaryOpNode;
      if (unary.op === '-') {
        return unary.operand;
      }
    }

    // Simplify -(0) = 0
    if (node.op === '-' && operand.type === 'Number') {
      return new NumberNode(-(operand as NumberNode).value);
    }

    // Simplify +(x) = x
    if (node.op === '+') {
      return operand;
    }

    return new UnaryOpNode(node.op, operand);
  }

  visitBinaryOp(node: BinaryOpNode): ASTNode {
    // First simplify children
    const left = node.left.accept(this);
    const right = node.right.accept(this);

    // Get numeric values if both are numbers
    const leftNum = left.type === 'Number' ? (left as NumberNode).value : null;
    const rightNum = right.type === 'Number' ? (right as NumberNode).value : null;

    // Constant folding
    if (leftNum !== null && rightNum !== null) {
      switch (node.op) {
        case '+': return new NumberNode(leftNum + rightNum);
        case '-': return new NumberNode(leftNum - rightNum);
        case '*': return new NumberNode(leftNum * rightNum);
        case '/': return new NumberNode(leftNum / rightNum);
        case '**': return new NumberNode(Math.pow(leftNum, rightNum));
      }
    }

    // Addition simplifications
    if (node.op === '+') {
      // 0 + x = x
      if (leftNum === 0) return right;
      // x + 0 = x
      if (rightNum === 0) return left;

      // x + x = 2*x
      if (nodesEqual(left, right)) {
        return new BinaryOpNode('*', new NumberNode(2), left);
      }
    }

    // Subtraction simplifications
    if (node.op === '-') {
      // x - 0 = x
      if (rightNum === 0) return left;
      // 0 - x = -x
      if (leftNum === 0) return new UnaryOpNode('-', right);

      // x - x = 0
      if (nodesEqual(left, right)) {
        return new NumberNode(0);
      }
    }

    // Multiplication simplifications
    if (node.op === '*') {
      // 0 * x = 0
      if (leftNum === 0 || rightNum === 0) return new NumberNode(0);
      // 1 * x = x
      if (leftNum === 1) return right;
      // x * 1 = x
      if (rightNum === 1) return left;
      // -1 * x = -x
      if (leftNum === -1) return new UnaryOpNode('-', right);
      // x * -1 = -x
      if (rightNum === -1) return new UnaryOpNode('-', left);

      // x * x = x^2
      if (nodesEqual(left, right)) {
        return new BinaryOpNode('**', left, new NumberNode(2));
      }
    }

    // Division simplifications
    if (node.op === '/') {
      // 0 / x = 0
      if (leftNum === 0) return new NumberNode(0);
      // x / 1 = x
      if (rightNum === 1) return left;
      // x / x = 1
      if (nodesEqual(left, right)) return new NumberNode(1);
    }

    // Power simplifications
    if (node.op === '**') {
      // x^0 = 1
      if (rightNum === 0) return new NumberNode(1);
      // x^1 = x
      if (rightNum === 1) return left;
      // 0^x = 0 (for x > 0)
      if (leftNum === 0) return new NumberNode(0);
      // 1^x = 1
      if (leftNum === 1) return new NumberNode(1);
    }

    return new BinaryOpNode(node.op, left, right);
  }

  visitFunctionCall(node: FunctionCallNode): ASTNode {
    const args = node.args.map(arg => arg.accept(this));

    // Check for constant arguments
    if (args.length === 1 && args[0].type === 'Number') {
      const value = (args[0] as NumberNode).value;

      switch (node.name) {
        case 'sin': return new NumberNode(Math.sin(value));
        case 'cos': return new NumberNode(Math.cos(value));
        case 'tan': return new NumberNode(Math.tan(value));
        case 'exp': return new NumberNode(Math.exp(value));
        case 'log':
        case 'ln': return new NumberNode(Math.log(value));
        case 'sqrt': return new NumberNode(Math.sqrt(value));
        case 'abs': return new NumberNode(Math.abs(value));
        case 'sign': return new NumberNode(Math.sign(value));
        case 'floor': return new NumberNode(Math.floor(value));
        case 'ceil': return new NumberNode(Math.ceil(value));
        case 'round': return new NumberNode(Math.round(value));
        case 'asin': return new NumberNode(Math.asin(value));
        case 'acos': return new NumberNode(Math.acos(value));
        case 'atan': return new NumberNode(Math.atan(value));
        case 'sinh': return new NumberNode(Math.sinh(value));
        case 'cosh': return new NumberNode(Math.cosh(value));
        case 'tanh': return new NumberNode(Math.tanh(value));
      }
    }

    // Two-argument functions
    if (args.length === 2 && args[0].type === 'Number' && args[1].type === 'Number') {
      const val1 = (args[0] as NumberNode).value;
      const val2 = (args[1] as NumberNode).value;

      switch (node.name) {
        case 'pow': return new NumberNode(Math.pow(val1, val2));
        case 'min': return new NumberNode(Math.min(val1, val2));
        case 'max': return new NumberNode(Math.max(val1, val2));
      }
    }

    // Special simplifications
    // exp(0) = 1
    if (node.name === 'exp' && args[0].type === 'Number' && (args[0] as NumberNode).value === 0) {
      return new NumberNode(1);
    }

    // log(1) = 0
    if ((node.name === 'log' || node.name === 'ln') && args[0].type === 'Number' && (args[0] as NumberNode).value === 1) {
      return new NumberNode(0);
    }

    // sqrt(1) = 1
    if (node.name === 'sqrt' && args[0].type === 'Number' && (args[0] as NumberNode).value === 1) {
      return new NumberNode(1);
    }

    return new FunctionCallNode(node.name, args);
  }

  visitVectorAccess(node: VectorAccessNode): ASTNode {
    const vector = node.vector.accept(this);
    return new VectorAccessNode(vector, node.component);
  }

  visitVectorConstructor(node: VectorConstructorNode): ASTNode {
    const components = node.components.map(c => c.accept(this));
    return new VectorConstructorNode(node.vectorType, components);
  }
}

/**
 * Check if two AST nodes are structurally equal
 */
function nodesEqual(a: ASTNode, b: ASTNode): boolean {
  if (a.type !== b.type) return false;

  if (a.type === 'Number' && b.type === 'Number') {
    return (a as NumberNode).value === (b as NumberNode).value;
  }

  if (a.type === 'Variable' && b.type === 'Variable') {
    return (a as VariableNode).name === (b as VariableNode).name;
  }

  if (a.type === 'UnaryOp' && b.type === 'UnaryOp') {
    const aUnary = a as UnaryOpNode;
    const bUnary = b as UnaryOpNode;
    return aUnary.op === bUnary.op && nodesEqual(aUnary.operand, bUnary.operand);
  }

  if (a.type === 'BinaryOp' && b.type === 'BinaryOp') {
    const aBinary = a as BinaryOpNode;
    const bBinary = b as BinaryOpNode;
    return aBinary.op === bBinary.op &&
           nodesEqual(aBinary.left, bBinary.left) &&
           nodesEqual(aBinary.right, bBinary.right);
  }

  if (a.type === 'FunctionCall' && b.type === 'FunctionCall') {
    const aFunc = a as FunctionCallNode;
    const bFunc = b as FunctionCallNode;
    return aFunc.name === bFunc.name &&
           aFunc.args.length === bFunc.args.length &&
           aFunc.args.every((arg, i) => nodesEqual(arg, bFunc.args[i]));
  }

  if (a.type === 'VectorAccess' && b.type === 'VectorAccess') {
    const aVec = a as VectorAccessNode;
    const bVec = b as VectorAccessNode;
    return aVec.component === bVec.component && nodesEqual(aVec.vector, bVec.vector);
  }

  return false;
}

/**
 * Simplify an AST node
 */
export function simplify(node: ASTNode): ASTNode {
  const visitor = new SimplificationVisitor();
  let current = node;
  let previous: ASTNode;

  // Keep simplifying until we reach a fixed point
  let iterations = 0;
  const maxIterations = 10;

  do {
    previous = current;
    current = current.accept(visitor);
    iterations++;
  } while (iterations < maxIterations && !nodesEqual(current, previous));

  return current;
}
