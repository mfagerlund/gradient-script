/**
 * E-Graph Optimizer for GradientScript
 *
 * Main entry point for e-graph-based optimization.
 * Replaces eliminateCommonSubexpressionsGlobal from CSE.ts
 */

import { Expression } from '../AST.js';
import { EGraph } from './EGraph.js';
import { EClassId } from './ENode.js';
import { addGradients, getRootIds } from './Convert.js';
import { saturate, saturatePhased, SaturationStats } from './Rewriter.js';
import { extractWithCSE, defaultCostModel, CostModel } from './Extractor.js';
import { coreRules, algebraRules, functionRules, Rule } from './Rules.js';

/**
 * Result from e-graph optimization (matches GlobalCSEResult interface)
 */
export interface EGraphOptimizeResult {
  intermediates: Map<string, Expression>;
  gradients: Map<string, Map<string, Expression>>;
  stats?: OptimizationStats;
}

/**
 * Statistics from optimization
 */
export interface OptimizationStats {
  saturation: SaturationStats;
  tempsCreated: number;
  totalCost: number;
}

/**
 * Options for e-graph optimization
 */
export interface EGraphOptimizeOptions {
  /** Maximum saturation iterations (default: 30) */
  maxIterations?: number;

  /** Which rule sets to use (default: ['core', 'algebra']) */
  ruleSets?: ('core' | 'algebra' | 'function')[];

  /** Use phased saturation (core first, then others) */
  phased?: boolean;

  /** Minimum cost for a subexpression to become a temp (default: 3) */
  minSharedCost?: number;

  /** Custom cost model */
  costModel?: CostModel;

  /** Print verbose output */
  verbose?: boolean;
}

/**
 * Optimize gradients using e-graph equality saturation
 *
 * This is designed to be a drop-in replacement for eliminateCommonSubexpressionsGlobal
 */
export function optimizeWithEGraph(
  allGradients: Map<string, Map<string, Expression>>,
  options: EGraphOptimizeOptions = {}
): EGraphOptimizeResult {
  const {
    maxIterations = 30,
    ruleSets = ['core', 'algebra'],
    phased = true,
    minSharedCost = 3,
    costModel = defaultCostModel,
    verbose = false
  } = options;

  // Build e-graph from all gradients
  const egraph = new EGraph();
  const gradientIds = addGradients(egraph, allGradients);
  const rootIds = getRootIds(gradientIds);

  if (verbose) {
    console.log(`[egraph] Added ${egraph.size} e-classes from ${rootIds.length} gradient expressions`);
  }

  // Select rules
  const rules = selectRules(ruleSets);

  // Saturate
  let stats: SaturationStats;
  if (phased) {
    const phases: Rule[][] = [];
    if (ruleSets.includes('core')) phases.push(coreRules);
    if (ruleSets.includes('algebra')) phases.push(algebraRules);
    if (ruleSets.includes('function')) phases.push(functionRules);

    stats = saturatePhased(egraph, phases, { maxIterations, verbose });
  } else {
    stats = saturate(egraph, rules, { maxIterations, verbose });
  }

  if (verbose) {
    console.log(`[egraph] Saturation: ${stats.iterations} iters, ${stats.merges} merges, ${egraph.size} classes`);
  }

  // Extract with CSE
  const extraction = extractWithCSE(egraph, rootIds, costModel, minSharedCost);

  if (verbose) {
    console.log(`[egraph] Extracted ${extraction.temps.size} temps, total cost ${extraction.totalCost}`);
  }

  // Convert back to gradient structure
  const optimizedGradients = new Map<string, Map<string, Expression>>();
  let rootIndex = 0;

  for (const [paramName, componentIds] of gradientIds) {
    const components = new Map<string, Expression>();
    for (const [comp] of componentIds) {
      const rootId = rootIds[rootIndex++];
      const expr = extraction.expressions.get(rootId);
      if (!expr) {
        throw new Error(`Missing extraction for root ${rootId}`);
      }
      components.set(comp, expr);
    }
    optimizedGradients.set(paramName, components);
  }

  return {
    intermediates: extraction.temps,
    gradients: optimizedGradients,
    stats: {
      saturation: stats,
      tempsCreated: extraction.temps.size,
      totalCost: extraction.totalCost
    }
  };
}

/**
 * Select rules based on rule set names
 */
function selectRules(ruleSets: ('core' | 'algebra' | 'function')[]): Rule[] {
  const rules: Rule[] = [];
  if (ruleSets.includes('core')) rules.push(...coreRules);
  if (ruleSets.includes('algebra')) rules.push(...algebraRules);
  if (ruleSets.includes('function')) rules.push(...functionRules);
  return rules;
}
