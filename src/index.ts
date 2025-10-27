/**
 * GradientScript - Symbolic differentiation for structured types
 *
 * This library provides symbolic differentiation capabilities for mathematical
 * expressions with structured types (Vec2, Vec3, custom types).
 */

// AST nodes
export {
  ASTNode,
  ASTVisitor,
  NumberNode,
  VariableNode,
  BinaryOpNode,
  UnaryOpNode,
  FunctionCallNode,
  VectorAccessNode,
  VectorConstructorNode,
  Assignment,
  Program,
} from './symbolic/AST';

// Parser
export { Parser, parse } from './symbolic/Parser';

// Differentiation
export { differentiate, computeGradients } from './symbolic/SymbolicDiff';

// Simplification
export { simplify } from './symbolic/Simplify';

// Code generation
export {
  generateCode,
  generateMathNotation,
  generateGradientCode,
  generateGradientFunction,
  CodeGenOptions,
} from './symbolic/CodeGen';
