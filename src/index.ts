/**
 * GradientScript - Symbolic differentiation for structured types
 *
 * This library provides automatic differentiation for functions with
 * structured types (vectors, custom structures).
 */

// Core API
export { parse } from './dsl/Parser.js';
export { inferFunction } from './dsl/TypeInference.js';
export { computeFunctionGradients } from './dsl/Differentiation.js';
export {
  generateComplete,
  generateGradientFunction,
  type CodeGenOptions
} from './dsl/CodeGen.js';

// AST types
export type {
  Expression,
  FunctionDef,
  Program,
  Parameter,
  Assignment
} from './dsl/AST.js';

// Type system
export type {
  Type,
  ScalarType,
  StructType,
  TypeEnv
} from './dsl/Types.js';

// Gradient verification utilities
export type {
  GradCheckResult,
  GradCheckError
} from './dsl/GradientChecker.js';
