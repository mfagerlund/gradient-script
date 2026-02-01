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

  // Extract temp definitions (base expressions without temp substitution)
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

  for (const expr of expressions.values()) {
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

    // Inline in root expressions
    for (const [rootId, expr] of expressions) {
      expressions.set(rootId, inlineTemps(expr));
    }

    // Remove inlined temps
    for (const tempName of tempsToInline) {
      temps.delete(tempName);
    }
  }

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
