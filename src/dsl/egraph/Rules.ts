/**
 * Algebraic Rewrite Rules for E-Graph Optimization
 *
 * Rules are organized by category:
 * - Core: Always safe, essential (commutativity, identity, etc.)
 * - Algebra: More powerful, can cause expansion (distribution, factoring)
 * - Functions: Domain-specific (sqrt, trig, exp/log)
 *
 * Based on rules from Herbie (https://github.com/herbie-fp/herbie)
 * and egg (https://egraphs-good.github.io/)
 */

import { Pattern, parsePattern } from './Pattern.js';

/**
 * A rewrite rule: if LHS matches, RHS is equivalent
 */
export interface Rule {
  name: string;
  lhs: Pattern;
  rhs: Pattern;
}

/**
 * Create a rule from pattern strings
 */
export function rule(name: string, lhs: string, rhs: string): Rule {
  return {
    name,
    lhs: parsePattern(lhs),
    rhs: parsePattern(rhs)
  };
}

/**
 * Create bidirectional rules (both directions)
 */
export function biRule(name: string, a: string, b: string): Rule[] {
  return [
    rule(`${name}-l`, a, b),
    rule(`${name}-r`, b, a)
  ];
}

// =============================================================================
// CORE RULES - Always safe, essential
// =============================================================================

export const coreRules: Rule[] = [
  // === Commutativity ===
  rule('comm-add', '(+ ?a ?b)', '(+ ?b ?a)'),
  rule('comm-mul', '(* ?a ?b)', '(* ?b ?a)'),

  // === Associativity ===
  ...biRule('assoc-add', '(+ (+ ?a ?b) ?c)', '(+ ?a (+ ?b ?c))'),
  ...biRule('assoc-mul', '(* (* ?a ?b) ?c)', '(* ?a (* ?b ?c))'),

  // === Identity: addition ===
  rule('add-0-l', '(+ 0 ?a)', '?a'),
  rule('add-0-r', '(+ ?a 0)', '?a'),

  // === Identity: subtraction ===
  rule('sub-0', '(- ?a 0)', '?a'),
  rule('0-sub', '(- 0 ?a)', '(neg ?a)'),

  // === Identity: multiplication ===
  rule('mul-1-l', '(* 1 ?a)', '?a'),
  rule('mul-1-r', '(* ?a 1)', '?a'),

  // === Identity: division ===
  rule('div-1', '(/ ?a 1)', '?a'),

  // === Identity: power ===
  rule('pow-0', '(^ ?a 0)', '1'),
  rule('pow-1', '(^ ?a 1)', '?a'),

  // === Zero: multiplication ===
  rule('mul-0-l', '(* 0 ?a)', '0'),
  rule('mul-0-r', '(* ?a 0)', '0'),

  // === Zero: division ===
  rule('0-div', '(/ 0 ?a)', '0'),

  // === Inverse: subtraction ===
  rule('sub-self', '(- ?a ?a)', '0'),

  // === Inverse: division ===
  rule('div-self', '(/ ?a ?a)', '1'),

  // === Double negation ===
  rule('neg-neg', '(neg (neg ?a))', '?a'),

  // === Negation with multiplication ===
  rule('neg-mul-neg', '(* (neg ?a) (neg ?b))', '(* ?a ?b)'),
  rule('mul-neg-1', '(* -1 ?a)', '(neg ?a)'),
  rule('neg-to-mul', '(neg ?a)', '(* -1 ?a)'),
];

// =============================================================================
// ALGEBRA RULES - More powerful, can cause expansion
// =============================================================================

export const algebraRules: Rule[] = [
  // === Distribution (both directions) ===
  ...biRule('dist-mul-add', '(* ?a (+ ?b ?c))', '(+ (* ?a ?b) (* ?a ?c))'),
  ...biRule('dist-mul-sub', '(* ?a (- ?b ?c))', '(- (* ?a ?b) (* ?a ?c))'),

  // === Negation propagation ===
  rule('neg-add', '(neg (+ ?a ?b))', '(+ (neg ?a) (neg ?b))'),
  rule('neg-sub', '(neg (- ?a ?b))', '(- ?b ?a)'),
  rule('neg-mul-l', '(* (neg ?a) ?b)', '(neg (* ?a ?b))'),
  rule('neg-mul-r', '(* ?a (neg ?b))', '(neg (* ?a ?b))'),
  rule('neg-div-l', '(/ (neg ?a) ?b)', '(neg (/ ?a ?b))'),
  rule('neg-div-r', '(/ ?a (neg ?b))', '(neg (/ ?a ?b))'),

  // === Subtraction to addition ===
  rule('sub-to-add', '(- ?a ?b)', '(+ ?a (neg ?b))'),
  rule('add-neg-to-sub', '(+ ?a (neg ?b))', '(- ?a ?b)'),

  // === Division to multiplication by inverse ===
  rule('div-to-mul-inv', '(/ ?a ?b)', '(* ?a (inv ?b))'),

  // === Inverse rules ===
  rule('inv-1', '(inv 1)', '1'),
  rule('inv-inv', '(inv (inv ?a))', '?a'),
  rule('div-1-to-inv', '(/ 1 ?a)', '(inv ?a)'),
  rule('mul-inv-cancel', '(* ?a (inv ?a))', '1'),  // a * (1/a) = 1
  rule('inv-mul', '(inv (* ?a ?b))', '(* (inv ?a) (inv ?b))'),  // 1/(a*b) = (1/a)*(1/b)
  rule('div-self-sq', '(/ ?a (* ?a ?a))', '(inv ?a)'),  // a / (a*a) = 1/a
  rule('div-sq-self', '(/ (* ?a ?a) ?a)', '?a'),  // (a*a) / a = a
  rule('div-self-pow2', '(/ ?a (^ ?a 2))', '(inv ?a)'),  // a / a^2 = 1/a
  rule('div-pow2-self', '(/ (^ ?a 2) ?a)', '?a'),  // a^2 / a = a

  // === Power rules ===
  rule('pow-2', '(^ ?a 2)', '(* ?a ?a)'),
  rule('sq-to-pow', '(* ?a ?a)', '(^ ?a 2)'),

  // === Combining like terms ===
  rule('add-same', '(+ ?a ?a)', '(* 2 ?a)'),
  rule('sub-neg-same', '(- ?a (neg ?a))', '(* 2 ?a)'),
];

// =============================================================================
// FUNCTION RULES - Domain-specific
// =============================================================================

export const functionRules: Rule[] = [
  // === Sqrt ===
  rule('sqrt-sq', '(* (sqrt ?a) (sqrt ?a))', '?a'),
  rule('sqrt-mul', '(sqrt (* ?a ?b))', '(* (sqrt ?a) (sqrt ?b))'),
  rule('sqrt-div', '(sqrt (/ ?a ?b))', '(/ (sqrt ?a) (sqrt ?b))'),
  rule('sqrt-1', '(sqrt 1)', '1'),
  rule('sqrt-0', '(sqrt 0)', '0'),

  // === Abs ===
  rule('abs-neg', '(abs (neg ?a))', '(abs ?a)'),
  rule('abs-abs', '(abs (abs ?a))', '(abs ?a)'),
  rule('abs-sq', '(abs (* ?a ?a))', '(* ?a ?a)'),

  // === Trig ===
  rule('sin-0', '(sin 0)', '0'),
  rule('cos-0', '(cos 0)', '1'),
  rule('sin-neg', '(sin (neg ?a))', '(neg (sin ?a))'),
  rule('cos-neg', '(cos (neg ?a))', '(cos ?a)'),

  // === Exp/Log ===
  rule('exp-0', '(exp 0)', '1'),
  rule('log-1', '(log 1)', '0'),
  rule('exp-log', '(exp (log ?a))', '?a'),
  rule('log-exp', '(log (exp ?a))', '?a'),
  rule('log-mul', '(log (* ?a ?b))', '(+ (log ?a) (log ?b))'),
  rule('log-div', '(log (/ ?a ?b))', '(- (log ?a) (log ?b))'),
  rule('log-pow', '(log (^ ?a ?b))', '(* ?b (log ?a))'),
];

// =============================================================================
// RULE SETS
// =============================================================================

/**
 * All rules combined
 */
export const allRules: Rule[] = [
  ...coreRules,
  ...algebraRules,
  ...functionRules,
];

/**
 * Minimal rules for canonicalization only
 * (no expansion, just normalization)
 */
export const canonRules: Rule[] = [
  // Commutativity (for canonical ordering)
  rule('comm-add', '(+ ?a ?b)', '(+ ?b ?a)'),
  rule('comm-mul', '(* ?a ?b)', '(* ?b ?a)'),

  // Identity removal
  rule('add-0-l', '(+ 0 ?a)', '?a'),
  rule('add-0-r', '(+ ?a 0)', '?a'),
  rule('mul-1-l', '(* 1 ?a)', '?a'),
  rule('mul-1-r', '(* ?a 1)', '?a'),
  rule('sub-0', '(- ?a 0)', '?a'),
  rule('div-1', '(/ ?a 1)', '?a'),
  rule('pow-1', '(^ ?a 1)', '?a'),

  // Zero
  rule('mul-0-l', '(* 0 ?a)', '0'),
  rule('mul-0-r', '(* ?a 0)', '0'),
  rule('0-div', '(/ 0 ?a)', '0'),
  rule('pow-0', '(^ ?a 0)', '1'),

  // Inverse
  rule('sub-self', '(- ?a ?a)', '0'),
  rule('div-self', '(/ ?a ?a)', '1'),

  // Double negation
  rule('neg-neg', '(neg (neg ?a))', '?a'),
  rule('neg-mul-neg', '(* (neg ?a) (neg ?b))', '(* ?a ?b)'),
];

/**
 * Get rules by category
 */
export function getRuleSet(categories: ('core' | 'algebra' | 'function')[]): Rule[] {
  const rules: Rule[] = [];
  if (categories.includes('core')) rules.push(...coreRules);
  if (categories.includes('algebra')) rules.push(...algebraRules);
  if (categories.includes('function')) rules.push(...functionRules);
  return rules;
}
