/**
 * E-Graph unit tests
 */

import { describe, it, expect } from 'vitest';
import { EGraph } from '../../src/dsl/egraph/EGraph.js';
import { parsePattern, matchPattern, instantiatePattern } from '../../src/dsl/egraph/Pattern.js';
import { saturate } from '../../src/dsl/egraph/Rewriter.js';
import { coreRules, rule } from '../../src/dsl/egraph/Rules.js';
import { extractBest, extractWithCSE } from '../../src/dsl/egraph/Extractor.js';
import { addExpression } from '../../src/dsl/egraph/Convert.js';
import { Expression } from '../../src/dsl/AST.js';

describe('E-Graph Core', () => {
  it('should add and find e-nodes', () => {
    const eg = new EGraph();
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const sum = eg.add({ tag: 'add', children: [a, b] });

    expect(eg.find(a)).toBe(a);
    expect(eg.find(b)).toBe(b);
    expect(eg.find(sum)).toBe(sum);
    expect(eg.size).toBe(3);
  });

  it('should merge e-classes', () => {
    const eg = new EGraph();
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });

    eg.merge(a, b);
    eg.rebuild();

    expect(eg.find(a)).toBe(eg.find(b));
    expect(eg.size).toBe(1);
  });

  it('should hash-cons identical nodes', () => {
    const eg = new EGraph();
    const a1 = eg.add({ tag: 'var', name: 'a' });
    const a2 = eg.add({ tag: 'var', name: 'a' });

    expect(a1).toBe(a2);
    expect(eg.size).toBe(1);
  });
});

describe('Pattern Matching', () => {
  it('should parse and match simple patterns', () => {
    const eg = new EGraph();
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const sum = eg.add({ tag: 'add', children: [a, b] });

    const pattern = parsePattern('(+ ?x ?y)');
    const matches = matchPattern(eg, pattern, sum);

    expect(matches.length).toBe(1);
    expect(matches[0].get('x')).toBe(a);
    expect(matches[0].get('y')).toBe(b);
  });

  it('should match number literals', () => {
    const eg = new EGraph();
    const zero = eg.add({ tag: 'num', value: 0 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const sum = eg.add({ tag: 'add', children: [zero, a] });

    const pattern = parsePattern('(+ 0 ?x)');
    const matches = matchPattern(eg, pattern, sum);

    expect(matches.length).toBe(1);
    expect(matches[0].get('x')).toBe(a);
  });
});

describe('Rewrite Rules', () => {
  it('should apply identity rule: 0 + a = a', () => {
    const eg = new EGraph();
    const zero = eg.add({ tag: 'num', value: 0 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const sum = eg.add({ tag: 'add', children: [zero, a] });

    const rules = [rule('add-0-l', '(+ 0 ?a)', '?a')];
    saturate(eg, rules);

    // After saturation, sum and a should be in same e-class
    expect(eg.find(sum)).toBe(eg.find(a));
  });

  it('should apply commutativity: a + b = b + a', () => {
    const eg = new EGraph();
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });

    const rules = [rule('comm-add', '(+ ?a ?b)', '(+ ?b ?a)')];
    saturate(eg, rules, { maxIterations: 5 });

    // Should have created b + a and merged with a + b
    const ba = eg.lookup({ tag: 'add', children: [b, a] });
    expect(ba).toBeDefined();
    expect(eg.find(ab)).toBe(eg.find(ba!));
  });

  it('should apply mul by 1: 1 * a = a', () => {
    const eg = new EGraph();
    const one = eg.add({ tag: 'num', value: 1 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const prod = eg.add({ tag: 'mul', children: [one, a] });

    const rules = [rule('mul-1-l', '(* 1 ?a)', '?a')];
    saturate(eg, rules);

    expect(eg.find(prod)).toBe(eg.find(a));
  });

  it('should apply mul by 0: 0 * a = 0', () => {
    const eg = new EGraph();
    const zero = eg.add({ tag: 'num', value: 0 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const prod = eg.add({ tag: 'mul', children: [zero, a] });

    const rules = [rule('mul-0-l', '(* 0 ?a)', '0')];
    saturate(eg, rules);

    expect(eg.find(prod)).toBe(eg.find(zero));
  });
});

describe('Extraction', () => {
  it('should extract simplest form', () => {
    const eg = new EGraph();
    const zero = eg.add({ tag: 'num', value: 0 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const sum = eg.add({ tag: 'add', children: [zero, a] });

    // Apply identity rule
    const rules = [rule('add-0-l', '(+ 0 ?a)', '?a')];
    saturate(eg, rules);

    // Extract from sum's e-class - should get 'a', not '0 + a'
    const result = extractBest(eg, sum);
    expect(result.kind).toBe('variable');
    expect((result as any).name).toBe('a');
  });

  it('should extract with CSE for shared subexpressions', () => {
    const eg = new EGraph();

    // Build: (a + b) * c and (a + b) * d
    // (a + b) is shared
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const d = eg.add({ tag: 'var', name: 'd' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const abc = eg.add({ tag: 'mul', children: [ab, c] });
    const abd = eg.add({ tag: 'mul', children: [ab, d] });

    const result = extractWithCSE(eg, [abc, abd], undefined, 1);

    // (a + b) should be extracted as a temp since it's used twice
    expect(result.temps.size).toBeGreaterThanOrEqual(1);
  });
});

describe('AST Conversion', () => {
  it('should convert AST to e-graph and back', () => {
    const eg = new EGraph();

    const expr: Expression = {
      kind: 'binary',
      operator: '+',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'number', value: 1 }
    };

    const classId = addExpression(eg, expr);
    const extracted = extractBest(eg, classId);

    expect(extracted.kind).toBe('binary');
    expect((extracted as any).operator).toBe('+');
  });

  it('should apply identity during extraction', () => {
    const eg = new EGraph();

    // x + 0
    const expr: Expression = {
      kind: 'binary',
      operator: '+',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'number', value: 0 }
    };

    const classId = addExpression(eg, expr);
    saturate(eg, coreRules, { maxIterations: 10 });
    const extracted = extractBest(eg, classId);

    // Should extract just 'x'
    expect(extracted.kind).toBe('variable');
    expect((extracted as any).name).toBe('x');
  });
});
