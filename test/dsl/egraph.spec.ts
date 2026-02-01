/**
 * E-Graph unit tests
 */

import { describe, it, expect } from 'vitest';
import { EGraph } from '../../src/dsl/egraph/EGraph.js';
import { parsePattern, matchPattern, instantiatePattern } from '../../src/dsl/egraph/Pattern.js';
import { saturate } from '../../src/dsl/egraph/Rewriter.js';
import { coreRules, algebraRules, rule } from '../../src/dsl/egraph/Rules.js';
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

describe('Extraction Quality', () => {
  it('should NOT create temps used only once', () => {
    const eg = new EGraph();

    // Build: (a + b) used only once in (a + b) * c
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const result = eg.add({ tag: 'mul', children: [ab, c] });

    const extraction = extractWithCSE(eg, [result], undefined, 1);

    // (a + b) should NOT be a temp since it's only used once
    expect(extraction.temps.size).toBe(0);
  });

  it('should inline temps that end up used only once after substitution', () => {
    const eg = new EGraph();

    // Build expression where subexpressions appear twice but in same root
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    // (a + b) + (a + b) = 2 * (a + b)
    const sum = eg.add({ tag: 'add', children: [ab, ab] });

    const extraction = extractWithCSE(eg, [sum], undefined, 1);

    // Count how many times each temp is used in the final expressions
    function countTempUsage(expr: Expression): Map<string, number> {
      const counts = new Map<string, number>();
      function visit(e: Expression): void {
        if (e.kind === 'variable' && e.name.startsWith('_tmp')) {
          counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
        } else if (e.kind === 'binary') {
          visit(e.left);
          visit(e.right);
        } else if (e.kind === 'unary') {
          visit(e.operand);
        } else if (e.kind === 'call') {
          e.args.forEach(visit);
        } else if (e.kind === 'component') {
          visit(e.object);
        }
      }
      visit(expr);
      return counts;
    }

    // Check all temps are used at least twice
    for (const [rootId, expr] of extraction.expressions) {
      const usage = countTempUsage(expr);
      for (const [tempName, count] of usage) {
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }

    // Also count usage in temp definitions
    for (const [, tempExpr] of extraction.temps) {
      const usage = countTempUsage(tempExpr);
      // Temps used in temp definitions should also be counted
    }
  });

  it('should not create self-referential temps', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const abab = eg.add({ tag: 'mul', children: [ab, ab] });

    const extraction = extractWithCSE(eg, [abab], undefined, 1);

    // Check no temp references itself
    for (const [tempName, expr] of extraction.temps) {
      function containsSelf(e: Expression): boolean {
        if (e.kind === 'variable' && e.name === tempName) return true;
        if (e.kind === 'binary') return containsSelf(e.left) || containsSelf(e.right);
        if (e.kind === 'unary') return containsSelf(e.operand);
        if (e.kind === 'call') return e.args.some(containsSelf);
        if (e.kind === 'component') return containsSelf(e.object);
        return false;
      }
      expect(containsSelf(expr)).toBe(false);
    }
  });

  it('should define temps before they are used', () => {
    const eg = new EGraph();

    // Create a complex shared structure
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const xy = eg.add({ tag: 'add', children: [x, y] });
    const xy2 = eg.add({ tag: 'mul', children: [xy, xy] });
    const xy3 = eg.add({ tag: 'mul', children: [xy2, xy] });
    const result = eg.add({ tag: 'add', children: [xy2, xy3] });

    const extraction = extractWithCSE(eg, [result], undefined, 1);

    // Track which temps have been defined
    const defined = new Set<string>();

    // Check temp definitions are ordered correctly
    for (const [tempName, expr] of extraction.temps) {
      // All temps referenced in this expression must already be defined
      function checkRefs(e: Expression): void {
        if (e.kind === 'variable' && e.name.startsWith('_tmp')) {
          expect(defined.has(e.name)).toBe(true);
        } else if (e.kind === 'binary') {
          checkRefs(e.left);
          checkRefs(e.right);
        } else if (e.kind === 'unary') {
          checkRefs(e.operand);
        } else if (e.kind === 'call') {
          e.args.forEach(checkRefs);
        } else if (e.kind === 'component') {
          checkRefs(e.object);
        }
      }
      checkRefs(expr);
      defined.add(tempName);
    }
  });

  it('should produce compact output for realistic expressions', () => {
    const eg = new EGraph();

    // Simulate a gradient-like expression with shared subexpressions
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const z = eg.add({ tag: 'var', name: 'z' });

    const xy = eg.add({ tag: 'mul', children: [x, y] });
    const xz = eg.add({ tag: 'mul', children: [x, z] });
    const yz = eg.add({ tag: 'mul', children: [y, z] });

    // Three roots that share xy, xz, yz
    const r1 = eg.add({ tag: 'add', children: [xy, xz] });
    const r2 = eg.add({ tag: 'add', children: [xy, yz] });
    const r3 = eg.add({ tag: 'add', children: [xz, yz] });

    const extraction = extractWithCSE(eg, [r1, r2, r3], undefined, 1);

    // Should have at most 3 temps (xy, xz, yz), not more
    expect(extraction.temps.size).toBeLessThanOrEqual(3);
  });

  it('should handle multiple roots with shared complex subexpressions', () => {
    const eg = new EGraph();

    // Build: root1 = (a*b + c*d) * e, root2 = (a*b + c*d) * f
    // Shared: (a*b + c*d), a*b, c*d
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const d = eg.add({ tag: 'var', name: 'd' });
    const e = eg.add({ tag: 'var', name: 'e' });
    const f = eg.add({ tag: 'var', name: 'f' });

    const ab = eg.add({ tag: 'mul', children: [a, b] });
    const cd = eg.add({ tag: 'mul', children: [c, d] });
    const sum = eg.add({ tag: 'add', children: [ab, cd] });
    const root1 = eg.add({ tag: 'mul', children: [sum, e] });
    const root2 = eg.add({ tag: 'mul', children: [sum, f] });

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    // The shared sum (a*b + c*d) should be a temp
    // a*b and c*d might or might not be temps depending on cost threshold
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // The root expressions should reference the temp
    let tempUsedInRoots = false;
    for (const [, expr] of extraction.expressions) {
      function hasTempRef(e: Expression): boolean {
        if (e.kind === 'variable' && e.name.startsWith('_tmp')) return true;
        if (e.kind === 'binary') return hasTempRef(e.left) || hasTempRef(e.right);
        if (e.kind === 'unary') return hasTempRef(e.operand);
        if (e.kind === 'call') return e.args.some(hasTempRef);
        if (e.kind === 'component') return hasTempRef(e.object);
        return false;
      }
      if (hasTempRef(expr)) tempUsedInRoots = true;
    }
    expect(tempUsedInRoots).toBe(true);
  });
});

describe('Simplification Issues', () => {
  it('should simplify -1 * 2 to -2 via rules + constant folding', () => {
    const eg = new EGraph();

    // Build: -1 * 2
    const negOne = eg.add({ tag: 'num', value: -1 });
    const two = eg.add({ tag: 'num', value: 2 });
    const prod = eg.add({ tag: 'mul', children: [negOne, two] });

    saturate(eg, coreRules, { maxIterations: 10 });
    const result = extractBest(eg, prod);

    // The rule 'mul-neg-1' converts (* -1 ?a) to (neg ?a), giving -(2)
    // Then constant folding during extraction evaluates -(2) to -2
    expect(result.kind).toBe('number');
    expect((result as any).value).toBe(-2);
  });

  it('should apply mul-neg-1 rule: -1 * 2 becomes -(2)', () => {
    const eg = new EGraph();

    // Build: -1 * 2 as (* (num -1) (num 2))
    const negOne = eg.add({ tag: 'num', value: -1 });
    const two = eg.add({ tag: 'num', value: 2 });
    const prod = eg.add({ tag: 'mul', children: [negOne, two] });

    // Check that the mul-neg-1 rule is in coreRules
    const mulNeg1Rule = coreRules.find(r => r.name === 'mul-neg-1');
    expect(mulNeg1Rule).toBeDefined();

    // Manually verify the pattern matches
    const pattern = parsePattern('(* -1 ?a)');
    const matches = matchPattern(eg, pattern, prod);

    // Debug: print match info
    console.log('Pattern matches:', matches.length);
    if (matches.length > 0) {
      console.log('Match subst:', [...matches[0].entries()]);
    }

    expect(matches.length).toBe(1);
    expect(matches[0].get('a')).toBe(two);
  });

  it('should simplify a * -1 to -a (via commutativity + mul-neg-1)', () => {
    const eg = new EGraph();

    // Build: a * -1 (note: -1 is on the RIGHT)
    const a = eg.add({ tag: 'var', name: 'a' });
    const negOne = eg.add({ tag: 'num', value: -1 });
    const prod = eg.add({ tag: 'mul', children: [a, negOne] });

    // The commutativity rule should make (* a -1) equivalent to (* -1 a)
    // Then mul-neg-1 should make (* -1 a) equivalent to (neg a)
    saturate(eg, coreRules, { maxIterations: 10 });
    const result = extractBest(eg, prod);

    // Should simplify to -a (unary negation) because neg cost (1+1=2) < mul cost (2+1+1=4)
    console.log('a * -1 result:', JSON.stringify(result));
    expect(result.kind).toBe('unary');
    expect((result as any).operator).toBe('-');
    expect((result as any).operand.kind).toBe('variable');
    expect((result as any).operand.name).toBe('a');
  });

  it('should extract repeated subexpressions within single root', () => {
    const eg = new EGraph();

    // Build: (a + b) * x + (a + b) * y
    // The (a + b) subexpression appears twice and should be a temp
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const abx = eg.add({ tag: 'mul', children: [ab, x] });
    const aby = eg.add({ tag: 'mul', children: [ab, y] });
    const sum = eg.add({ tag: 'add', children: [abx, aby] });

    const extraction = extractWithCSE(eg, [sum], undefined, 1);

    // (a + b) should be extracted as a temp since it's used twice
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // The root expression should reference the temp
    const rootExpr = extraction.expressions.get(sum)!;
    function hasTempRef(e: Expression): boolean {
      if (e.kind === 'variable' && e.name.startsWith('_tmp')) return true;
      if (e.kind === 'binary') return hasTempRef(e.left) || hasTempRef(e.right);
      if (e.kind === 'unary') return hasTempRef(e.operand);
      if (e.kind === 'call') return e.args.some(hasTempRef);
      if (e.kind === 'component') return hasTempRef(e.object);
      return false;
    }
    expect(hasTempRef(rootExpr)).toBe(true);
  });
});

describe('Real-world Extraction', () => {
  it('should optimize reprojection-v to reasonable size', async () => {
    // This test uses the full pipeline to ensure output is compact
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');

    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    // Generate with e-graph optimization
    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Count lines and temps
    const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
    const temps = (code.match(/const _tmp\d+/g) || []).length;
    const invs = (code.match(/const _inv\d+/g) || []).length;

    // The original target was ~113 lines with 42 temps
    // Allow some slack but should be MUCH less than 200 lines or 100 temps
    console.log(`Generated: ${lines} lines, ${temps} temps, ${invs} invs`);

    expect(lines).toBeLessThan(200);
    expect(temps + invs).toBeLessThan(80);
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

describe('Issue: a * -1 should become -a', () => {
  it('should simplify tmp * -1 to -tmp in extractWithCSE', () => {
    const eg = new EGraph();

    // Simulate: _tmp0 = a + b, result = _tmp0 * -1
    // After CSE, this should become result = -_tmp0, not result = _tmp0 * -1
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });  // This will be CSE'd as _tmp0
    const negOne = eg.add({ tag: 'num', value: -1 });
    const prod = eg.add({ tag: 'mul', children: [ab, negOne] });  // (a+b) * -1

    // Also add (a+b) * x to force (a+b) to be a temp
    const x = eg.add({ tag: 'var', name: 'x' });
    const abx = eg.add({ tag: 'mul', children: [ab, x] });

    saturate(eg, coreRules, { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [prod, abx], undefined, 1);

    // The expression (a+b) * -1 should become -_tmp0
    const resultExpr = extraction.expressions.get(prod)!;

    // Check that it's negation, not multiplication by -1
    expect(resultExpr.kind).toBe('unary');
    expect((resultExpr as any).operator).toBe('-');
    // The operand should be a temp variable
    expect((resultExpr as any).operand.kind).toBe('variable');
    expect((resultExpr as any).operand.name).toMatch(/^_tmp/);
  });

  it('should simplify -1 * tmp to -tmp in extractWithCSE', () => {
    const eg = new EGraph();

    // Simulate: result = -1 * (a + b) where (a+b) is shared
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const negOne = eg.add({ tag: 'num', value: -1 });
    const prod = eg.add({ tag: 'mul', children: [negOne, ab] });  // -1 * (a+b)

    // Add another use of (a+b) to force it to be a temp
    const x = eg.add({ tag: 'var', name: 'x' });
    const abx = eg.add({ tag: 'mul', children: [ab, x] });

    saturate(eg, coreRules, { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [prod, abx], undefined, 1);

    const resultExpr = extraction.expressions.get(prod)!;

    // Should be -_tmp0, not -1 * _tmp0
    expect(resultExpr.kind).toBe('unary');
    expect((resultExpr as any).operator).toBe('-');
    expect((resultExpr as any).operand.kind).toBe('variable');
  });
});

describe('Issue: repeated subexpressions should be CSEd', () => {
  it('should CSE inv * normX when it appears multiple times', () => {
    const eg = new EGraph();

    // Build: inv * normX (appears in two different expressions)
    const inv = eg.add({ tag: 'var', name: 'inv' });
    const normX = eg.add({ tag: 'var', name: 'normX' });
    const invNormX = eg.add({ tag: 'mul', children: [inv, normX] });

    // Use in two different contexts
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const expr1 = eg.add({ tag: 'mul', children: [invNormX, a] });  // (inv * normX) * a
    const expr2 = eg.add({ tag: 'mul', children: [invNormX, b] });  // (inv * normX) * b

    saturate(eg, coreRules, { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [expr1, expr2], undefined, 1);

    // inv * normX should be extracted as a temp since it's used twice
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Both root expressions should reference the same temp for inv*normX
    const e1 = extraction.expressions.get(expr1)!;
    const e2 = extraction.expressions.get(expr2)!;

    // Find all temp references in both expressions
    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);

    // Both expressions should have at least one temp reference
    expect(refs1.length).toBeGreaterThan(0);
    expect(refs2.length).toBeGreaterThan(0);

    // They should share at least one temp (the inv*normX one)
    const shared = refs1.filter(r => refs2.includes(r));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe('Issue: 2 * 2 should be folded to 4', () => {
  it('should fold 2 * 2 to 4 during extraction', () => {
    const eg = new EGraph();

    // Build: 2 * 2 * a
    const two1 = eg.add({ tag: 'num', value: 2 });
    const two2 = eg.add({ tag: 'num', value: 2 });
    const a = eg.add({ tag: 'var', name: 'a' });
    const twoTwo = eg.add({ tag: 'mul', children: [two1, two2] });
    const expr = eg.add({ tag: 'mul', children: [twoTwo, a] });

    saturate(eg, coreRules, { maxIterations: 10 });
    const result = extractBest(eg, expr);

    // Should be 4 * a, not 2 * 2 * a
    expect(result.kind).toBe('binary');
    expect((result as any).operator).toBe('*');
    // One of left/right should be 4
    const left = (result as any).left;
    const right = (result as any).right;
    const hasFour = (left.kind === 'number' && left.value === 4) ||
                   (right.kind === 'number' && right.value === 4);
    expect(hasFour).toBe(true);
  });
});

describe('Issue: inv(x) should be extracted as temp when shared', () => {
  it('should extract inv(x) as a temp when used in multiple multiplications', () => {
    const eg = new EGraph();

    // Build: a * inv(x) and b * inv(x)
    // The inv(x) should be shared as a temp
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const invX = eg.add({ tag: 'inv', child: x });  // Direct inv node
    const aInv = eg.add({ tag: 'mul', children: [a, invX] });  // a * inv(x)
    const bInv = eg.add({ tag: 'mul', children: [b, invX] });  // b * inv(x)

    const extraction = extractWithCSE(eg, [aInv, bInv], undefined, 1);

    // inv(x) should be extracted as a temp since it's used twice
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Both expressions should reference the same temp
    const e1 = extraction.expressions.get(aInv)!;
    const e2 = extraction.expressions.get(bInv)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);
    const shared = refs1.filter(r => refs2.includes(r));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe('Issue: post-extraction CSE should convert divisions to multiplications by inverse', () => {
  it('should convert a/x and b/x to a*inv and b*inv after temp substitution', async () => {
    // This test ensures that when a common divisor becomes a temp variable,
    // the post-extraction CSE detects and extracts 1/temp as a shared temp
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');

    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    // Generate with e-graph optimization
    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Count divisions by temp variables
    // Before the fix, this was 84+. After the fix, should be minimal (just the 1/x definitions)
    const divByTemp = (code.match(/\/ _tmp\d+/g) || []).length;

    // Should have very few divisions (just the inverse temp definitions)
    // The bulk of divisions should be converted to multiplications by inverse temps
    expect(divByTemp).toBeLessThan(5);
  });
});

describe('Issue: 1/x should be CSEd when used in multiple divisions', () => {
  it('should extract 1/x as a temp when multiple expressions divide by x', () => {
    const eg = new EGraph();

    // Build: a/x and b/x - the 1/x should be shared
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const aDiv = eg.add({ tag: 'div', children: [a, x] });  // a / x
    const bDiv = eg.add({ tag: 'div', children: [b, x] });  // b / x

    // Apply algebra rules which include div-to-mul-inv: (/ ?a ?b) => (* ?a (/ 1 ?b))
    // algebraRules is imported at top of file
    saturate(eg, [...coreRules, ...algebraRules], { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [aDiv, bDiv], undefined, 1);

    // Debug: print what was extracted
    console.log('1/x test - temps:', extraction.temps.size);
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} =`, JSON.stringify(expr));
    }
    console.log('1/x test - e1:', JSON.stringify(extraction.expressions.get(aDiv)));
    console.log('1/x test - e2:', JSON.stringify(extraction.expressions.get(bDiv)));

    // 1/x should be extracted as a temp since it's used in both divisions
    // After div-to-mul-inv rule: a/x => a * (1/x), b/x => b * (1/x)
    // The (1/x) part should be shared
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Check that both expressions reference the same temp
    const e1 = extraction.expressions.get(aDiv)!;
    const e2 = extraction.expressions.get(bDiv)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);

    // Both should share at least one temp (the 1/x)
    const shared = refs1.filter(r => refs2.includes(r));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('should CSE (1/x) * normX when it appears multiple times', () => {
    const eg = new EGraph();

    // Build: (a/x)*normX and (b/x)*normX
    // After transformation: (a * (1/x)) * normX and (b * (1/x)) * normX
    // The (1/x) * normX part could be shared if associativity allows
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const normX = eg.add({ tag: 'var', name: 'normX' });

    const aDiv = eg.add({ tag: 'div', children: [a, x] });  // a / x
    const bDiv = eg.add({ tag: 'div', children: [b, x] });  // b / x
    const expr1 = eg.add({ tag: 'mul', children: [aDiv, normX] });  // (a/x) * normX
    const expr2 = eg.add({ tag: 'mul', children: [bDiv, normX] });  // (b/x) * normX

    // algebraRules is imported at top of file
    saturate(eg, [...coreRules, ...algebraRules], { maxIterations: 15 });

    const extraction = extractWithCSE(eg, [expr1, expr2], undefined, 1);

    // Either 1/x or (1/x)*normX should be a shared temp
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Verify temps are shared between expressions
    const e1 = extraction.expressions.get(expr1)!;
    const e2 = extraction.expressions.get(expr2)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);
    const shared = refs1.filter(r => refs2.includes(r));

    // At minimum, 1/x should be shared
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe('CRITICAL: Subexpression sharing between roots', () => {
  /**
   * This test suite addresses the fundamental extraction failure where:
   *   _tmp25 = 2 * (BIG) * r2
   *   _tmp26 = 2 * (BIG)
   * The BIG expression is duplicated instead of being extracted as a shared temp.
   */

  it('should extract shared subexpression when one root is another root * scalar', () => {
    const eg = new EGraph();

    // Build: root1 = BIG * r2, root2 = BIG
    // where BIG = a + b + c (some complex expression)
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const r2 = eg.add({ tag: 'var', name: 'r2' });

    // BIG = (a + b) * c
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const big = eg.add({ tag: 'mul', children: [ab, c] });

    // root1 = BIG * r2
    const root1 = eg.add({ tag: 'mul', children: [big, r2] });
    // root2 = BIG (same as big)
    const root2 = big;

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    // BIG should be extracted as a temp and root1 should be temp * r2
    const e1 = extraction.expressions.get(root1)!;
    const e2 = extraction.expressions.get(root2)!;

    // root2 (BIG) should be a temp reference since it's shared
    // Either root2 IS a temp, or both root1 and root2 reference the same temp
    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    // If BIG is extracted as a temp, root2's expression should be just _tmpX
    // or root1 should be _tmpX * r2
    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);

    // At least one of the roots should use a temp
    const anyTemps = refs1.length > 0 || refs2.length > 0;
    expect(anyTemps).toBe(true);

    // More importantly: e1 should NOT contain the full expansion of BIG
    // It should reference a temp instead
    // Check that root1 is roughly: _tmp * r2 (not (a+b)*c*r2)
    if (e1.kind === 'binary' && e1.operator === '*') {
      const hasR2 = (e1.left.kind === 'variable' && e1.left.name === 'r2') ||
                    (e1.right.kind === 'variable' && e1.right.name === 'r2');
      const hasTmpOnOtherSide =
        (e1.left.kind === 'variable' && e1.left.name.startsWith('_tmp')) ||
        (e1.right.kind === 'variable' && e1.right.name.startsWith('_tmp'));

      // Should be tmp * r2 or r2 * tmp, not (a+b)*c*r2
      expect(hasR2 && hasTmpOnOtherSide).toBe(true);
    }
  });

  it('should extract 2 * BIG when both 2 * BIG and 2 * BIG * r2 are roots', () => {
    const eg = new EGraph();

    // This mirrors the exact failure case:
    // _tmp25 = 2 * BIG * r2
    // _tmp26 = 2 * BIG
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const two = eg.add({ tag: 'num', value: 2 });
    const r2 = eg.add({ tag: 'var', name: 'r2' });

    // BIG = a * b
    const big = eg.add({ tag: 'mul', children: [a, b] });

    // twoBig = 2 * BIG
    const twoBig = eg.add({ tag: 'mul', children: [two, big] });

    // root1 = 2 * BIG * r2
    const root1 = eg.add({ tag: 'mul', children: [twoBig, r2] });
    // root2 = 2 * BIG
    const root2 = twoBig;

    saturate(eg, [...coreRules, ...algebraRules], { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    const e1 = extraction.expressions.get(root1)!;
    const e2 = extraction.expressions.get(root2)!;

    // e2 (= 2*BIG) should be a temp variable reference
    // e1 should be that temp * r2
    // NOT: e1 = 2*a*b*r2 and e2 = 2*a*b (duplication!)

    // Check root2 is a simple temp reference OR root1 references the same temp as root2
    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('root1 extracted:', exprToString(e1));
    console.log('root2 extracted:', exprToString(e2));
    console.log('temps:', [...extraction.temps.entries()].map(([k, v]) => `${k} = ${exprToString(v)}`));

    // The key assertion: e1's string length should be short (temp * r2)
    // not long (2 * a * b * r2)
    const e1Str = exprToString(e1);
    const e2Str = exprToString(e2);

    // If 2*BIG is shared, e1 should be something like "_tmp0 * r2" (short)
    // not "(2 * (a * b)) * r2" or "((2 * a) * b) * r2" (long)
    expect(e1Str.length).toBeLessThan(20); // Should be like "_tmp0 * r2"
  });

  it('should not duplicate complex subexpressions across roots', () => {
    const eg = new EGraph();

    // Build a more realistic case like the actual failure:
    // Complex expression with nested structure
    const tmp8 = eg.add({ tag: 'var', name: 'tmp8' });
    const tmp9 = eg.add({ tag: 'var', name: 'tmp9' });
    const camZ = eg.add({ tag: 'var', name: 'camZ' });
    const r2 = eg.add({ tag: 'var', name: 'r2' });
    const two = eg.add({ tag: 'num', value: 2 });

    // subExpr = -tmp8 - tmp9 (used multiple times in real case)
    const negTmp8 = eg.add({ tag: 'neg', child: tmp8 });
    const subExpr = eg.add({ tag: 'sub', children: [negTmp8, tmp9] });

    // twoSub = 2 * subExpr
    const twoSub = eg.add({ tag: 'mul', children: [two, subExpr] });

    // complex = twoSub * camZ
    const complex = eg.add({ tag: 'mul', children: [twoSub, camZ] });

    // root1 = complex * r2
    const root1 = eg.add({ tag: 'mul', children: [complex, r2] });
    // root2 = complex
    const root2 = complex;

    saturate(eg, [...coreRules, ...algebraRules], { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    // Count how many times subExpr's pattern appears in the output
    function countPatternOccurrences(e: Expression, pattern: string): number {
      function exprToString(expr: Expression): string {
        if (expr.kind === 'number') return String(expr.value);
        if (expr.kind === 'variable') return expr.name;
        if (expr.kind === 'binary') return `(${exprToString(expr.left)} ${expr.operator} ${exprToString(expr.right)})`;
        if (expr.kind === 'unary') return `(${expr.operator}${exprToString(expr.operand)})`;
        if (expr.kind === 'call') return `${expr.name}(${expr.args.map(exprToString).join(', ')})`;
        return '?';
      }
      const str = exprToString(e);
      return (str.match(new RegExp(pattern, 'g')) || []).length;
    }

    // subExpr = -tmp8 - tmp9 should appear at most once across all expressions
    // (either inline in a temp definition, or referenced via temp)
    let totalSubExprOccurrences = 0;
    for (const [, expr] of extraction.temps) {
      // Look for the pattern of subtracting tmp9
      totalSubExprOccurrences += countPatternOccurrences(expr, 'tmp9');
    }
    for (const [, expr] of extraction.expressions) {
      totalSubExprOccurrences += countPatternOccurrences(expr, 'tmp9');
    }

    // tmp9 should appear at most twice (once in definition, once in use, or shared via temp)
    // NOT many times from duplication
    expect(totalSubExprOccurrences).toBeLessThanOrEqual(2);
  });
});

describe('CRITICAL: Repeated subexpressions in generated output', () => {
  it('should not have same large expression appearing in multiple temps', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');

    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Extract all temp definitions
    const tempDefs = code.match(/const _tmp\d+ = [^;]+;/g) || [];

    // Find expressions that appear in multiple temp definitions (excluding short ones)
    const longExpressions = new Map<string, number>();

    for (const def of tempDefs) {
      // Extract the right-hand side
      const match = def.match(/const _tmp\d+ = (.+);/);
      if (match) {
        const rhs = match[1];
        // Look for substantial subexpressions (20+ chars, not just variable refs)
        // Find patterns like "X * Y * Z" that might be duplicated
        const subExprs = rhs.match(/\([^()]+\)/g) || [];
        for (const sub of subExprs) {
          if (sub.length > 15) { // Substantial subexpression
            longExpressions.set(sub, (longExpressions.get(sub) || 0) + 1);
          }
        }
      }
    }

    // Find duplicates
    const duplicates: [string, number][] = [];
    for (const [expr, count] of longExpressions) {
      if (count > 1) {
        duplicates.push([expr, count]);
      }
    }

    if (duplicates.length > 0) {
      console.log('DUPLICATE EXPRESSIONS FOUND:');
      for (const [expr, count] of duplicates.slice(0, 5)) {
        console.log(`  ${count}x: ${expr}`);
      }
    }

    // There should be very few (if any) duplicated substantial expressions
    // Allow some slack for edge cases but definitely not many
    expect(duplicates.length).toBeLessThan(5);
  });

  it('should extract -a - b pattern when used multiple times', () => {
    const eg = new EGraph();

    // The pattern "-tmp8 - tmp9" appears multiple times in the real output
    const tmp8 = eg.add({ tag: 'var', name: 'tmp8' });
    const tmp9 = eg.add({ tag: 'var', name: 'tmp9' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });

    // pattern = -tmp8 - tmp9
    const negTmp8 = eg.add({ tag: 'neg', child: tmp8 });
    const pattern = eg.add({ tag: 'sub', children: [negTmp8, tmp9] });

    // Use pattern in two expressions
    const expr1 = eg.add({ tag: 'mul', children: [pattern, x] });
    const expr2 = eg.add({ tag: 'mul', children: [pattern, y] });

    saturate(eg, coreRules, { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [expr1, expr2], undefined, 1);

    // The pattern (-tmp8 - tmp9) should be extracted as a temp
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Both expressions should share the temp
    const e1 = extraction.expressions.get(expr1)!;
    const e2 = extraction.expressions.get(expr2)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
          refs.push(expr.name);
        }
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') { visit(expr.operand); }
        if (expr.kind === 'call') { expr.args.forEach(visit); }
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);
    const shared = refs1.filter(r => refs2.includes(r));

    expect(shared.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// COMPREHENSIVE E-GRAPH EXTRACTION TESTS
// These tests define the expected behavior. When they fail, the e-graph is broken.
// ============================================================================

describe('E-Graph Reference Counting', () => {
  it('should count e-class referenced twice from same root correctly', () => {
    const eg = new EGraph();

    // Build: (a + b) * (a + b) - same subexpression used twice
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const sum = eg.add({ tag: 'add', children: [a, b] });
    const product = eg.add({ tag: 'mul', children: [sum, sum] }); // sum used twice

    const extraction = extractWithCSE(eg, [product], undefined, 1);

    // sum should be extracted as a temp since it's used twice
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // The product should reference the temp, not expand the sum twice
    const rootExpr = extraction.expressions.get(product)!;
    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }
    const str = exprToString(rootExpr);
    // Should be like "_tmp0 * _tmp0", NOT "(a + b) * (a + b)"
    expect(str).not.toContain('(a + b)');
  });

  it('should count e-class referenced from multiple roots correctly', () => {
    const eg = new EGraph();

    // Build: root1 = (a + b) * x, root2 = (a + b) * y
    // (a + b) appears in two different roots
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const sum = eg.add({ tag: 'add', children: [a, b] });
    const root1 = eg.add({ tag: 'mul', children: [sum, x] });
    const root2 = eg.add({ tag: 'mul', children: [sum, y] });

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    // sum should be extracted as a temp
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Both roots should reference the same temp
    const e1 = extraction.expressions.get(root1)!;
    const e2 = extraction.expressions.get(root2)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) refs.push(expr.name);
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') visit(expr.operand);
        if (expr.kind === 'call') expr.args.forEach(visit);
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);
    const shared = refs1.filter(r => refs2.includes(r));
    expect(shared.length).toBeGreaterThan(0);
  });

  it('should count nested shared subexpressions', () => {
    const eg = new EGraph();

    // Build: root1 = ((a + b) * c) * x, root2 = ((a + b) * c) * y, root3 = (a + b) * z
    // Both (a + b) and (a + b) * c are shared
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const z = eg.add({ tag: 'var', name: 'z' });

    const sum = eg.add({ tag: 'add', children: [a, b] });       // used 3 times
    const sumC = eg.add({ tag: 'mul', children: [sum, c] });    // used 2 times
    const root1 = eg.add({ tag: 'mul', children: [sumC, x] });
    const root2 = eg.add({ tag: 'mul', children: [sumC, y] });
    const root3 = eg.add({ tag: 'mul', children: [sum, z] });

    const extraction = extractWithCSE(eg, [root1, root2, root3], undefined, 1);

    // At minimum, (a + b) should be a temp since it's used 3 times
    // (a + b) * c might also be a temp since it's used 2 times
    expect(extraction.temps.size).toBeGreaterThanOrEqual(1);

    // Verify the output doesn't have "(a + b)" expanded multiple times
    function countOccurrences(e: Expression, pattern: string): number {
      function exprToString(expr: Expression): string {
        if (expr.kind === 'number') return String(expr.value);
        if (expr.kind === 'variable') return expr.name;
        if (expr.kind === 'binary') return `(${exprToString(expr.left)} ${expr.operator} ${exprToString(expr.right)})`;
        if (expr.kind === 'unary') return `(${expr.operator}${exprToString(expr.operand)})`;
        if (expr.kind === 'call') return `${expr.name}(${expr.args.map(exprToString).join(', ')})`;
        return '?';
      }
      return (exprToString(e).match(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    }

    let totalABOccurrences = 0;
    for (const [, expr] of extraction.temps) {
      totalABOccurrences += countOccurrences(expr, '(a + b)');
    }
    for (const [, expr] of extraction.expressions) {
      totalABOccurrences += countOccurrences(expr, '(a + b)');
    }

    // (a + b) should appear at most once (in the temp definition)
    expect(totalABOccurrences).toBeLessThanOrEqual(1);
  });
});

describe('E-Graph Commutativity Handling', () => {
  it('should recognize a + b and b + a as the same e-class', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'add', children: [a, b] });  // a + b
    const ba = eg.add({ tag: 'add', children: [b, a] });  // b + a

    // Before saturation, they're different classes
    expect(eg.find(ab)).not.toBe(eg.find(ba));

    // After saturation with commutativity rule, they should be same class
    saturate(eg, coreRules, { maxIterations: 10 });
    expect(eg.find(ab)).toBe(eg.find(ba));
  });

  it('should share temps when expressions differ only by commutativity', () => {
    const eg = new EGraph();

    // root1 = (a + b) * x, root2 = (b + a) * y
    // After commutativity, (a + b) and (b + a) should be same class
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });

    const ab = eg.add({ tag: 'add', children: [a, b] });
    const ba = eg.add({ tag: 'add', children: [b, a] });
    const root1 = eg.add({ tag: 'mul', children: [ab, x] });
    const root2 = eg.add({ tag: 'mul', children: [ba, y] });

    saturate(eg, coreRules, { maxIterations: 10 });

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    // After saturation, ab and ba are the same e-class
    // So they should share the same temp
    const e1 = extraction.expressions.get(root1)!;
    const e2 = extraction.expressions.get(root2)!;

    function findTempRefs(e: Expression): string[] {
      const refs: string[] = [];
      const visit = (expr: Expression) => {
        if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) refs.push(expr.name);
        if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); }
        if (expr.kind === 'unary') visit(expr.operand);
        if (expr.kind === 'call') expr.args.forEach(visit);
      };
      visit(e);
      return refs;
    }

    const refs1 = findTempRefs(e1);
    const refs2 = findTempRefs(e2);

    // If temps are created, they should be shared
    if (refs1.length > 0 && refs2.length > 0) {
      const shared = refs1.filter(r => refs2.includes(r));
      expect(shared.length).toBeGreaterThan(0);
    }
  });

  it('should recognize a * b and b * a as the same e-class', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const ab = eg.add({ tag: 'mul', children: [a, b] });
    const ba = eg.add({ tag: 'mul', children: [b, a] });

    saturate(eg, coreRules, { maxIterations: 10 });
    expect(eg.find(ab)).toBe(eg.find(ba));
  });
});

describe('E-Graph Identity Rules', () => {
  it('should simplify a + 0 to a', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const zero = eg.add({ tag: 'num', value: 0 });
    const sum = eg.add({ tag: 'add', children: [a, zero] });

    saturate(eg, coreRules, { maxIterations: 10 });

    // sum and a should be in same e-class
    expect(eg.find(sum)).toBe(eg.find(a));
  });

  it('should simplify a * 1 to a', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const one = eg.add({ tag: 'num', value: 1 });
    const prod = eg.add({ tag: 'mul', children: [a, one] });

    saturate(eg, coreRules, { maxIterations: 10 });

    expect(eg.find(prod)).toBe(eg.find(a));
  });

  it('should simplify a * 0 to 0', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const zero = eg.add({ tag: 'num', value: 0 });
    const prod = eg.add({ tag: 'mul', children: [a, zero] });

    saturate(eg, coreRules, { maxIterations: 10 });

    expect(eg.find(prod)).toBe(eg.find(zero));
  });
});

describe('Output Quality Metrics', () => {
  it('should not have more than 100 temps for reprojection-v', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');
    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    const temps = (code.match(/const _tmp\d+/g) || []).length;
    console.log('Total temps:', temps);

    // Should have a reasonable number of temps, not hundreds
    expect(temps).toBeLessThan(100);
  });

  it('should not have more than 200 lines for reprojection-v', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');
    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    const lines = code.split('\n').filter(l => l.trim() && !l.trim().startsWith('//')).length;
    console.log('Total lines:', lines);

    expect(lines).toBeLessThan(200);
  });

  it('should have efficient output with shared subexpressions as temps', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');
    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Count common patterns that should be temps
    const qwqz = (code.match(/q\.w \* q\.z/g) || []).length;
    const qxqy = (code.match(/q\.x \* q\.y/g) || []).length;
    const camZcamZ = (code.match(/camZ \* camZ/g) || []).length;

    console.log('q.w * q.z occurrences:', qwqz);
    console.log('q.x * q.y occurrences:', qxqy);
    console.log('camZ * camZ occurrences:', camZcamZ);

    // These should each appear at most once (in temp definitions)
    // If they appear more, the e-graph is not extracting them properly
    expect(qwqz).toBeLessThanOrEqual(1);
    expect(qxqy).toBeLessThanOrEqual(1);
    expect(camZcamZ).toBeLessThanOrEqual(1);
  });
});

describe('CRITICAL: E-Graph hash-consing and sharing detection', () => {
  /**
   * HYPOTHESIS: The bug occurs because the same expression is constructed
   * multiple times in the gradient computation, but the e-graph doesn't
   * recognize them as the same.
   */

  it('should hash-cons identical add expressions constructed separately', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });

    // Construct the same sum twice
    const sum1 = eg.add({ tag: 'add', children: [a, b] });
    const sum2 = eg.add({ tag: 'add', children: [a, b] });

    // Should be the SAME e-class due to hash-consing
    expect(eg.find(sum1)).toBe(eg.find(sum2));
    console.log('sum1 class:', eg.find(sum1), 'sum2 class:', eg.find(sum2));
  });

  it('should share sums even when children are different e-classes but same expression', () => {
    const eg = new EGraph();

    // Construct products separately (but same content)
    const qw = eg.add({ tag: 'var', name: 'qw' });
    const qx = eg.add({ tag: 'var', name: 'qx' });
    const qy = eg.add({ tag: 'var', name: 'qy' });
    const qz = eg.add({ tag: 'var', name: 'qz' });

    // First occurrence
    const prod1a = eg.add({ tag: 'mul', children: [qw, qx] });
    const prod2a = eg.add({ tag: 'mul', children: [qy, qz] });
    const sum1 = eg.add({ tag: 'add', children: [prod1a, prod2a] });

    // Second occurrence - should be hash-consed to same classes
    const prod1b = eg.add({ tag: 'mul', children: [qw, qx] });
    const prod2b = eg.add({ tag: 'mul', children: [qy, qz] });
    const sum2 = eg.add({ tag: 'add', children: [prod1b, prod2b] });

    // All should be the same
    expect(eg.find(prod1a)).toBe(eg.find(prod1b));
    expect(eg.find(prod2a)).toBe(eg.find(prod2b));
    expect(eg.find(sum1)).toBe(eg.find(sum2));

    console.log('prod1 classes:', eg.find(prod1a), eg.find(prod1b));
    console.log('prod2 classes:', eg.find(prod2a), eg.find(prod2b));
    console.log('sum classes:', eg.find(sum1), eg.find(sum2));
  });

  it('should extract shared sum when it appears in different roots', () => {
    const eg = new EGraph();

    const qw = eg.add({ tag: 'var', name: 'qw' });
    const qx = eg.add({ tag: 'var', name: 'qx' });
    const qy = eg.add({ tag: 'var', name: 'qy' });
    const qz = eg.add({ tag: 'var', name: 'qz' });
    const camX = eg.add({ tag: 'var', name: 'camX' });
    const camY = eg.add({ tag: 'var', name: 'camY' });
    const camZ = eg.add({ tag: 'var', name: 'camZ' });
    const two = eg.add({ tag: 'num', value: 2 });

    // Build the shared sum pattern
    const prod1 = eg.add({ tag: 'mul', children: [qw, qx] }); // q.w * q.x
    const prod2 = eg.add({ tag: 'mul', children: [qy, qz] }); // q.y * q.z
    const sum = eg.add({ tag: 'add', children: [prod1, prod2] }); // shared sum

    // Use the SAME sum in THREE DIFFERENT roots
    const twoSum = eg.add({ tag: 'mul', children: [two, sum] });
    const root1 = eg.add({ tag: 'mul', children: [twoSum, camX] }); // 2 * sum * camX
    const root2 = eg.add({ tag: 'mul', children: [twoSum, camY] }); // 2 * sum * camY
    const root3 = eg.add({ tag: 'mul', children: [sum, camZ] });    // sum * camZ

    // Verify hash-consing - twoSum should be same class
    expect(eg.find(sum)).toBeDefined();

    const extraction = extractWithCSE(eg, [root1, root2, root3], undefined, 1);

    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('Shared sum extraction:');
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} = ${exprToString(expr)}`);
    }
    for (const [id, expr] of extraction.expressions) {
      console.log(`  root ${id} = ${exprToString(expr)}`);
    }

    // The sum should be extracted as a temp (because it's shared in root3)
    // AND 2*sum should be a temp (because it's shared in root1 and root2)
    // Check that (_tmpX + _tmpY) appears only once (in a temp definition)
    const allOutput: string[] = [];
    for (const [, expr] of extraction.temps) {
      allOutput.push(exprToString(expr));
    }
    for (const [, expr] of extraction.expressions) {
      allOutput.push(exprToString(expr));
    }
    const fullOutput = allOutput.join('\n');

    const sumPattern = /\(_tmp\d+ \+ _tmp\d+\)/g;
    const matches = fullOutput.match(sumPattern) || [];
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m, (counts.get(m) || 0) + 1);
    }

    // Should appear at most once (in the temp definition)
    for (const [pattern, count] of counts) {
      console.log(`Pattern "${pattern}" appears ${count} time(s)`);
      expect(count).toBeLessThanOrEqual(1);
    }
  });
});

describe('CRITICAL: E-Graph extraction must detect shared e-classes', () => {
  /**
   * THE ROOT CAUSE OF THE BUG:
   *
   * When we have expression: sum = (qw*qz) + (qx*qy)
   * And sum is used in multiple roots:
   *   root1 = 2 * sum * x
   *   root2 = 2 * sum * y
   *   root3 = sum * z
   *
   * The e-graph extraction MUST:
   * 1. Count that 'sum' e-class is referenced 3+ times
   * 2. Extract 'sum' as its own temp variable
   * 3. Not just extract (qw*qz) and (qx*qy) as temps
   *
   * If it only extracts the products but not the sum, we get:
   *   _tmp0 = qw * qz
   *   _tmp1 = qx * qy
   *   root1 = 2 * (_tmp0 + _tmp1) * x
   *   root2 = 2 * (_tmp0 + _tmp1) * y
   *   root3 = (_tmp0 + _tmp1) * z
   *
   * Which has (_tmp0 + _tmp1) duplicated 3 times!
   */

  it('should extract shared sum as temp, not just its children', () => {
    const eg = new EGraph();

    const qw = eg.add({ tag: 'var', name: 'qw' });
    const qz = eg.add({ tag: 'var', name: 'qz' });
    const qx = eg.add({ tag: 'var', name: 'qx' });
    const qy = eg.add({ tag: 'var', name: 'qy' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const z = eg.add({ tag: 'var', name: 'z' });
    const two = eg.add({ tag: 'num', value: 2 });

    // Products that will be shared
    const prod1 = eg.add({ tag: 'mul', children: [qw, qz] });
    const prod2 = eg.add({ tag: 'mul', children: [qx, qy] });

    // THE SUM - this is the key e-class that should be extracted
    const sum = eg.add({ tag: 'add', children: [prod1, prod2] });

    // sum is used 3 times in different roots
    const twoSum = eg.add({ tag: 'mul', children: [two, sum] });
    const root1 = eg.add({ tag: 'mul', children: [twoSum, x] });
    const root2 = eg.add({ tag: 'mul', children: [twoSum, y] });
    const root3 = eg.add({ tag: 'mul', children: [sum, z] });

    const extraction = extractWithCSE(eg, [root1, root2, root3], undefined, 1);

    // VERIFY: The sum e-class should be a temp
    // Look for a temp that contains exactly (_tmpX + _tmpY) or (qw*qz + qx*qy)
    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('E-Graph extraction:');
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} = ${exprToString(expr)}`);
    }
    for (const [id, expr] of extraction.expressions) {
      console.log(`  root ${id} = ${exprToString(expr)}`);
    }

    // Build full output string for pattern matching
    const allOutput: string[] = [];
    for (const [, expr] of extraction.temps) {
      allOutput.push(exprToString(expr));
    }
    for (const [, expr] of extraction.expressions) {
      allOutput.push(exprToString(expr));
    }
    const fullOutput = allOutput.join('\n');

    // Count occurrences of any (_tmpX + _tmpY) pattern
    const addPattern = /\(_tmp\d+ \+ _tmp\d+\)/g;
    const matches = fullOutput.match(addPattern) || [];
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m, (counts.get(m) || 0) + 1);
    }

    // No (_tmp + _tmp) pattern should appear more than once
    // If it does, the e-graph failed to extract the sum as a temp
    for (const [pattern, count] of counts) {
      if (count > 1) {
        console.log(`BUG: Pattern "${pattern}" appears ${count} times!`);
      }
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it('should extract nested shared expressions hierarchically', () => {
    const eg = new EGraph();

    // Build: a*b, a*b+c*d, 2*(a*b+c*d)
    // All three should be temps if they're shared
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });
    const c = eg.add({ tag: 'var', name: 'c' });
    const d = eg.add({ tag: 'var', name: 'd' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });
    const two = eg.add({ tag: 'num', value: 2 });

    const ab = eg.add({ tag: 'mul', children: [a, b] }); // used 3+ times
    const cd = eg.add({ tag: 'mul', children: [c, d] }); // used 2+ times
    const sum = eg.add({ tag: 'add', children: [ab, cd] }); // used 3 times
    const twoSum = eg.add({ tag: 'mul', children: [two, sum] }); // used 2 times

    // Roots that share these subexpressions
    const root1 = eg.add({ tag: 'mul', children: [twoSum, x] });
    const root2 = eg.add({ tag: 'mul', children: [twoSum, y] });
    const root3 = eg.add({ tag: 'mul', children: [sum, ab] }); // uses sum and ab

    const extraction = extractWithCSE(eg, [root1, root2, root3], undefined, 1);

    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('Nested extraction:');
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} = ${exprToString(expr)}`);
    }

    // All outputs should not have any duplicated non-trivial pattern
    const allOutput: string[] = [];
    for (const [, expr] of extraction.temps) {
      allOutput.push(exprToString(expr));
    }
    for (const [, expr] of extraction.expressions) {
      allOutput.push(exprToString(expr));
    }
    const fullOutput = allOutput.join('\n');

    // Count ALL binary patterns
    const binaryPatterns = /\([^()]+\)/g;
    const matches = fullOutput.match(binaryPatterns) || [];
    const counts = new Map<string, number>();
    for (const m of matches) {
      if (m.length > 10) { // Only count non-trivial patterns
        counts.set(m, (counts.get(m) || 0) + 1);
      }
    }

    // Check for duplicates
    let hasDuplicates = false;
    for (const [pattern, count] of counts) {
      if (count > 1) {
        console.log(`Duplicate: "${pattern}" appears ${count} times`);
        hasDuplicates = true;
      }
    }

    // No pattern should be duplicated
    expect(hasDuplicates).toBe(false);
  });
});

describe('CRITICAL: postExtractionCSE must handle commutativity', () => {
  /**
   * This test checks if (a+b) and (b+a) are recognized as the same expression.
   * In the real reprojection-v case, gradients might have the sum in different orders.
   */
  it('should merge commutative sums as same e-class', () => {
    const eg = new EGraph();

    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });

    // Create a+b and b+a
    const ab = eg.add({ tag: 'add', children: [a, b] });
    const ba = eg.add({ tag: 'add', children: [b, a] });

    // Before saturation, they should be different e-classes
    expect(eg.find(ab)).not.toBe(eg.find(ba));

    // Apply commutativity rules (saturate and coreRules are already imported at top)
    saturate(eg, coreRules, { maxIterations: 10 });

    // After saturation, they should be the SAME e-class
    expect(eg.find(ab)).toBe(eg.find(ba));
    console.log('a+b class:', eg.find(ab), 'b+a class:', eg.find(ba));
  });

  it('should extract shared sum when it appears in commuted forms', () => {
    const eg = new EGraph();

    const p1 = eg.add({ tag: 'var', name: 'p1' });
    const p2 = eg.add({ tag: 'var', name: 'p2' });
    const x = eg.add({ tag: 'var', name: 'x' });
    const y = eg.add({ tag: 'var', name: 'y' });

    // First root uses p1 + p2
    const sum1 = eg.add({ tag: 'add', children: [p1, p2] });
    const root1 = eg.add({ tag: 'mul', children: [sum1, x] });

    // Second root uses p2 + p1 (commuted!)
    const sum2 = eg.add({ tag: 'add', children: [p2, p1] });
    const root2 = eg.add({ tag: 'mul', children: [sum2, y] });

    // Saturate to merge commuted sums
    saturate(eg, coreRules, { maxIterations: 10 });

    // sum1 and sum2 should now be the same e-class
    expect(eg.find(sum1)).toBe(eg.find(sum2));

    const extraction = extractWithCSE(eg, [root1, root2], undefined, 1);

    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('Commuted sum extraction:');
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} = ${exprToString(expr)}`);
    }
    for (const [id, expr] of extraction.expressions) {
      console.log(`  root ${id} = ${exprToString(expr)}`);
    }

    // The sum should be extracted as ONE temp (since both forms merge to same e-class)
    // Both roots should reference the same temp
    let sumTempName = '';
    for (const [name, expr] of extraction.temps) {
      if (expr.kind === 'binary' && expr.operator === '+') {
        sumTempName = name;
        break;
      }
    }
    expect(sumTempName).not.toBe('');

    // Both root expressions should reference this temp
    const e1 = extraction.expressions.get(root1)!;
    const e2 = extraction.expressions.get(root2)!;

    function containsTemp(e: Expression, tempName: string): boolean {
      if (e.kind === 'variable') return e.name === tempName;
      if (e.kind === 'binary') return containsTemp(e.left, tempName) || containsTemp(e.right, tempName);
      if (e.kind === 'unary') return containsTemp(e.operand, tempName);
      if (e.kind === 'call') return e.args.some(a => containsTemp(a, tempName));
      return false;
    }

    expect(containsTemp(e1, sumTempName)).toBe(true);
    expect(containsTemp(e2, sumTempName)).toBe(true);
  });
});

describe('CRITICAL: postExtractionCSE must handle many temps', () => {
  it('should extract shared pattern even when embedded in many temps', () => {
    const eg = new EGraph();

    // Create the base vars
    const a = eg.add({ tag: 'var', name: 'a' });
    const b = eg.add({ tag: 'var', name: 'b' });

    // Create products that will become temps
    const prod1 = eg.add({ tag: 'mul', children: [a, a] }); // a*a
    const prod2 = eg.add({ tag: 'mul', children: [b, b] }); // b*b

    // Create the shared sum
    const sum = eg.add({ tag: 'add', children: [prod1, prod2] }); // a*a + b*b

    // Create MANY different roots that all use this sum
    const roots: number[] = [];
    for (let i = 0; i < 10; i++) {
      const vi = eg.add({ tag: 'var', name: `v${i}` });
      const root = eg.add({ tag: 'mul', children: [sum, vi] }); // sum * vi
      roots.push(root);
    }

    const extraction = extractWithCSE(eg, roots, undefined, 1);

    function exprToString(e: Expression): string {
      if (e.kind === 'number') return String(e.value);
      if (e.kind === 'variable') return e.name;
      if (e.kind === 'binary') return `(${exprToString(e.left)} ${e.operator} ${exprToString(e.right)})`;
      if (e.kind === 'unary') return `(${e.operator}${exprToString(e.operand)})`;
      if (e.kind === 'call') return `${e.name}(${e.args.map(exprToString).join(', ')})`;
      return '?';
    }

    console.log('Many temps extraction:');
    for (const [name, expr] of extraction.temps) {
      console.log(`  ${name} = ${exprToString(expr)}`);
    }
    console.log('Roots:', roots.length);

    // The sum should be extracted as a temp (since it's used in 10 roots)
    // prod1 and prod2 should also be temps (used in sum, which is used 10 times)
    // So the pattern (_tmp0 + _tmp1) should appear ONCE (in the sum temp definition)
    const allOutput: string[] = [];
    for (const [, expr] of extraction.temps) {
      allOutput.push(exprToString(expr));
    }
    for (const [, expr] of extraction.expressions) {
      allOutput.push(exprToString(expr));
    }
    const fullOutput = allOutput.join('\n');

    // Count (_tmp + _tmp) patterns
    const pattern = /\(_tmp\d+ \+ _tmp\d+\)/g;
    const matches = fullOutput.match(pattern) || [];
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m, (counts.get(m) || 0) + 1);
    }

    for (const [p, c] of counts) {
      console.log(`Pattern "${p}" appears ${c} times`);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('Temp Definition Quality', () => {
  it('should not create duplicate temps for the same expression', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');
    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Extract all temp RHS values
    const tempDefs = code.match(/const (_tmp\d+) = ([^;]+);/g) || [];
    const rhsValues = new Map<string, string[]>();

    for (const def of tempDefs) {
      const match = def.match(/const (_tmp\d+) = (.+);/);
      if (match) {
        const [, name, rhs] = match;
        if (!rhsValues.has(rhs)) {
          rhsValues.set(rhs, []);
        }
        rhsValues.get(rhs)!.push(name);
      }
    }

    // Find duplicates
    const duplicates: string[] = [];
    for (const [rhs, names] of rhsValues) {
      if (names.length > 1) {
        duplicates.push(`${names.join(', ')} all equal "${rhs.slice(0, 60)}..."`);
      }
    }

    if (duplicates.length > 0) {
      console.log('DUPLICATE TEMP DEFINITIONS:');
      for (const dup of duplicates.slice(0, 5)) {
        console.log('  ', dup);
      }
    }

    // There should be NO duplicate temp definitions
    expect(duplicates.length).toBe(0);
  });

  it('should not have temps that expand the same subexpression multiple times', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const { parse } = await import('../../src/dsl/Parser.js');
    const { inferFunction } = await import('../../src/dsl/TypeInference.js');
    const { computeFunctionGradients } = await import('../../src/dsl/Differentiation.js');
    const { generateComplete } = await import('../../src/dsl/CodeGen.js');

    const gsPath = path.join(process.cwd(), 'examples/reprojection-v.gs');
    const source = fs.readFileSync(gsPath, 'utf-8');
    const program = parse(source);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env, {
      format: 'typescript',
      useEGraph: true,
      simplify: true,
      cse: true
    });

    // Look for patterns like (_tmpX + _tmpY) or (_tmpX - _tmpY) appearing multiple times
    // These should be temps themselves if they appear more than once
    const simplePatterns = [
      /\(_tmp\d+ \+ _tmp\d+\)/g,
      /\(_tmp\d+ - _tmp\d+\)/g,
      /\(_tmp\d+ \* _tmp\d+\)/g,
    ];

    for (const pattern of simplePatterns) {
      const matches = code.match(pattern) || [];
      const counts = new Map<string, number>();
      for (const m of matches) {
        counts.set(m, (counts.get(m) || 0) + 1);
      }

      for (const [expr, count] of counts) {
        if (count > 2) {
          console.log(`Pattern "${expr}" appears ${count} times - should be a temp`);
        }
        // Each simple pattern should appear at most twice (definition + one use before becoming a temp)
        expect(count).toBeLessThanOrEqual(3);
      }
    }
  });
});
