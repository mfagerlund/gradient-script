/**
 * Pattern Matching for E-Graph Rewrite Rules
 *
 * Patterns are expression templates with variables (?a, ?b, etc.)
 * that can match against e-classes in the e-graph.
 */

import { EGraph } from './EGraph.js';
import { ENode, EClassId } from './ENode.js';

/**
 * Pattern AST
 */
export type Pattern =
  | { tag: 'pvar'; name: string }              // ?a, ?b - matches any e-class
  | { tag: 'pnum'; value: number }             // 0, 1, 2 - matches literal
  | { tag: 'padd'; left: Pattern; right: Pattern }
  | { tag: 'pmul'; left: Pattern; right: Pattern }
  | { tag: 'psub'; left: Pattern; right: Pattern }
  | { tag: 'pdiv'; left: Pattern; right: Pattern }
  | { tag: 'ppow'; left: Pattern; right: Pattern }
  | { tag: 'pneg'; child: Pattern }
  | { tag: 'pcall'; name: string; args: Pattern[] };

/**
 * A substitution mapping pattern variables to e-class IDs
 */
export type Substitution = Map<string, EClassId>;

/**
 * Parse a pattern string into a Pattern AST
 *
 * Syntax:
 *   ?a, ?b, ?x     - pattern variables
 *   0, 1, 2, -1    - number literals
 *   (+ ?a ?b)      - addition
 *   (* ?a ?b)      - multiplication
 *   (- ?a ?b)      - subtraction
 *   (/ ?a ?b)      - division
 *   (^ ?a ?b)      - power
 *   (neg ?a)       - negation
 *   (sqrt ?a)      - function call
 */
export function parsePattern(input: string): Pattern {
  const tokens = tokenize(input);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(): string {
    return tokens[pos++];
  }

  function parseExpr(): Pattern {
    const token = peek();

    if (token === '(') {
      consume(); // (
      const op = consume();
      let result: Pattern;

      if (op === 'neg') {
        const child = parseExpr();
        result = { tag: 'pneg', child };
      } else if (['+', '-', '*', '/', '^'].includes(op)) {
        const left = parseExpr();
        const right = parseExpr();
        switch (op) {
          case '+': result = { tag: 'padd', left, right }; break;
          case '-': result = { tag: 'psub', left, right }; break;
          case '*': result = { tag: 'pmul', left, right }; break;
          case '/': result = { tag: 'pdiv', left, right }; break;
          case '^': result = { tag: 'ppow', left, right }; break;
          default: throw new Error(`Unknown operator: ${op}`);
        }
      } else {
        // Function call
        const args: Pattern[] = [];
        while (peek() !== ')') {
          args.push(parseExpr());
        }
        result = { tag: 'pcall', name: op, args };
      }

      if (consume() !== ')') {
        throw new Error('Expected )');
      }
      return result;
    }

    if (token?.startsWith('?')) {
      consume();
      return { tag: 'pvar', name: token.slice(1) };
    }

    if (token && /^-?\d+(\.\d+)?$/.test(token)) {
      consume();
      return { tag: 'pnum', value: parseFloat(token) };
    }

    throw new Error(`Unexpected token: ${token}`);
  }

  const result = parseExpr();
  if (pos < tokens.length) {
    throw new Error(`Unexpected token after pattern: ${tokens[pos]}`);
  }
  return result;
}

/**
 * Tokenize a pattern string
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }

    // Variable or operator or number
    let token = '';
    while (i < input.length && !/[\s()]/.test(input[i])) {
      token += input[i];
      i++;
    }
    if (token) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Match a pattern against an e-class, returning all valid substitutions
 */
export function matchPattern(
  egraph: EGraph,
  pattern: Pattern,
  classId: EClassId
): Substitution[] {
  return matchPatternWithSubst(egraph, pattern, classId, new Map());
}

function matchPatternWithSubst(
  egraph: EGraph,
  pattern: Pattern,
  classId: EClassId,
  subst: Substitution
): Substitution[] {
  const canonId = egraph.find(classId);

  // Pattern variable - bind or check existing binding
  if (pattern.tag === 'pvar') {
    const existing = subst.get(pattern.name);
    if (existing !== undefined) {
      // Check if it matches the same e-class
      if (egraph.find(existing) === canonId) {
        return [new Map(subst)];
      }
      return [];
    }
    // Bind the variable
    const newSubst = new Map(subst);
    newSubst.set(pattern.name, canonId);
    return [newSubst];
  }

  // Try to match against all nodes in the e-class
  const nodes = egraph.getNodes(canonId);
  const results: Substitution[] = [];

  for (const node of nodes) {
    const matches = matchNodeWithPattern(egraph, pattern, node, subst);
    results.push(...matches);
  }

  return results;
}

function matchNodeWithPattern(
  egraph: EGraph,
  pattern: Pattern,
  node: ENode,
  subst: Substitution
): Substitution[] {
  switch (pattern.tag) {
    case 'pvar':
      // Already handled above
      throw new Error('pvar should be handled in matchPatternWithSubst');

    case 'pnum':
      if (node.tag === 'num' && node.value === pattern.value) {
        return [new Map(subst)];
      }
      return [];

    case 'padd':
      if (node.tag === 'add') {
        return matchBinaryChildren(egraph, pattern.left, pattern.right, node.children, subst);
      }
      return [];

    case 'pmul':
      if (node.tag === 'mul') {
        return matchBinaryChildren(egraph, pattern.left, pattern.right, node.children, subst);
      }
      return [];

    case 'psub':
      if (node.tag === 'sub') {
        return matchBinaryChildren(egraph, pattern.left, pattern.right, node.children, subst);
      }
      return [];

    case 'pdiv':
      if (node.tag === 'div') {
        return matchBinaryChildren(egraph, pattern.left, pattern.right, node.children, subst);
      }
      return [];

    case 'ppow':
      if (node.tag === 'pow') {
        return matchBinaryChildren(egraph, pattern.left, pattern.right, node.children, subst);
      }
      return [];

    case 'pneg':
      if (node.tag === 'neg') {
        return matchPatternWithSubst(egraph, pattern.child, node.child, subst);
      }
      return [];

    case 'pcall':
      if (node.tag === 'call' && node.name === pattern.name && node.children.length === pattern.args.length) {
        return matchCallChildren(egraph, pattern.args, node.children, subst);
      }
      return [];
  }
}

function matchBinaryChildren(
  egraph: EGraph,
  leftPattern: Pattern,
  rightPattern: Pattern,
  children: [EClassId, EClassId],
  subst: Substitution
): Substitution[] {
  const results: Substitution[] = [];

  // Match left, then right
  const leftMatches = matchPatternWithSubst(egraph, leftPattern, children[0], subst);
  for (const leftSubst of leftMatches) {
    const rightMatches = matchPatternWithSubst(egraph, rightPattern, children[1], leftSubst);
    results.push(...rightMatches);
  }

  return results;
}

function matchCallChildren(
  egraph: EGraph,
  patterns: Pattern[],
  children: EClassId[],
  subst: Substitution
): Substitution[] {
  if (patterns.length === 0) {
    return [new Map(subst)];
  }

  const results: Substitution[] = [];
  const firstMatches = matchPatternWithSubst(egraph, patterns[0], children[0], subst);

  for (const firstSubst of firstMatches) {
    const restMatches = matchCallChildren(egraph, patterns.slice(1), children.slice(1), firstSubst);
    results.push(...restMatches);
  }

  return results;
}

/**
 * Instantiate a pattern with a substitution, adding nodes to the e-graph
 * Returns the e-class ID of the instantiated pattern
 */
export function instantiatePattern(
  egraph: EGraph,
  pattern: Pattern,
  subst: Substitution
): EClassId {
  switch (pattern.tag) {
    case 'pvar': {
      const id = subst.get(pattern.name);
      if (id === undefined) {
        throw new Error(`Unbound pattern variable: ?${pattern.name}`);
      }
      return id;
    }

    case 'pnum':
      return egraph.add({ tag: 'num', value: pattern.value });

    case 'padd': {
      const left = instantiatePattern(egraph, pattern.left, subst);
      const right = instantiatePattern(egraph, pattern.right, subst);
      return egraph.add({ tag: 'add', children: [left, right] });
    }

    case 'pmul': {
      const left = instantiatePattern(egraph, pattern.left, subst);
      const right = instantiatePattern(egraph, pattern.right, subst);
      return egraph.add({ tag: 'mul', children: [left, right] });
    }

    case 'psub': {
      const left = instantiatePattern(egraph, pattern.left, subst);
      const right = instantiatePattern(egraph, pattern.right, subst);
      return egraph.add({ tag: 'sub', children: [left, right] });
    }

    case 'pdiv': {
      const left = instantiatePattern(egraph, pattern.left, subst);
      const right = instantiatePattern(egraph, pattern.right, subst);
      return egraph.add({ tag: 'div', children: [left, right] });
    }

    case 'ppow': {
      const left = instantiatePattern(egraph, pattern.left, subst);
      const right = instantiatePattern(egraph, pattern.right, subst);
      return egraph.add({ tag: 'pow', children: [left, right] });
    }

    case 'pneg': {
      const child = instantiatePattern(egraph, pattern.child, subst);
      return egraph.add({ tag: 'neg', child });
    }

    case 'pcall': {
      const args = pattern.args.map(arg => instantiatePattern(egraph, arg, subst));
      return egraph.add({ tag: 'call', name: pattern.name, children: args });
    }
  }
}

/**
 * Convert pattern to string for debugging
 */
export function patternToString(pattern: Pattern): string {
  switch (pattern.tag) {
    case 'pvar': return `?${pattern.name}`;
    case 'pnum': return `${pattern.value}`;
    case 'padd': return `(+ ${patternToString(pattern.left)} ${patternToString(pattern.right)})`;
    case 'pmul': return `(* ${patternToString(pattern.left)} ${patternToString(pattern.right)})`;
    case 'psub': return `(- ${patternToString(pattern.left)} ${patternToString(pattern.right)})`;
    case 'pdiv': return `(/ ${patternToString(pattern.left)} ${patternToString(pattern.right)})`;
    case 'ppow': return `(^ ${patternToString(pattern.left)} ${patternToString(pattern.right)})`;
    case 'pneg': return `(neg ${patternToString(pattern.child)})`;
    case 'pcall': return `(${pattern.name} ${pattern.args.map(patternToString).join(' ')})`;
  }
}
