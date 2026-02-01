/**
 * E-Graph Module for GradientScript
 *
 * Provides equality saturation-based optimization for gradient expressions.
 * Can be used as an alternative to (or in addition to) the CSE module.
 */

// Core e-graph
export { EGraph } from './EGraph.js';
export type { EClass } from './EGraph.js';
export { EClassId, ENode, enodeKey, enodeChildren, enodeWithChildren } from './ENode.js';

// Pattern matching
export {
  Pattern,
  Substitution,
  parsePattern,
  matchPattern,
  instantiatePattern,
  patternToString
} from './Pattern.js';

// Rewrite rules
export {
  Rule,
  rule,
  biRule,
  coreRules,
  algebraRules,
  functionRules,
  allRules,
  canonRules,
  getRuleSet
} from './Rules.js';

// Saturation
export {
  saturate,
  saturatePhased,
  applyRuleOnce,
  SaturationStats,
  SaturationOptions
} from './Rewriter.js';

// Extraction
export {
  extractBest,
  extractWithCSE,
  ExtractionResult,
  CostModel,
  defaultCostModel
} from './Extractor.js';

// AST conversion
export {
  addExpression,
  addExpressions,
  addGradients,
  getRootIds
} from './Convert.js';

// Main optimizer function
export { optimizeWithEGraph, EGraphOptimizeResult } from './Optimizer.js';
