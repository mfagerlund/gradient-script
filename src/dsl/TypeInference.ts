/**
 * Type inference for GradientScript DSL
 * Infers types for all expressions and validates type correctness
 */

import {
  Program,
  FunctionDef,
  Expression,
  Statement,
  Assignment,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess,
  visitExpression
} from './AST.js';
import { Type, Types, TypeEnv } from './Types.js';
import { builtIns } from './BuiltIns.js';

/**
 * Type inference visitor
 */
export class TypeInferenceVisitor {
  private env: TypeEnv;

  constructor(env: TypeEnv) {
    this.env = env;
  }

  /**
   * Infer type for an expression
   */
  inferExpression(expr: Expression): Type {
    switch (expr.kind) {
      case 'number':
        return this.inferNumber(expr);
      case 'variable':
        return this.inferVariable(expr);
      case 'binary':
        return this.inferBinary(expr);
      case 'unary':
        return this.inferUnary(expr);
      case 'call':
        return this.inferCall(expr);
      case 'component':
        return this.inferComponent(expr);
    }
  }

  private inferNumber(expr: NumberLiteral): Type {
    const type = Types.scalar();
    expr.type = type;
    return type;
  }

  private inferVariable(expr: Variable): Type {
    const type = this.env.getOrThrow(expr.name);
    expr.type = type;
    return type;
  }

  private inferBinary(expr: BinaryOp): Type {
    const leftType = this.inferExpression(expr.left);
    const rightType = this.inferExpression(expr.right);

    // Check compatibility
    if (!Types.compatible(leftType, rightType)) {
      throw new Error(
        `Type mismatch in binary operation ${expr.operator}: ` +
        `${Types.toString(leftType)} ${expr.operator} ${Types.toString(rightType)}`
      );
    }

    const resultType = Types.binaryResultType(leftType, rightType, expr.operator);
    expr.type = resultType;
    return resultType;
  }

  private inferUnary(expr: UnaryOp): Type {
    const operandType = this.inferExpression(expr.operand);
    const resultType = Types.unaryResultType(operandType, expr.operator);
    expr.type = resultType;
    return resultType;
  }

  private inferCall(expr: FunctionCall): Type {
    // Infer argument types
    const argTypes = expr.args.map(arg => this.inferExpression(arg));

    // Look up built-in function
    const signature = builtIns.lookup(expr.name, argTypes);

    if (!signature) {
      // Try to provide helpful error message
      if (builtIns.isBuiltIn(expr.name)) {
        const overloads = builtIns.getOverloads(expr.name);
        const expectedSigs = overloads.map(sig =>
          `${sig.name}(${sig.params.map(p => Types.toString(p)).join(', ')})`
        ).join(' or ');

        throw new Error(
          `No matching overload for ${expr.name}(${argTypes.map(t => Types.toString(t)).join(', ')}). ` +
          `Expected: ${expectedSigs}`
        );
      } else {
        throw new Error(`Unknown function: ${expr.name}`);
      }
    }

    expr.type = signature.returnType;
    return signature.returnType;
  }

  private inferComponent(expr: ComponentAccess): Type {
    const objectType = this.inferExpression(expr.object);

    // Object must be a struct
    if (!Types.isStruct(objectType)) {
      throw new Error(
        `Cannot access component '${expr.component}' of scalar type`
      );
    }

    // Check component exists
    if (!objectType.components.includes(expr.component)) {
      throw new Error(
        `Component '${expr.component}' does not exist on type ${Types.toString(objectType)}. ` +
        `Available components: ${objectType.components.join(', ')}`
      );
    }

    const resultType = Types.scalar();
    expr.type = resultType;
    return resultType;
  }
}

/**
 * Infer types for a statement
 */
export function inferStatement(stmt: Statement, env: TypeEnv): void {
  if (stmt.kind === 'assignment') {
    const visitor = new TypeInferenceVisitor(env);
    const exprType = visitor.inferExpression(stmt.expression);

    // Add variable to environment
    env.set(stmt.variable, exprType);
  }
}

/**
 * Infer types for a function
 */
export function inferFunction(func: FunctionDef): TypeEnv {
  const env = new TypeEnv();

  // Add parameters to environment
  for (const param of func.parameters) {
    let paramType: Type;

    if (param.paramType) {
      // Explicit type annotation
      paramType = Types.struct(param.paramType.components);
    } else {
      // No annotation - assume scalar for now
      // (could be inferred from usage later)
      paramType = Types.scalar();
    }

    env.set(param.name, paramType);
  }

  // Infer types for statements
  for (const stmt of func.body) {
    inferStatement(stmt, env);
  }

  // Infer return type
  const visitor = new TypeInferenceVisitor(env);
  const returnType = visitor.inferExpression(func.returnExpr);
  func.type = returnType;

  return env;
}

/**
 * Infer types for entire program
 */
export function inferProgram(program: Program): void {
  for (const func of program.functions) {
    inferFunction(func);
  }
}

/**
 * Convenience function to infer types
 */
export function inferTypes(program: Program): Program {
  inferProgram(program);
  return program;
}
