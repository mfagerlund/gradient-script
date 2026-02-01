/**
 * Conversion between AST Expressions and E-Graph
 */

import { EGraph } from './EGraph.js';
import { ENode, EClassId } from './ENode.js';
import { Expression } from '../AST.js';

/**
 * Add an AST Expression to the e-graph, returning its e-class ID
 */
export function addExpression(egraph: EGraph, expr: Expression): EClassId {
  switch (expr.kind) {
    case 'number':
      return egraph.add({ tag: 'num', value: expr.value });

    case 'variable':
      return egraph.add({ tag: 'var', name: expr.name });

    case 'binary': {
      const left = addExpression(egraph, expr.left);
      const right = addExpression(egraph, expr.right);

      switch (expr.operator) {
        case '+':
          return egraph.add({ tag: 'add', children: [left, right] });
        case '-':
          return egraph.add({ tag: 'sub', children: [left, right] });
        case '*':
          return egraph.add({ tag: 'mul', children: [left, right] });
        case '/':
          return egraph.add({ tag: 'div', children: [left, right] });
        case '^':
        case '**':
          return egraph.add({ tag: 'pow', children: [left, right] });
      }
    }

    case 'unary': {
      const operand = addExpression(egraph, expr.operand);

      if (expr.operator === '-') {
        return egraph.add({ tag: 'neg', child: operand });
      }
      // Unary + is identity
      return operand;
    }

    case 'call': {
      const args = expr.args.map(arg => addExpression(egraph, arg));
      return egraph.add({ tag: 'call', name: expr.name, children: args });
    }

    case 'component': {
      const object = addExpression(egraph, expr.object);
      return egraph.add({ tag: 'component', object, field: expr.component });
    }
  }
}

/**
 * Add multiple expressions, returning a map of original keys to e-class IDs
 */
export function addExpressions<K extends string>(
  egraph: EGraph,
  expressions: Map<K, Expression>
): Map<K, EClassId> {
  const result = new Map<K, EClassId>();
  for (const [key, expr] of expressions) {
    result.set(key, addExpression(egraph, expr));
  }
  return result;
}

/**
 * Add all gradients (Map<paramName, Map<component, Expression>>)
 * Returns Map<paramName, Map<component, EClassId>>
 */
export function addGradients(
  egraph: EGraph,
  gradients: Map<string, Map<string, Expression>>
): Map<string, Map<string, EClassId>> {
  const result = new Map<string, Map<string, EClassId>>();

  for (const [paramName, components] of gradients) {
    const componentIds = new Map<string, EClassId>();
    for (const [comp, expr] of components) {
      componentIds.set(comp, addExpression(egraph, expr));
    }
    result.set(paramName, componentIds);
  }

  return result;
}

/**
 * Get all root e-class IDs from gradient structure
 */
export function getRootIds(
  gradientIds: Map<string, Map<string, EClassId>>
): EClassId[] {
  const roots: EClassId[] = [];
  for (const components of gradientIds.values()) {
    for (const id of components.values()) {
      roots.push(id);
    }
  }
  return roots;
}
