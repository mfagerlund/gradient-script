/**
 * Abstract Syntax Tree (AST) node definitions for symbolic differentiation.
 * @internal
 */

/**
 * Base interface for all AST nodes
 */
export interface ASTNode {
  type: string;
  accept<T>(visitor: ASTVisitor<T>): T;
}

/**
 * Visitor pattern interface for traversing AST
 */
export interface ASTVisitor<T> {
  visitNumber(node: NumberNode): T;
  visitVariable(node: VariableNode): T;
  visitBinaryOp(node: BinaryOpNode): T;
  visitUnaryOp(node: UnaryOpNode): T;
  visitFunctionCall(node: FunctionCallNode): T;
  visitVectorAccess(node: VectorAccessNode): T;
  visitVectorConstructor(node: VectorConstructorNode): T;
}

/**
 * Numeric constant node
 */
export class NumberNode implements ASTNode {
  type = 'Number' as const;

  constructor(public value: number) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitNumber(this);
  }

  toString(): string {
    return String(this.value);
  }
}

/**
 * Variable reference node (e.g., 'x', 'y', 'a')
 */
export class VariableNode implements ASTNode {
  type = 'Variable' as const;

  constructor(public name: string) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitVariable(this);
  }

  toString(): string {
    return this.name;
  }
}

/**
 * Binary operation node (e.g., a + b, x * y)
 */
export class BinaryOpNode implements ASTNode {
  type = 'BinaryOp' as const;

  constructor(
    public op: '+' | '-' | '*' | '/' | '**' | 'pow',
    public left: ASTNode,
    public right: ASTNode
  ) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitBinaryOp(this);
  }

  toString(): string {
    return `(${this.left.toString()} ${this.op} ${this.right.toString()})`;
  }
}

/**
 * Unary operation node (e.g., -x, +y)
 */
export class UnaryOpNode implements ASTNode {
  type = 'UnaryOp' as const;

  constructor(
    public op: '+' | '-',
    public operand: ASTNode
  ) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitUnaryOp(this);
  }

  toString(): string {
    return `${this.op}${this.operand.toString()}`;
  }
}

/**
 * Function call node (e.g., sin(x), sqrt(y), max(a, b))
 */
export class FunctionCallNode implements ASTNode {
  type = 'FunctionCall' as const;

  constructor(
    public name: string,
    public args: ASTNode[]
  ) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitFunctionCall(this);
  }

  toString(): string {
    return `${this.name}(${this.args.map(a => a.toString()).join(', ')})`;
  }
}

/**
 * Vector component access node (e.g., v.x, point.y)
 */
export class VectorAccessNode implements ASTNode {
  type = 'VectorAccess' as const;

  constructor(
    public vector: ASTNode,
    public component: 'x' | 'y' | 'z'
  ) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitVectorAccess(this);
  }

  toString(): string {
    return `${this.vector.toString()}.${this.component}`;
  }
}

/**
 * Vector constructor node (e.g., Vec2(x, y), Vec3(1, 2, 3))
 */
export class VectorConstructorNode implements ASTNode {
  type = 'VectorConstructor' as const;

  constructor(
    public vectorType: 'Vec2' | 'Vec3',
    public components: ASTNode[]
  ) {}

  accept<T>(visitor: ASTVisitor<T>): T {
    return visitor.visitVectorConstructor(this);
  }

  toString(): string {
    return `${this.vectorType}(${this.components.map(c => c.toString()).join(', ')})`;
  }
}

/**
 * Assignment statement (e.g., x = 5, y = x + 2)
 */
export interface Assignment {
  variable: string;
  expression: ASTNode;
}

/**
 * Complete program with assignments and output
 */
export interface Program {
  assignments: Assignment[];
  output: string;  // Name of the output variable
}
