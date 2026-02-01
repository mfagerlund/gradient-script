/**
 * Cost-Based Extraction from E-Graphs
 *
 * Extracts the lowest-cost expression from each e-class.
 * Also detects common subexpressions (shared e-classes) for CSE.
 */

import { EGraph } from './EGraph.js';
import { ENode, EClassId, enodeChildren } from './ENode.js';
import { Expression } from '../AST.js';

/**
 * Cost of different operations
 * Higher cost = less preferred
 */
export interface CostModel {
  num: number;       // Literal number
  var: number;       // Variable
  add: number;       // Addition
  sub: number;       // Subtraction
  mul: number;       // Multiplication
  div: number;       // Division (expensive!)
  pow: number;       // Power
  neg: number;       // Negation
  inv: number;       // Inverse (1/x)
  call: number;      // Function call base cost
  component: number; // Component access (e.g., v.x)
}

/**
 * Default cost model - division is expensive
 */
export const defaultCostModel: CostModel = {
  num: 1,
  var: 1,
  add: 2,
  sub: 2,
  mul: 2,
  div: 8,        // Division is expensive - encourage factoring
  pow: 4,
  neg: 1,
  inv: 5,        // Inverse (1/x) - cheaper than div but significant
  call: 3,
  component: 1,
};

/**
 * Result of extraction with CSE
 */
export interface ExtractionResult {
  /** Temporary variable definitions (name -> expression) */
  temps: Map<string, Expression>;

  /** The extracted expressions (class ID -> expression using temps) */
  expressions: Map<EClassId, Expression>;

  /** Total cost */
  totalCost: number;
}

/**
 * Extract the best expression from an e-class
 */
export function extractBest(
  egraph: EGraph,
  rootId: EClassId,
  costModel: CostModel = defaultCostModel
): Expression {
  const costs = computeCosts(egraph, costModel);
  return extractFromClass(egraph, rootId, costs, costModel);
}

/**
 * Extract multiple expressions with CSE (shared subexpressions become temps)
 */
export function extractWithCSE(
  egraph: EGraph,
  roots: EClassId[],
  costModel: CostModel = defaultCostModel,
  minSharedCost: number = 3  // Only extract temps if cost > this
): ExtractionResult {
  // Compute costs for all e-classes
  const costs = computeCosts(egraph, costModel);

  // Count references to each e-class from roots
  const refCounts = countReferences(egraph, roots, costs, costModel);

  // Decide which classes should become temps (count >= 2 means used multiple times)
  const tempsToExtract = new Map<EClassId, string>();
  let tempCounter = 0;

  for (const [classId, count] of refCounts) {
    if (count >= 2) {
      const classCost = costs.get(egraph.find(classId)) ?? Infinity;
      if (classCost > minSharedCost) {
        tempsToExtract.set(egraph.find(classId), `_tmp${tempCounter++}`);
      }
    }
  }

  // Extract temp definitions (without referencing other temps initially)
  const temps = new Map<string, Expression>();
  for (const [classId, tempName] of tempsToExtract) {
    const expr = extractFromClass(egraph, classId, costs, costModel);
    temps.set(tempName, expr);
  }

  // Extract root expressions, using temps where available
  const expressions = new Map<EClassId, Expression>();
  for (const rootId of roots) {
    const expr = extractWithTemps(egraph, rootId, costs, costModel, tempsToExtract);
    expressions.set(rootId, expr);
  }

  // Post-process: substitute temps into other temp definitions where possible
  // Build a map from expression serialization to temp name
  const exprToTemp = new Map<string, string>();
  for (const [tempName, expr] of temps) {
    exprToTemp.set(serializeExpr(expr), tempName);
  }

  // Substitute temps into temp definitions
  for (const [tempName, expr] of temps) {
    temps.set(tempName, substituteTempRefs(expr, exprToTemp, tempName));
  }

  // Topologically sort temps by dependency (deps first)
  const sortedTemps = topologicalSortTemps(temps);
  temps.clear();
  for (const [name, expr] of sortedTemps) {
    temps.set(name, expr);
  }

  // Count actual usage of each temp in the final output
  const tempUsageCounts = new Map<string, number>();
  function countTempUsage(expr: Expression): void {
    if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
      tempUsageCounts.set(expr.name, (tempUsageCounts.get(expr.name) ?? 0) + 1);
    } else if (expr.kind === 'binary') {
      countTempUsage(expr.left);
      countTempUsage(expr.right);
    } else if (expr.kind === 'unary') {
      countTempUsage(expr.operand);
    } else if (expr.kind === 'call') {
      expr.args.forEach(countTempUsage);
    } else if (expr.kind === 'component') {
      countTempUsage(expr.object);
    }
  }

  // Count in root expressions
  for (const expr of expressions.values()) {
    countTempUsage(expr);
  }

  // Also count in temp definitions (temps can reference other temps)
  for (const expr of temps.values()) {
    countTempUsage(expr);
  }

  // Identify temps to inline (used 0 or 1 times)
  const tempsToInline = new Set<string>();
  for (const [tempName] of temps) {
    const count = tempUsageCounts.get(tempName) ?? 0;
    if (count <= 1) {
      tempsToInline.add(tempName);
    }
  }

  // If there are temps to inline, substitute them back
  if (tempsToInline.size > 0) {
    function inlineTemps(expr: Expression): Expression {
      if (expr.kind === 'variable' && tempsToInline.has(expr.name)) {
        const tempExpr = temps.get(expr.name);
        return tempExpr ? inlineTemps(tempExpr) : expr;
      } else if (expr.kind === 'binary') {
        return {
          kind: 'binary',
          operator: expr.operator,
          left: inlineTemps(expr.left),
          right: inlineTemps(expr.right)
        };
      } else if (expr.kind === 'unary') {
        return {
          kind: 'unary',
          operator: expr.operator,
          operand: inlineTemps(expr.operand)
        };
      } else if (expr.kind === 'call') {
        return {
          kind: 'call',
          name: expr.name,
          args: expr.args.map(inlineTemps)
        };
      } else if (expr.kind === 'component') {
        return {
          kind: 'component',
          object: inlineTemps(expr.object),
          component: expr.component
        };
      }
      return expr;
    }

    // Inline in remaining temps (temps not being inlined)
    for (const [tempName, expr] of temps) {
      if (!tempsToInline.has(tempName)) {
        temps.set(tempName, inlineTemps(expr));
      }
    }

    // Inline in root expressions
    for (const [rootId, expr] of expressions) {
      expressions.set(rootId, inlineTemps(expr));
    }

    // Remove inlined temps
    for (const tempName of tempsToInline) {
      temps.delete(tempName);
    }

    // Re-sort topologically after inlining (inlining may have changed dependencies)
    const reSorted = topologicalSortTemps(temps);
    temps.clear();
    for (const [name, expr] of reSorted) {
      temps.set(name, expr);
    }
  }

  // Post-extraction CSE: find repeated patterns that emerge AFTER temp substitution
  // e.g., "_tmp22 + _tmp23" appearing multiple times
  postExtractionCSE(temps, expressions, minSharedCost, tempCounter, costModel);

  // Calculate total cost
  let totalCost = 0;
  for (const [, expr] of temps) {
    totalCost += expressionCost(expr, costModel);
  }
  for (const [, expr] of expressions) {
    totalCost += expressionCost(expr, costModel);
  }

  return { temps, expressions, totalCost };
}

/**
 * Compute the minimum cost for each e-class (bottom-up)
 */
function computeCosts(egraph: EGraph, costModel: CostModel): Map<EClassId, number> {
  const costs = new Map<EClassId, number>();
  const classIds = egraph.getClassIds();

  // Initialize all costs to infinity
  for (const id of classIds) {
    costs.set(id, Infinity);
  }

  // Iterate until convergence
  let changed = true;
  let iterations = 0;
  const maxIterations = 100;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (const classId of classIds) {
      const canonId = egraph.find(classId);
      const nodes = egraph.getNodes(canonId);

      for (const node of nodes) {
        const nodeCost = computeNodeCost(node, costs, costModel);
        const currentCost = costs.get(canonId) ?? Infinity;

        if (nodeCost < currentCost) {
          costs.set(canonId, nodeCost);
          changed = true;
        }
      }
    }
  }

  return costs;
}

/**
 * Compute cost of a single e-node
 */
function computeNodeCost(
  node: ENode,
  classCosts: Map<EClassId, number>,
  costModel: CostModel
): number {
  const childCost = (id: EClassId) => classCosts.get(id) ?? Infinity;

  switch (node.tag) {
    case 'num':
      return costModel.num;
    case 'var':
      return costModel.var;
    case 'add':
      return costModel.add + childCost(node.children[0]) + childCost(node.children[1]);
    case 'sub':
      return costModel.sub + childCost(node.children[0]) + childCost(node.children[1]);
    case 'mul':
      return costModel.mul + childCost(node.children[0]) + childCost(node.children[1]);
    case 'div':
      return costModel.div + childCost(node.children[0]) + childCost(node.children[1]);
    case 'pow':
      return costModel.pow + childCost(node.children[0]) + childCost(node.children[1]);
    case 'neg':
      return costModel.neg + childCost(node.child);
    case 'inv':
      return costModel.inv + childCost(node.child);
    case 'call':
      return costModel.call + node.children.reduce((sum, id) => sum + childCost(id), 0);
    case 'component':
      return costModel.component + childCost(node.object);
  }
}

/**
 * Extract expression from an e-class using precomputed costs
 */
function extractFromClass(
  egraph: EGraph,
  classId: EClassId,
  costs: Map<EClassId, number>,
  costModel: CostModel
): Expression {
  const canonId = egraph.find(classId);
  const nodes = egraph.getNodes(canonId);

  // Find lowest-cost node
  let bestNode: ENode | null = null;
  let bestCost = Infinity;

  for (const node of nodes) {
    const cost = computeNodeCost(node, costs, costModel);
    if (cost < bestCost) {
      bestCost = cost;
      bestNode = node;
    }
  }

  if (!bestNode) {
    throw new Error(`No nodes in e-class ${canonId}`);
  }

  return nodeToExpression(bestNode, egraph, costs, costModel);
}

/**
 * Extract expression, substituting temps where available
 */
function extractWithTemps(
  egraph: EGraph,
  classId: EClassId,
  costs: Map<EClassId, number>,
  costModel: CostModel,
  temps: Map<EClassId, string>
): Expression {
  const canonId = egraph.find(classId);

  // Check if this class is a temp
  const tempName = temps.get(canonId);
  if (tempName) {
    return { kind: 'variable', name: tempName };
  }

  const nodes = egraph.getNodes(canonId);

  // Find lowest-cost node
  let bestNode: ENode | null = null;
  let bestCost = Infinity;

  for (const node of nodes) {
    const cost = computeNodeCost(node, costs, costModel);
    if (cost < bestCost) {
      bestCost = cost;
      bestNode = node;
    }
  }

  if (!bestNode) {
    throw new Error(`No nodes in e-class ${canonId}`);
  }

  return nodeToExpressionWithTemps(bestNode, egraph, costs, costModel, temps);
}

/**
 * Convert e-node to AST Expression
 */
function nodeToExpression(
  node: ENode,
  egraph: EGraph,
  costs: Map<EClassId, number>,
  costModel: CostModel
): Expression {
  switch (node.tag) {
    case 'num':
      return { kind: 'number', value: node.value };
    case 'var':
      return { kind: 'variable', name: node.name };
    case 'add':
      return {
        kind: 'binary',
        operator: '+',
        left: extractFromClass(egraph, node.children[0], costs, costModel),
        right: extractFromClass(egraph, node.children[1], costs, costModel)
      };
    case 'sub':
      return {
        kind: 'binary',
        operator: '-',
        left: extractFromClass(egraph, node.children[0], costs, costModel),
        right: extractFromClass(egraph, node.children[1], costs, costModel)
      };
    case 'mul':
      return {
        kind: 'binary',
        operator: '*',
        left: extractFromClass(egraph, node.children[0], costs, costModel),
        right: extractFromClass(egraph, node.children[1], costs, costModel)
      };
    case 'div':
      return {
        kind: 'binary',
        operator: '/',
        left: extractFromClass(egraph, node.children[0], costs, costModel),
        right: extractFromClass(egraph, node.children[1], costs, costModel)
      };
    case 'pow':
      return {
        kind: 'binary',
        operator: '^',
        left: extractFromClass(egraph, node.children[0], costs, costModel),
        right: extractFromClass(egraph, node.children[1], costs, costModel)
      };
    case 'neg':
      return {
        kind: 'unary',
        operator: '-',
        operand: extractFromClass(egraph, node.child, costs, costModel)
      };
    case 'inv':
      // inv(x) extracts as 1/x
      return {
        kind: 'binary',
        operator: '/',
        left: { kind: 'number', value: 1 },
        right: extractFromClass(egraph, node.child, costs, costModel)
      };
    case 'call':
      return {
        kind: 'call',
        name: node.name,
        args: node.children.map(id => extractFromClass(egraph, id, costs, costModel))
      };
    case 'component':
      return {
        kind: 'component',
        object: extractFromClass(egraph, node.object, costs, costModel),
        component: node.field
      };
  }
}

/**
 * Convert e-node to AST Expression, using temps
 */
function nodeToExpressionWithTemps(
  node: ENode,
  egraph: EGraph,
  costs: Map<EClassId, number>,
  costModel: CostModel,
  temps: Map<EClassId, string>
): Expression {
  const extract = (id: EClassId) => extractWithTemps(egraph, id, costs, costModel, temps);

  switch (node.tag) {
    case 'num':
      return { kind: 'number', value: node.value };
    case 'var':
      return { kind: 'variable', name: node.name };
    case 'add':
      return {
        kind: 'binary',
        operator: '+',
        left: extract(node.children[0]),
        right: extract(node.children[1])
      };
    case 'sub':
      return {
        kind: 'binary',
        operator: '-',
        left: extract(node.children[0]),
        right: extract(node.children[1])
      };
    case 'mul':
      return {
        kind: 'binary',
        operator: '*',
        left: extract(node.children[0]),
        right: extract(node.children[1])
      };
    case 'div':
      return {
        kind: 'binary',
        operator: '/',
        left: extract(node.children[0]),
        right: extract(node.children[1])
      };
    case 'pow':
      return {
        kind: 'binary',
        operator: '^',
        left: extract(node.children[0]),
        right: extract(node.children[1])
      };
    case 'neg':
      return {
        kind: 'unary',
        operator: '-',
        operand: extract(node.child)
      };
    case 'inv':
      // inv(x) extracts as 1/x
      return {
        kind: 'binary',
        operator: '/',
        left: { kind: 'number', value: 1 },
        right: extract(node.child)
      };
    case 'call':
      return {
        kind: 'call',
        name: node.name,
        args: node.children.map(id => extract(id))
      };
    case 'component':
      return {
        kind: 'component',
        object: extract(node.object),
        component: node.field
      };
  }
}

/**
 * Count references to each e-class from root expressions
 */
function countReferences(
  egraph: EGraph,
  roots: EClassId[],
  costs: Map<EClassId, number>,
  costModel: CostModel
): Map<EClassId, number> {
  const counts = new Map<EClassId, number>();

  function countInClass(classId: EClassId, visited: Set<EClassId>): void {
    const canonId = egraph.find(classId);

    // Increment reference count
    counts.set(canonId, (counts.get(canonId) ?? 0) + 1);

    // Don't recurse if already visited in this path
    if (visited.has(canonId)) {
      return;
    }
    visited.add(canonId);

    // Get best node and recurse into children
    const nodes = egraph.getNodes(canonId);
    let bestNode: ENode | null = null;
    let bestCost = Infinity;

    for (const node of nodes) {
      const cost = computeNodeCost(node, costs, costModel);
      if (cost < bestCost) {
        bestCost = cost;
        bestNode = node;
      }
    }

    if (bestNode) {
      for (const childId of enodeChildren(bestNode)) {
        countInClass(childId, new Set(visited));
      }
    }
  }

  for (const rootId of roots) {
    countInClass(rootId, new Set());
  }

  return counts;
}

/**
 * Calculate cost of an AST expression
 */
function expressionCost(expr: Expression, costModel: CostModel): number {
  switch (expr.kind) {
    case 'number':
      return costModel.num;
    case 'variable':
      return costModel.var;
    case 'binary':
      const opCost = expr.operator === '/' ? costModel.div :
                     expr.operator === '^' ? costModel.pow :
                     expr.operator === '*' ? costModel.mul :
                     costModel.add;
      return opCost + expressionCost(expr.left, costModel) + expressionCost(expr.right, costModel);
    case 'unary':
      return costModel.neg + expressionCost(expr.operand, costModel);
    case 'call':
      return costModel.call + expr.args.reduce((sum, arg) => sum + expressionCost(arg, costModel), 0);
    case 'component':
      return costModel.component + expressionCost(expr.object, costModel);
  }
}

/**
 * Serialize an expression to a string for comparison
 */
function serializeExpr(expr: Expression): string {
  switch (expr.kind) {
    case 'number':
      return `N${expr.value}`;
    case 'variable':
      return `V${expr.name}`;
    case 'binary':
      return `(${serializeExpr(expr.left)}${expr.operator}${serializeExpr(expr.right)})`;
    case 'unary':
      return `U${expr.operator}${serializeExpr(expr.operand)}`;
    case 'call':
      return `C${expr.name}(${expr.args.map(serializeExpr).join(',')})`;
    case 'component':
      return `${serializeExpr(expr.object)}.${expr.component}`;
  }
}

/**
 * Substitute temp references into an expression (bottom-up)
 * Looks for subexpressions that match other temps and replaces them
 */
function substituteTempRefs(
  expr: Expression,
  exprToTemp: Map<string, string>,
  currentTemp: string
): Expression {
  // First, recursively substitute in children (bottom-up)
  let result: Expression;
  switch (expr.kind) {
    case 'number':
    case 'variable':
      result = expr;
      break;
    case 'binary': {
      const left = substituteTempRefs(expr.left, exprToTemp, currentTemp);
      const right = substituteTempRefs(expr.right, exprToTemp, currentTemp);
      result = (left === expr.left && right === expr.right)
        ? expr
        : { kind: 'binary', operator: expr.operator, left, right };
      break;
    }
    case 'unary': {
      const operand = substituteTempRefs(expr.operand, exprToTemp, currentTemp);
      result = (operand === expr.operand)
        ? expr
        : { kind: 'unary', operator: expr.operator, operand };
      break;
    }
    case 'call': {
      const args = expr.args.map(arg => substituteTempRefs(arg, exprToTemp, currentTemp));
      result = args.every((arg, i) => arg === expr.args[i])
        ? expr
        : { kind: 'call', name: expr.name, args };
      break;
    }
    case 'component': {
      const object = substituteTempRefs(expr.object, exprToTemp, currentTemp);
      result = (object === expr.object)
        ? expr
        : { kind: 'component', object, component: expr.component };
      break;
    }
  }

  // Then check if the (possibly transformed) expression matches another temp
  const serialized = serializeExpr(result);
  const matchingTemp = exprToTemp.get(serialized);
  if (matchingTemp && matchingTemp !== currentTemp) {
    return { kind: 'variable', name: matchingTemp };
  }

  return result;
}

/**
 * Topologically sort temps so dependencies come first
 */
function topologicalSortTemps(temps: Map<string, Expression>): [string, Expression][] {
  // Find dependencies of each temp
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
  const result: [string, Expression][] = [];
  const remaining = new Set(temps.keys());
  const processed = new Set<string>();

  while (remaining.size > 0) {
    // Find a temp with no unprocessed dependencies
    let found = false;
    for (const name of remaining) {
      const d = deps.get(name)!;
      const hasUnprocessedDep = [...d].some(dep => !processed.has(dep));
      if (!hasUnprocessedDep) {
        result.push([name, temps.get(name)!]);
        remaining.delete(name);
        processed.add(name);
        found = true;
        break;
      }
    }
    if (!found) {
      // Cycle detected - just add remaining in any order
      for (const name of remaining) {
        result.push([name, temps.get(name)!]);
      }
      break;
    }
  }

  return result;
}

/**
 * Post-extraction CSE: find repeated patterns that emerge AFTER temp substitution
 * e.g., "_tmp22 + _tmp23" appearing multiple times should become its own temp
 */
function postExtractionCSE(
  temps: Map<string, Expression>,
  expressions: Map<EClassId, Expression>,
  minSharedCost: number,
  startingTempCounter: number,
  costModel: CostModel
): void {
  // Count occurrences of each subexpression
  const exprCounts = new Map<string, { count: number; expr: Expression; cost: number }>();

  function countSubexprs(expr: Expression): void {
    // Don't count simple expressions
    if (expr.kind === 'number' || expr.kind === 'variable') return;

    const serialized = serializeExpr(expr);
    const cost = expressionCost(expr, costModel);

    const existing = exprCounts.get(serialized);
    if (existing) {
      existing.count++;
    } else {
      exprCounts.set(serialized, { count: 1, expr, cost });
    }

    // Recurse into children
    if (expr.kind === 'binary') {
      countSubexprs(expr.left);
      countSubexprs(expr.right);
    } else if (expr.kind === 'unary') {
      countSubexprs(expr.operand);
    } else if (expr.kind === 'call') {
      expr.args.forEach(countSubexprs);
    } else if (expr.kind === 'component') {
      countSubexprs(expr.object);
    }
  }

  // Count in all temps and root expressions
  for (const expr of temps.values()) {
    countSubexprs(expr);
  }
  for (const expr of expressions.values()) {
    countSubexprs(expr);
  }

  // Find subexpressions worth extracting (count >= 2 and cost > threshold)
  const toExtract: { serialized: string; expr: Expression; cost: number }[] = [];
  for (const [serialized, { count, expr, cost }] of exprCounts) {
    if (count >= 2 && cost > minSharedCost) {
      // Skip if it's just a temp reference
      if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) continue;
      toExtract.push({ serialized, expr, cost });
    }
  }

  if (toExtract.length === 0) return;

  // Sort by cost ASCENDING (extract smaller/cheaper expressions first!)
  // This is critical because larger patterns contain smaller ones.
  // If we extract (a+b) first as _tmp100, then later patterns
  // like (2 * (a+b)) will be serialized as (2 * _tmp100) and won't match.
  toExtract.sort((a, b) => a.cost - b.cost);

  // Build a map of existing temp RHS to prevent duplicates
  const existingTempRHS = new Map<string, string>();
  for (const [tempName, expr] of temps) {
    existingTempRHS.set(serializeExpr(expr), tempName);
  }

  // Create temps for repeated expressions
  let tempCounter = startingTempCounter;
  const serToTemp = new Map<string, string>();

  for (const { serialized, expr } of toExtract) {
    // Skip if already defined as a temp
    const existingTemp = existingTempRHS.get(serialized);
    if (existingTemp) {
      serToTemp.set(serialized, existingTemp);
      continue;
    }

    // Find unique temp name
    while (temps.has(`_tmp${tempCounter}`)) {
      tempCounter++;
    }
    const tempName = `_tmp${tempCounter++}`;
    serToTemp.set(serialized, tempName);
    temps.set(tempName, expr);
    existingTempRHS.set(serialized, tempName);
  }

  if (serToTemp.size === 0) return;

  // Substitute new temps into all expressions
  function substitute(expr: Expression): Expression {
    if (expr.kind === 'number' || expr.kind === 'variable') return expr;

    const serialized = serializeExpr(expr);
    const tempName = serToTemp.get(serialized);
    if (tempName) {
      return { kind: 'variable', name: tempName };
    }

    // Recurse
    if (expr.kind === 'binary') {
      const left = substitute(expr.left);
      const right = substitute(expr.right);
      return (left === expr.left && right === expr.right)
        ? expr
        : { kind: 'binary', operator: expr.operator, left, right };
    } else if (expr.kind === 'unary') {
      const operand = substitute(expr.operand);
      return (operand === expr.operand)
        ? expr
        : { kind: 'unary', operator: expr.operator, operand };
    } else if (expr.kind === 'call') {
      const args = expr.args.map(substitute);
      return args.every((arg, i) => arg === expr.args[i])
        ? expr
        : { kind: 'call', name: expr.name, args };
    } else if (expr.kind === 'component') {
      const object = substitute(expr.object);
      return (object === expr.object)
        ? expr
        : { kind: 'component', object, component: expr.component };
    }
    return expr;
  }

  // Substitute in ALL temps, including newly created ones
  // But skip substituting a temp with itself (self-reference)
  for (const [tempName, expr] of temps) {
    // Create a substitute function that won't replace with the current temp
    const subWithoutSelf = (e: Expression): Expression => {
      if (e.kind === 'number' || e.kind === 'variable') return e;

      const serialized = serializeExpr(e);
      const targetTemp = serToTemp.get(serialized);
      // Don't substitute if it would create self-reference
      if (targetTemp && targetTemp !== tempName) {
        return { kind: 'variable', name: targetTemp };
      }

      if (e.kind === 'binary') {
        const left = subWithoutSelf(e.left);
        const right = subWithoutSelf(e.right);
        return (left === e.left && right === e.right)
          ? e
          : { kind: 'binary', operator: e.operator, left, right };
      } else if (e.kind === 'unary') {
        const operand = subWithoutSelf(e.operand);
        return (operand === e.operand)
          ? e
          : { kind: 'unary', operator: e.operator, operand };
      } else if (e.kind === 'call') {
        const args = e.args.map(subWithoutSelf);
        return args.every((arg, i) => arg === e.args[i])
          ? e
          : { kind: 'call', name: e.name, args };
      } else if (e.kind === 'component') {
        const object = subWithoutSelf(e.object);
        return (object === e.object)
          ? e
          : { kind: 'component', object, component: e.component };
      }
      return e;
    };

    temps.set(tempName, subWithoutSelf(expr));
  }

  // Substitute in root expressions
  for (const [rootId, expr] of expressions) {
    expressions.set(rootId, substitute(expr));
  }

  // Re-sort temps topologically
  const sorted = topologicalSortTemps(temps);
  temps.clear();
  for (const [name, expr] of sorted) {
    temps.set(name, expr);
  }

  // Inline temps that are now used only once (after all substitutions)
  // This is critical because postExtractionCSE may have created temps
  // that turned out to be used only once after substitution
  const usageCounts = new Map<string, number>();
  function countUsage(expr: Expression): void {
    if (expr.kind === 'variable' && expr.name.startsWith('_tmp')) {
      usageCounts.set(expr.name, (usageCounts.get(expr.name) ?? 0) + 1);
    } else if (expr.kind === 'binary') {
      countUsage(expr.left);
      countUsage(expr.right);
    } else if (expr.kind === 'unary') {
      countUsage(expr.operand);
    } else if (expr.kind === 'call') {
      expr.args.forEach(countUsage);
    } else if (expr.kind === 'component') {
      countUsage(expr.object);
    }
  }

  for (const expr of temps.values()) countUsage(expr);
  for (const expr of expressions.values()) countUsage(expr);

  // Find temps to inline (used 0 or 1 times)
  const toInline = new Set<string>();
  for (const [name] of temps) {
    const count = usageCounts.get(name) ?? 0;
    if (count <= 1) toInline.add(name);
  }

  if (toInline.size > 0) {
    function inlineTemps(expr: Expression): Expression {
      if (expr.kind === 'variable' && toInline.has(expr.name)) {
        const tempExpr = temps.get(expr.name);
        return tempExpr ? inlineTemps(tempExpr) : expr;
      } else if (expr.kind === 'binary') {
        const left = inlineTemps(expr.left);
        const right = inlineTemps(expr.right);
        return (left === expr.left && right === expr.right) ? expr
          : { kind: 'binary', operator: expr.operator, left, right };
      } else if (expr.kind === 'unary') {
        const operand = inlineTemps(expr.operand);
        return (operand === expr.operand) ? expr
          : { kind: 'unary', operator: expr.operator, operand };
      } else if (expr.kind === 'call') {
        const args = expr.args.map(inlineTemps);
        return args.every((a, i) => a === expr.args[i]) ? expr
          : { kind: 'call', name: expr.name, args };
      } else if (expr.kind === 'component') {
        const object = inlineTemps(expr.object);
        return (object === expr.object) ? expr
          : { kind: 'component', object, component: expr.component };
      }
      return expr;
    }

    // Inline in remaining temps
    for (const [name, expr] of temps) {
      if (!toInline.has(name)) {
        temps.set(name, inlineTemps(expr));
      }
    }

    // Inline in root expressions
    for (const [rootId, expr] of expressions) {
      expressions.set(rootId, inlineTemps(expr));
    }

    // Remove inlined temps
    for (const name of toInline) temps.delete(name);

    // Re-sort topologically after inlining (inlining may have changed dependencies)
    const finalSorted = topologicalSortTemps(temps);
    temps.clear();
    for (const [name, expr] of finalSorted) {
      temps.set(name, expr);
    }
  }
}
