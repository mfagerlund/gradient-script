# E-Graph Implementation Plan for GradientScript

## Overview

Implement a minimal e-graph (equality graph) system to replace or augment the current CSE optimization. E-graphs represent expression equivalence classes, enabling discovery of the smallest equivalent expression through algebraic rewriting.

## Why E-Graphs?

**Current limitations:**
- `a * b` and `b * a` require canonical serialization to match
- `(2 * x) * y` vs `2 * (x * y)` are structurally different despite equivalence
- Two-pass CSE substitution can't handle all associativity cases
- Missed optimizations when AST structure differs

**E-graphs solve this:**
- All equivalent expressions share the same e-class
- Rewrite rules saturate the graph with equivalences
- Cost-based extraction picks the smallest representation
- Common subexpressions emerge naturally as shared e-nodes

---

## Architecture

### Core Data Structures

```
src/dsl/egraph/
├── EGraph.ts        # Main e-graph with union-find
├── ENode.ts         # Expression nodes (hash-consed)
├── EClass.ts        # Equivalence classes
├── Pattern.ts       # Pattern matching for rewrites
├── Rewriter.ts      # Rewrite rule engine
├── Extractor.ts     # Cost-based extraction
└── Rules.ts         # Algebraic rewrite rules
```

### ENode (Expression Node)

```typescript
type ENodeKind =
  | { tag: 'num'; value: number }
  | { tag: 'var'; name: string }
  | { tag: 'add'; children: [EClassId, EClassId] }
  | { tag: 'mul'; children: [EClassId, EClassId] }
  | { tag: 'sub'; children: [EClassId, EClassId] }
  | { tag: 'div'; children: [EClassId, EClassId] }
  | { tag: 'pow'; children: [EClassId, EClassId] }
  | { tag: 'neg'; child: EClassId }
  | { tag: 'call'; name: string; children: EClassId[] }
  | { tag: 'component'; object: EClassId; field: string }

type EClassId = number;
```

### EClass (Equivalence Class)

```typescript
interface EClass {
  id: EClassId;
  nodes: Set<ENode>;      // All equivalent representations
  parents: Set<ENode>;    // Nodes that reference this class
}
```

### EGraph

```typescript
class EGraph {
  private classes: Map<EClassId, EClass>;
  private unionFind: UnionFind;
  private hashcons: Map<string, EClassId>;  // canonical lookup

  add(expr: Expression): EClassId;           // Add expression, return class
  merge(a: EClassId, b: EClassId): EClassId; // Union two classes
  find(id: EClassId): EClassId;              // Find canonical class
  rebuild(): void;                           // Restore invariants after merges
}
```

---

## Rewrite Rules

### Phase 1: Core Algebraic Rules

These rules are essential and safe (always valid):

```typescript
const coreRules: Rule[] = [
  // === Commutativity ===
  rule("comm-add", "(+ ?a ?b)", "(+ ?b ?a)"),
  rule("comm-mul", "(* ?a ?b)", "(* ?b ?a)"),

  // === Associativity ===
  rule("assoc-add-l", "(+ (+ ?a ?b) ?c)", "(+ ?a (+ ?b ?c))"),
  rule("assoc-add-r", "(+ ?a (+ ?b ?c))", "(+ (+ ?a ?b) ?c)"),
  rule("assoc-mul-l", "(* (* ?a ?b) ?c)", "(* ?a (* ?b ?c))"),
  rule("assoc-mul-r", "(* ?a (* ?b ?c))", "(* (* ?a ?b) ?c)"),

  // === Identity ===
  rule("add-0-l", "(+ 0 ?a)", "?a"),
  rule("add-0-r", "(+ ?a 0)", "?a"),
  rule("mul-1-l", "(* 1 ?a)", "?a"),
  rule("mul-1-r", "(* ?a 1)", "?a"),
  rule("sub-0", "(- ?a 0)", "?a"),
  rule("div-1", "(/ ?a 1)", "?a"),
  rule("pow-1", "(^ ?a 1)", "?a"),

  // === Zero ===
  rule("mul-0-l", "(* 0 ?a)", "0"),
  rule("mul-0-r", "(* ?a 0)", "0"),
  rule("div-0", "(/ 0 ?a)", "0"),  // a ≠ 0 assumed
  rule("pow-0", "(^ ?a 0)", "1"),  // a ≠ 0 assumed

  // === Inverse ===
  rule("sub-self", "(- ?a ?a)", "0"),
  rule("div-self", "(/ ?a ?a)", "1"),  // a ≠ 0 assumed

  // === Double Negation ===
  rule("neg-neg", "(- (- ?a))", "?a"),
  rule("neg-mul-l", "(* (- ?a) (- ?b))", "(* ?a ?b)"),
];
```

### Phase 2: Algebraic Identities

More powerful but can cause expansion:

```typescript
const algebraRules: Rule[] = [
  // === Distribution (bidirectional) ===
  rule("dist-mul-add", "(* ?a (+ ?b ?c))", "(+ (* ?a ?b) (* ?a ?c))"),
  rule("factor-add", "(+ (* ?a ?b) (* ?a ?c))", "(* ?a (+ ?b ?c))"),

  // === Negation propagation ===
  rule("neg-add", "(- (+ ?a ?b))", "(+ (- ?a) (- ?b))"),
  rule("neg-mul", "(* (- ?a) ?b)", "(- (* ?a ?b))"),
  rule("sub-neg", "(- ?a (- ?b))", "(+ ?a ?b)"),

  // === Division to multiplication ===
  rule("div-to-mul", "(/ ?a ?b)", "(* ?a (/ 1 ?b))"),
  rule("mul-div", "(* ?a (/ 1 ?a))", "1"),

  // === Power rules ===
  rule("pow-2", "(^ ?a 2)", "(* ?a ?a)"),
  rule("pow-add", "(* (^ ?a ?n) (^ ?a ?m))", "(^ ?a (+ ?n ?m))"),
  rule("pow-mul", "(^ (^ ?a ?n) ?m)", "(^ ?a (* ?n ?m))"),
];
```

### Phase 3: Function-Specific Rules

```typescript
const functionRules: Rule[] = [
  // === Sqrt ===
  rule("sqrt-sq", "(* (sqrt ?a) (sqrt ?a))", "?a"),
  rule("sqrt-mul", "(sqrt (* ?a ?b))", "(* (sqrt ?a) (sqrt ?b))"),
  rule("sqrt-div", "(sqrt (/ ?a ?b))", "(/ (sqrt ?a) (sqrt ?b))"),
  rule("sqrt-pow2", "(sqrt (^ ?a 2))", "(abs ?a)"),

  // === Trig ===
  rule("sin-neg", "(sin (- ?a))", "(- (sin ?a))"),
  rule("cos-neg", "(cos (- ?a))", "(cos ?a)"),

  // === Exp/Log ===
  rule("exp-0", "(exp 0)", "1"),
  rule("log-1", "(log 1)", "0"),
  rule("exp-log", "(exp (log ?a))", "?a"),
  rule("log-exp", "(log (exp ?a))", "?a"),
];
```

---

## Cost Function

The cost function determines which equivalent expression to extract:

```typescript
function cost(node: ENode, classCosts: Map<EClassId, number>): number {
  switch (node.tag) {
    case 'num': return 1;
    case 'var': return 1;
    case 'neg': return 1 + classCosts.get(node.child)!;
    case 'add':
    case 'sub':
    case 'mul':
      return 1 + classCosts.get(node.children[0])! + classCosts.get(node.children[1])!;
    case 'div':
      // Division is expensive (encourage factoring out)
      return 5 + classCosts.get(node.children[0])! + classCosts.get(node.children[1])!;
    case 'pow':
      return 3 + classCosts.get(node.children[0])! + classCosts.get(node.children[1])!;
    case 'call':
      // Function calls are moderately expensive
      return 3 + node.children.reduce((sum, c) => sum + classCosts.get(c)!, 0);
    case 'component':
      return 1 + classCosts.get(node.object)!;
  }
}
```

**CSE bonus:** Shared e-classes (referenced multiple times) get cost reduction:

```typescript
function extractWithCSE(egraph: EGraph, root: EClassId): { temps: Map<string, Expression>, expr: Expression } {
  const refCounts = countReferences(egraph, root);

  // Extract temps for classes with multiple references
  const temps = new Map<string, Expression>();
  for (const [classId, count] of refCounts) {
    if (count >= 2 && classCost(classId) > 1) {
      temps.set(`_tmp${temps.size}`, extractBest(egraph, classId));
    }
  }

  return { temps, expr: extractBest(egraph, root, temps) };
}
```

---

## Pattern Matching

Pattern language for rewrite rules:

```typescript
type Pattern =
  | { tag: 'var'; name: string }           // ?a matches anything
  | { tag: 'num'; value: number }          // 0, 1, 2 match literals
  | { tag: 'op'; op: string; args: Pattern[] }  // (+ ?a ?b)

interface Match {
  subst: Map<string, EClassId>;  // ?a -> class123
}

function matchPattern(egraph: EGraph, pattern: Pattern, classId: EClassId): Match[] {
  // Returns all ways the pattern matches the e-class
}

function instantiate(egraph: EGraph, pattern: Pattern, subst: Map<string, EClassId>): EClassId {
  // Create/find e-class for pattern with substitution applied
}
```

---

## Saturation Algorithm

```typescript
function saturate(egraph: EGraph, rules: Rule[], maxIterations: number = 30): void {
  for (let i = 0; i < maxIterations; i++) {
    const matches: Array<{ rule: Rule; match: Match; classId: EClassId }> = [];

    // Find all rule matches
    for (const rule of rules) {
      for (const classId of egraph.classes.keys()) {
        for (const match of matchPattern(egraph, rule.lhs, classId)) {
          matches.push({ rule, match, classId });
        }
      }
    }

    if (matches.length === 0) break;  // Saturated

    // Apply all matches
    for (const { rule, match, classId } of matches) {
      const newClassId = instantiate(egraph, rule.rhs, match.subst);
      egraph.merge(classId, newClassId);
    }

    egraph.rebuild();  // Restore invariants
  }
}
```

---

## Integration with GradientScript

### Option A: Replace CSE entirely

```typescript
// In CodeGen.ts
function optimizeGradients(gradients: Map<string, Map<string, Expression>>): GlobalCSEResult {
  const egraph = new EGraph();

  // Add all gradient expressions
  const rootClasses = new Map<string, Map<string, EClassId>>();
  for (const [param, components] of gradients) {
    const compClasses = new Map<string, EClassId>();
    for (const [comp, expr] of components) {
      compClasses.set(comp, egraph.add(expr));
    }
    rootClasses.set(param, compClasses);
  }

  // Saturate with rewrite rules
  saturate(egraph, [...coreRules, ...algebraRules, ...functionRules]);

  // Extract with CSE
  return extractWithCSE(egraph, rootClasses);
}
```

### Option B: E-graph as CSE enhancement

Keep current pipeline, use e-graph only for canonicalization:

```typescript
// Add to CSE.ts
function canonicalizeWithEgraph(expr: Expression): Expression {
  const egraph = new EGraph();
  const root = egraph.add(expr);
  saturate(egraph, coreRules, 10);  // Limited saturation
  return extractBest(egraph, root);
}
```

---

## Implementation Order

### Step 1: Core E-Graph (EGraph.ts, ENode.ts, EClass.ts)
- Union-find with path compression
- Hash-consing for e-nodes
- Add/merge/find operations
- Rebuild for congruence closure

### Step 2: Pattern Matching (Pattern.ts)
- Parse pattern strings to Pattern AST
- Match patterns against e-classes
- Instantiate patterns with substitutions

### Step 3: Rewrite Engine (Rewriter.ts, Rules.ts)
- Define Rule type
- Implement saturation loop
- Add core rules (commutativity, identity, etc.)

### Step 4: Extraction (Extractor.ts)
- Cost function
- Bottom-up extraction
- CSE detection (shared classes)

### Step 5: Integration
- Convert AST ↔ E-graph
- Replace or augment CSE.ts
- Update CodeGen.ts

### Step 6: Testing
- Unit tests for each component
- Integration tests with reprojection-v.gs
- Verify gradient correctness maintained

---

## Expected Results

**Before (current CSE):**
- 144 lines for reprojection-v.ts
- Some expressions not deduplicated due to structural differences

**After (e-graph):**
- Estimated 100-120 lines
- All equivalent expressions share e-classes
- Optimal CSE extraction via cost function
- Better factoring of common subexpressions

---

## References

- [egg: Easy, Efficient, and Extensible E-graphs](https://arxiv.org/abs/2004.03082) - Max Willsey et al.
- [Equality Saturation: A New Approach to Optimization](https://dl.acm.org/doi/10.1145/1480881.1480915) - Tate et al.
- [Herbie rewrite rules](https://github.com/herbie-fp/herbie/blob/main/src/core/rules.rkt)
- [Stephen Diehl's E-Graphs in Rust](https://www.stephendiehl.com/posts/egraphs/)
- [Philip Zucker's egglog examples](https://www.philipzucker.com/egglog_z3_simp/)

---

## Risk Assessment

**Low risk:**
- E-graph operations are well-understood
- Rewrite rules preserve mathematical equivalence
- Extraction produces valid expressions

**Medium risk:**
- Performance: saturation can be slow for large expression sets
- Mitigation: limit iterations, use rule scheduling

**Verification:**
- All gradients still verified against numerical differentiation
- Any extraction bug will be caught by verification
