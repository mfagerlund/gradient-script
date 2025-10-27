/**
 * ExpressionTransformer - Abstract base class for AST transformations
 *
 * This class eliminates duplicated AST traversal logic by providing:
 * - Default recursive descent for all expression types
 * - Protected visit methods that subclasses can override
 * - Type-safe transformation pipeline
 *
 * Usage:
 *   class MyTransformer extends ExpressionTransformer {
 *     protected visitBinaryOp(node: BinaryOp): Expression {
 *       // Custom logic here
 *       return super.visitBinaryOp(node); // Or custom result
 *     }
 *   }
 */

import {
  Expression,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess
} from './AST.js';

export abstract class ExpressionTransformer {
  /**
   * Main entry point for transforming an expression
   * Dispatches to appropriate visit method based on node kind
   */
  transform(expr: Expression): Expression {
    switch (expr.kind) {
      case 'number':
        return this.visitNumber(expr);
      case 'variable':
        return this.visitVariable(expr);
      case 'binary':
        return this.visitBinaryOp(expr);
      case 'unary':
        return this.visitUnaryOp(expr);
      case 'call':
        return this.visitFunctionCall(expr);
      case 'component':
        return this.visitComponentAccess(expr);
    }
  }

  /**
   * Visit a number literal
   * Default: Return unchanged (identity transformation)
   */
  protected visitNumber(node: NumberLiteral): Expression {
    return node;
  }

  /**
   * Visit a variable reference
   * Default: Return unchanged (identity transformation)
   */
  protected visitVariable(node: Variable): Expression {
    return node;
  }

  /**
   * Visit a binary operation
   * Default: Transform left and right children, return new node
   */
  protected visitBinaryOp(node: BinaryOp): Expression {
    const left = this.transform(node.left);
    const right = this.transform(node.right);

    return {
      kind: 'binary',
      operator: node.operator,
      left,
      right
    };
  }

  /**
   * Visit a unary operation
   * Default: Transform operand, return new node
   */
  protected visitUnaryOp(node: UnaryOp): Expression {
    const operand = this.transform(node.operand);

    return {
      kind: 'unary',
      operator: node.operator,
      operand
    };
  }

  /**
   * Visit a function call
   * Default: Transform all arguments, return new node
   */
  protected visitFunctionCall(node: FunctionCall): Expression {
    const args = node.args.map(arg => this.transform(arg));

    return {
      kind: 'call',
      name: node.name,
      args
    };
  }

  /**
   * Visit a component access (e.g., v.x)
   * Default: Transform object, return new node
   */
  protected visitComponentAccess(node: ComponentAccess): Expression {
    const object = this.transform(node.object);

    return {
      kind: 'component',
      object,
      component: node.component
    };
  }
}
