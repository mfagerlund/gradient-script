/**
 * AST nodes for GradientScript DSL
 * Supports function definitions with structured types
 */

import { Type } from './Types.js';

/**
 * Base AST node
 */
export interface ASTNode {
  type?: Type; // Type annotation (computed during type inference)
}

/**
 * Program (top-level)
 */
export interface Program extends ASTNode {
  kind: 'program';
  functions: FunctionDef[];
}

/**
 * Function definition
 */
export interface FunctionDef extends ASTNode {
  kind: 'function';
  name: string;
  parameters: Parameter[];
  body: Statement[];
  returnExpr: Expression;
}

/**
 * Function parameter
 */
export interface Parameter {
  name: string;
  requiresGrad: boolean; // true if marked with ∇
  paramType?: StructTypeAnnotation; // Optional type annotation like {x, y}
}

/**
 * Type annotation for structured types
 */
export interface StructTypeAnnotation {
  components: string[]; // e.g., ['x', 'y']
}

/**
 * Statement types
 */
export type Statement = Assignment;

/**
 * Assignment statement
 */
export interface Assignment extends ASTNode {
  kind: 'assignment';
  variable: string;
  expression: Expression;
}

/**
 * Expression types
 */
export type Expression =
  | NumberLiteral
  | Variable
  | BinaryOp
  | UnaryOp
  | FunctionCall
  | ComponentAccess;

/**
 * Number literal
 */
export interface NumberLiteral extends ASTNode {
  kind: 'number';
  value: number;
}

/**
 * Variable reference
 */
export interface Variable extends ASTNode {
  kind: 'variable';
  name: string;
}

/**
 * Binary operation
 */
export interface BinaryOp extends ASTNode {
  kind: 'binary';
  operator: '+' | '-' | '*' | '/' | '^' | '**';
  left: Expression;
  right: Expression;
}

/**
 * Unary operation
 */
export interface UnaryOp extends ASTNode {
  kind: 'unary';
  operator: '-' | '+';
  operand: Expression;
}

/**
 * Function call
 */
export interface FunctionCall extends ASTNode {
  kind: 'call';
  name: string;
  args: Expression[];
}

/**
 * Component access (e.g., u.x, v.y)
 */
export interface ComponentAccess extends ASTNode {
  kind: 'component';
  object: Expression;
  component: string;
}

/**
 * Visitor pattern for AST traversal
 */
export interface ASTVisitor<T> {
  visitProgram(node: Program): T;
  visitFunction(node: FunctionDef): T;
  visitAssignment(node: Assignment): T;
  visitNumber(node: NumberLiteral): T;
  visitVariable(node: Variable): T;
  visitBinary(node: BinaryOp): T;
  visitUnary(node: UnaryOp): T;
  visitCall(node: FunctionCall): T;
  visitComponent(node: ComponentAccess): T;
}

/**
 * Helper to visit any expression node
 */
export function visitExpression<T>(visitor: ASTVisitor<T>, expr: Expression): T {
  switch (expr.kind) {
    case 'number':
      return visitor.visitNumber(expr);
    case 'variable':
      return visitor.visitVariable(expr);
    case 'binary':
      return visitor.visitBinary(expr);
    case 'unary':
      return visitor.visitUnary(expr);
    case 'call':
      return visitor.visitCall(expr);
    case 'component':
      return visitor.visitComponent(expr);
  }
}
