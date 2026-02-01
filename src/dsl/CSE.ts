/**
 * Common Subexpression Elimination (CSE)
 * Identifies repeated expressions and factors them out
 */

import {
  Expression,
  FunctionCall,
  BinaryOp,
  UnaryOp,
  ComponentAccess,
  Variable,
  NumberLiteral
} from './AST.js';
import { ExpressionTransformer } from './ExpressionTransformer.js';
import { serializeExpression, serializeCanonical } from './ExpressionUtils.js';

export interface CSEResult {
  intermediates: Map<string, Expression>;
  simplified: Expression;
}

export interface StructuredCSEResult {
  intermediates: Map<string, Expression>;
  components: Map<string, Expression>;
}

/**
 * Perform CSE on an expression
 */
export function eliminateCommonSubexpressions(expr: Expression, minCount: number = 2): CSEResult {
  const counter = new ExpressionCounter();
  counter.count(expr);

  const intermediates = new Map<string, Expression>();
  let varCounter = 0;

  const subexprMap = new Map<string, string>();

  for (const [exprStr, count] of counter.counts.entries()) {
    if (count >= minCount) {
      const parsed = counter.expressions.get(exprStr);
      if (parsed && shouldExtract(parsed)) {
        const varName = `_tmp${varCounter++}`;
        intermediates.set(varName, parsed);
        subexprMap.set(exprStr, varName);
      }
    }
  }

  const simplified = substituteExpressions(expr, subexprMap, counter);

  return { intermediates, simplified };
}

/**
 * Perform CSE on structured gradients (for structured types like {x, y})
 */
export function eliminateCommonSubexpressionsStructured(
  components: Map<string, Expression>,
  minCount: number = 2
): StructuredCSEResult {
  const counter = new ExpressionCounter();

  for (const expr of components.values()) {
    counter.count(expr);
  }

  const intermediates = new Map<string, Expression>();
  let varCounter = 0;

  const subexprMap = new Map<string, string>();

  for (const [exprStr, count] of counter.counts.entries()) {
    if (count >= minCount) {
      const parsed = counter.expressions.get(exprStr);
      if (parsed && shouldExtract(parsed)) {
        const varName = `_tmp${varCounter++}`;
        intermediates.set(varName, parsed);
        subexprMap.set(exprStr, varName);
      }
    }
  }

  const simplifiedComponents = new Map<string, Expression>();
  for (const [comp, expr] of components.entries()) {
    simplifiedComponents.set(comp, substituteExpressions(expr, subexprMap, counter));
  }

  return { intermediates, components: simplifiedComponents };
}

/**
 * Result of global CSE across all gradients
 */
export interface GlobalCSEResult {
  intermediates: Map<string, Expression>;
  gradients: Map<string, Map<string, Expression>>;
}

/**
 * Perform CSE globally across ALL gradient expressions
 * This avoids duplicate intermediate variables like _tmp0 and _tmp4 both being len1*len2
 */
export function eliminateCommonSubexpressionsGlobal(
  allGradients: Map<string, Map<string, Expression>>,
  minCount: number = 2
): GlobalCSEResult {
  const counter = new ExpressionCounter();

  // Count ALL expressions across all gradients
  for (const components of allGradients.values()) {
    for (const expr of components.values()) {
      counter.count(expr);
    }
  }

  const intermediates = new Map<string, Expression>();
  let varCounter = 0;
  const subexprMap = new Map<string, string>();

  // Collect candidates with depths for ordering
  const candidates: Array<{ exprStr: string; expr: Expression; depth: number }> = [];
  for (const [exprStr, count] of counter.counts.entries()) {
    if (count >= minCount) {
      const parsed = counter.expressions.get(exprStr);
      if (parsed && shouldExtract(parsed)) {
        candidates.push({ exprStr, expr: parsed, depth: expressionDepth(parsed) });
      }
    }
  }

  // Sort by depth (shallowest first)
  candidates.sort((a, b) => a.depth - b.depth);

  // Create temps
  for (const { exprStr, expr } of candidates) {
    const varName = `_tmp${varCounter++}`;
    intermediates.set(varName, expr);
    subexprMap.set(exprStr, varName);
  }

  // Post-process: substitute simpler temps into complex temp definitions
  // Use CANONICAL matching so a*b matches b*a (consistent with how expressions were counted)
  const processedIntermediates = new Map<string, Expression>();
  const tempToOriginalKey = new Map<string, string>(); // Original canonical key (before substitution)
  const tempToSubstitutedKey = new Map<string, string>(); // Key after simpler temps substituted

  for (const { exprStr, expr } of candidates) {
    const varName = subexprMap.get(exprStr)!;
    tempToOriginalKey.set(varName, exprStr);

    let simplifiedExpr = expr;

    // PASS 1: Substitute using ORIGINAL keys
    // This substitutes simpler temps (like _tmp3, _tmp4) into this expression
    for (const [processedVarName] of processedIntermediates) {
      const origKey = tempToOriginalKey.get(processedVarName);
      if (origKey) {
        simplifiedExpr = substituteByCanonicalKey(simplifiedExpr, origKey, processedVarName);
      }
    }

    // PASS 2: Substitute using SUBSTITUTED keys
    // This substitutes complex temps (like _tmp68) whose definition has been transformed
    // Now that simpler temps are substituted, complex temps' substituted keys can match
    for (const [processedVarName] of processedIntermediates) {
      const subKey = tempToSubstitutedKey.get(processedVarName);
      if (subKey) {
        simplifiedExpr = substituteByCanonicalKey(simplifiedExpr, subKey, processedVarName);
      }
    }

    // Store the substituted key for later temps to use
    tempToSubstitutedKey.set(varName, serializeCanonical(simplifiedExpr));
    processedIntermediates.set(varName, simplifiedExpr);
  }

  // Apply substitutions to all gradients
  const simplifiedGradients = new Map<string, Map<string, Expression>>();
  for (const [paramName, components] of allGradients.entries()) {
    const simplifiedComponents = new Map<string, Expression>();
    for (const [comp, expr] of components.entries()) {
      simplifiedComponents.set(comp, substituteExpressions(expr, subexprMap, counter));
    }
    simplifiedGradients.set(paramName, simplifiedComponents);
  }

  // Dead code elimination: remove temps that are never used
  const finalIntermediates = eliminateDeadTemps(processedIntermediates, simplifiedGradients);

  // Topologically sort temps so dependencies come first
  const sortedIntermediates = topologicallySortTemps(finalIntermediates);

  return { intermediates: sortedIntermediates, gradients: simplifiedGradients };
}

/**
 * Eliminate dead (unused) temp variables
 * Iterates until no more dead temps are found
 */
function eliminateDeadTemps(
  intermediates: Map<string, Expression>,
  gradients: Map<string, Map<string, Expression>>
): Map<string, Expression> {
  let current = new Map(intermediates);
  let changed = true;

  while (changed) {
    changed = false;
    const usageCounts = new Map<string, number>();

    // Initialize counts to 0
    for (const varName of current.keys()) {
      usageCounts.set(varName, 0);
    }

    // Count usages in temp definitions
    for (const [varName, expr] of current) {
      countTempUsages(expr, usageCounts);
    }

    // Count usages in gradient expressions
    for (const components of gradients.values()) {
      for (const expr of components.values()) {
        countTempUsages(expr, usageCounts);
      }
    }

    // Remove temps with 0 usages
    const filtered = new Map<string, Expression>();
    for (const [varName, expr] of current) {
      if (usageCounts.get(varName)! > 0) {
        filtered.set(varName, expr);
      } else {
        changed = true; // Found dead code, need another pass
      }
    }

    current = filtered;
  }

  return current;
}

/**
 * Count usages of temp variables in an expression
 */
function countTempUsages(expr: Expression, counts: Map<string, number>): void {
  switch (expr.kind) {
    case 'variable':
      if (counts.has(expr.name)) {
        counts.set(expr.name, counts.get(expr.name)! + 1);
      }
      break;
    case 'binary':
      countTempUsages(expr.left, counts);
      countTempUsages(expr.right, counts);
      break;
    case 'unary':
      countTempUsages(expr.operand, counts);
      break;
    case 'call':
      for (const arg of expr.args) {
        countTempUsages(arg, counts);
      }
      break;
    case 'component':
      countTempUsages(expr.object, counts);
      break;
  }
}

/**
 * Substitute subexpressions by structural key match
 */
function substituteByStructuralKey(expr: Expression, structKey: string, replacement: string): Expression {
  if (serializeExpression(expr) === structKey) {
    return { kind: 'variable', name: replacement };
  }

  switch (expr.kind) {
    case 'number':
    case 'variable':
      return expr;

    case 'binary':
      return {
        kind: 'binary',
        operator: expr.operator,
        left: substituteByStructuralKey(expr.left, structKey, replacement),
        right: substituteByStructuralKey(expr.right, structKey, replacement)
      };

    case 'unary':
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: substituteByStructuralKey(expr.operand, structKey, replacement)
      };

    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(arg => substituteByStructuralKey(arg, structKey, replacement))
      };

    case 'component':
      return {
        kind: 'component',
        object: substituteByStructuralKey(expr.object, structKey, replacement),
        component: expr.component
      };
  }
}

/**
 * Substitute subexpressions by canonical key match
 * Uses serializeCanonical so a*b matches b*a
 */
function substituteByCanonicalKey(expr: Expression, canonicalKey: string, replacement: string): Expression {
  if (serializeCanonical(expr) === canonicalKey) {
    return { kind: 'variable', name: replacement };
  }

  switch (expr.kind) {
    case 'number':
    case 'variable':
      return expr;

    case 'binary':
      return {
        kind: 'binary',
        operator: expr.operator,
        left: substituteByCanonicalKey(expr.left, canonicalKey, replacement),
        right: substituteByCanonicalKey(expr.right, canonicalKey, replacement)
      };

    case 'unary':
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: substituteByCanonicalKey(expr.operand, canonicalKey, replacement)
      };

    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(arg => substituteByCanonicalKey(arg, canonicalKey, replacement))
      };

    case 'component':
      return {
        kind: 'component',
        object: substituteByCanonicalKey(expr.object, canonicalKey, replacement),
        component: expr.component
      };
  }
}

/**
 * Calculate expression depth
 */
function expressionDepth(expr: Expression): number {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return 1;
    case 'component':
      return 1 + expressionDepth(expr.object);
    case 'unary':
      return 1 + expressionDepth(expr.operand);
    case 'binary':
      return 1 + Math.max(expressionDepth(expr.left), expressionDepth(expr.right));
    case 'call':
      if (expr.args.length === 0) return 1;
      return 1 + Math.max(...expr.args.map(expressionDepth));
    default:
      return 1;
  }
}

/**
 * Check if an expression should be extracted
 */
function shouldExtract(expr: Expression): boolean {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return false;

    case 'component':
      return expr.object.kind !== 'variable';

    case 'unary':
      return shouldExtract(expr.operand);

    case 'binary':
      return true;

    case 'call':
      return true;

    default:
      return false;
  }
}


/**
 * Counts occurrences of subexpressions during traversal
 */
class ExpressionCounter extends ExpressionTransformer {
  counts = new Map<string, number>();
  expressions = new Map<string, Expression>();

  count(expr: Expression): void {
    this.transform(expr);
  }

  serialize(expr: Expression): string {
    // Use canonical form so a*b and b*a are treated as the same
    return serializeCanonical(expr);
  }

  private recordExpression(expr: Expression): void {
    const key = this.serialize(expr);
    const currentCount = this.counts.get(key) || 0;
    this.counts.set(key, currentCount + 1);

    if (!this.expressions.has(key)) {
      this.expressions.set(key, expr);
    }
  }

  protected visitNumber(node: NumberLiteral): Expression {
    this.recordExpression(node);
    return node;
  }

  protected visitVariable(node: Variable): Expression {
    this.recordExpression(node);
    return node;
  }

  protected visitBinaryOp(node: BinaryOp): Expression {
    this.recordExpression(node);
    return super.visitBinaryOp(node);
  }

  protected visitUnaryOp(node: UnaryOp): Expression {
    this.recordExpression(node);
    return super.visitUnaryOp(node);
  }

  protected visitFunctionCall(node: FunctionCall): Expression {
    this.recordExpression(node);
    return super.visitFunctionCall(node);
  }

  protected visitComponentAccess(node: ComponentAccess): Expression {
    this.recordExpression(node);
    return super.visitComponentAccess(node);
  }
}

/**
 * Substitute common subexpressions with variables
 * IMPORTANT: Must substitute larger (deeper) expressions first to avoid
 * breaking structure before smaller subexpressions can be matched
 */
function substituteExpressions(
  expr: Expression,
  subexprMap: Map<string, string>,
  counter: ExpressionCounter
): Expression {
  const key = counter.serialize(expr);

  if (subexprMap.has(key)) {
    return {
      kind: 'variable',
      name: subexprMap.get(key)!
    };
  }

  // Sort substitutions by depth (deepest first) to substitute larger expressions
  // before their subexpressions
  const sortedSubs: Array<{ exprStr: string; varName: string; depth: number }> = [];
  for (const [exprStr, varName] of subexprMap.entries()) {
    const exprToReplace = counter.expressions.get(exprStr);
    if (exprToReplace) {
      sortedSubs.push({ exprStr, varName, depth: expressionDepth(exprToReplace) });
    }
  }
  sortedSubs.sort((a, b) => b.depth - a.depth); // Deepest first

  let result = expr;
  for (const { exprStr, varName } of sortedSubs) {
    const exprToReplace = counter.expressions.get(exprStr);
    if (exprToReplace && counter.serialize(result) !== exprStr) {
      result = substituteInExpression(result, exprToReplace, { kind: 'variable', name: varName }, counter);
    }
  }

  return result;
}

/**
 * Transformer that substitutes a pattern with a replacement expression
 * Used for CSE optimization to replace repeated subexpressions with intermediate variables
 */
class PatternSubstitutionTransformer extends ExpressionTransformer {
  constructor(
    private pattern: Expression,
    private replacement: Expression,
    private counter: ExpressionCounter
  ) {
    super();
  }

  transform(expr: Expression): Expression {
    if (this.counter.serialize(expr) === this.counter.serialize(this.pattern)) {
      return this.replacement;
    }
    return super.transform(expr);
  }
}

/**
 * Helper to substitute an expression pattern with a replacement
 */
function substituteInExpression(
  expr: Expression,
  pattern: Expression,
  replacement: Expression,
  counter: ExpressionCounter
): Expression {
  const transformer = new PatternSubstitutionTransformer(pattern, replacement, counter);
  return transformer.transform(expr);
}

/**
 * Topologically sort temps so dependencies come first
 * This ensures that when temp A references temp B, B is defined before A
 */
function topologicallySortTemps(temps: Map<string, Expression>): Map<string, Expression> {
  // Build dependency graph: which temps does each temp depend on?
  const deps = new Map<string, Set<string>>();
  const tempNames = new Set(temps.keys());

  function findDeps(expr: Expression, found: Set<string>): void {
    if (expr.kind === 'variable' && tempNames.has(expr.name)) {
      found.add(expr.name);
    } else if (expr.kind === 'binary') {
      findDeps(expr.left, found);
      findDeps(expr.right, found);
    } else if (expr.kind === 'unary') {
      findDeps(expr.operand, found);
    } else if (expr.kind === 'call') {
      expr.args.forEach(arg => findDeps(arg, found));
    } else if (expr.kind === 'component') {
      findDeps(expr.object, found);
    }
  }

  for (const [name, expr] of temps) {
    const d = new Set<string>();
    findDeps(expr, d);
    deps.set(name, d);
  }

  // Topological sort using Kahn's algorithm
  const result = new Map<string, Expression>();
  const remaining = new Set(temps.keys());
  const processed = new Set<string>();

  while (remaining.size > 0) {
    // Find a temp with no unprocessed dependencies
    let found = false;
    for (const name of remaining) {
      const d = deps.get(name)!;
      const hasUnprocessedDep = [...d].some(dep => !processed.has(dep));
      if (!hasUnprocessedDep) {
        result.set(name, temps.get(name)!);
        remaining.delete(name);
        processed.add(name);
        found = true;
        break;
      }
    }
    if (!found) {
      // Cycle detected - just add remaining in any order
      for (const name of remaining) {
        result.set(name, temps.get(name)!);
      }
      break;
    }
  }

  return result;
}
