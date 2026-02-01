/**
 * Rewrite Engine for E-Graph Equality Saturation
 *
 * Applies rewrite rules until saturation (no new merges) or iteration limit.
 */

import { EGraph } from './EGraph.js';
import { EClassId } from './ENode.js';
import { Rule } from './Rules.js';
import { matchPattern, instantiatePattern, Substitution } from './Pattern.js';

/**
 * Statistics from a saturation run
 */
export interface SaturationStats {
  iterations: number;
  totalMatches: number;
  merges: number;
  saturated: boolean;
  classCount: number;
}

/**
 * Options for saturation
 */
export interface SaturationOptions {
  maxIterations?: number;    // Default: 30
  maxClassSize?: number;     // Stop if e-graph gets too large
  verbose?: boolean;         // Log progress
}

/**
 * Apply equality saturation to an e-graph
 *
 * Repeatedly applies rewrite rules until:
 * - No new equivalences are discovered (saturated)
 * - Max iterations reached
 * - E-graph size limit exceeded
 */
export function saturate(
  egraph: EGraph,
  rules: Rule[],
  options: SaturationOptions = {}
): SaturationStats {
  const {
    maxIterations = 30,
    maxClassSize = 10000,
    verbose = false
  } = options;

  const stats: SaturationStats = {
    iterations: 0,
    totalMatches: 0,
    merges: 0,
    saturated: false,
    classCount: egraph.size
  };

  for (let iter = 0; iter < maxIterations; iter++) {
    stats.iterations = iter + 1;

    // Check size limit
    if (egraph.size > maxClassSize) {
      if (verbose) {
        console.log(`[saturate] Size limit exceeded: ${egraph.size} > ${maxClassSize}`);
      }
      break;
    }

    // Collect all rule matches
    const matches = collectMatches(egraph, rules);
    stats.totalMatches += matches.length;

    if (matches.length === 0) {
      stats.saturated = true;
      if (verbose) {
        console.log(`[saturate] Saturated after ${iter + 1} iterations`);
      }
      break;
    }

    // Apply all matches
    let mergesThisIter = 0;
    for (const { rule, classId, subst } of matches) {
      const rhsId = instantiatePattern(egraph, rule.rhs, subst);
      const lhsCanon = egraph.find(classId);
      const rhsCanon = egraph.find(rhsId);

      if (lhsCanon !== rhsCanon) {
        egraph.merge(lhsCanon, rhsCanon);
        mergesThisIter++;
      }
    }

    stats.merges += mergesThisIter;

    // Rebuild to restore invariants
    egraph.rebuild();

    if (verbose) {
      console.log(`[saturate] Iter ${iter + 1}: ${matches.length} matches, ${mergesThisIter} merges, ${egraph.size} classes`);
    }

    // If no merges happened, we're saturated
    if (mergesThisIter === 0) {
      stats.saturated = true;
      break;
    }
  }

  stats.classCount = egraph.size;
  return stats;
}

/**
 * A match: rule matched at classId with substitution
 */
interface Match {
  rule: Rule;
  classId: EClassId;
  subst: Substitution;
}

/**
 * Collect all rule matches across the e-graph
 */
function collectMatches(egraph: EGraph, rules: Rule[]): Match[] {
  const matches: Match[] = [];

  for (const classId of egraph.getClassIds()) {
    for (const rule of rules) {
      const substs = matchPattern(egraph, rule.lhs, classId);
      for (const subst of substs) {
        matches.push({ rule, classId, subst });
      }
    }
  }

  return matches;
}

/**
 * Apply a single rule once, returning number of merges
 */
export function applyRuleOnce(egraph: EGraph, rule: Rule): number {
  const matches = collectMatches(egraph, [rule]);
  let merges = 0;

  for (const { classId, subst } of matches) {
    const rhsId = instantiatePattern(egraph, rule.rhs, subst);
    const lhsCanon = egraph.find(classId);
    const rhsCanon = egraph.find(rhsId);

    if (lhsCanon !== rhsCanon) {
      egraph.merge(lhsCanon, rhsCanon);
      merges++;
    }
  }

  egraph.rebuild();
  return merges;
}

/**
 * Apply rules in phases for better control
 * E.g., apply core rules first, then algebra rules
 */
export function saturatePhased(
  egraph: EGraph,
  phases: Rule[][],
  options: SaturationOptions = {}
): SaturationStats {
  const combinedStats: SaturationStats = {
    iterations: 0,
    totalMatches: 0,
    merges: 0,
    saturated: true,
    classCount: egraph.size
  };

  for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
    const rules = phases[phaseIdx];

    if (options.verbose) {
      console.log(`[saturatePhased] Phase ${phaseIdx + 1}/${phases.length}: ${rules.length} rules`);
    }

    const phaseStats = saturate(egraph, rules, options);

    combinedStats.iterations += phaseStats.iterations;
    combinedStats.totalMatches += phaseStats.totalMatches;
    combinedStats.merges += phaseStats.merges;
    combinedStats.saturated = combinedStats.saturated && phaseStats.saturated;
  }

  combinedStats.classCount = egraph.size;
  return combinedStats;
}
