/**
 * Inliner for GradientScript DSL
 * Inlines intermediate variables before differentiation
 */

import {
  Expression,
  FunctionDef,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess,
  Assignment
} from './AST.js';

/**
 * Inline all intermediate variables in a function
 * Returns a new expression with all intermediate variables substituted
 */
export function inlineIntermediateVariables(func: FunctionDef): Expression {
  // Build substitution map from assignments
  const substitutions = new Map<string, Expression>();

  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      substitutions.set(stmt.variable, stmt.expression);
    }
  }

  // Inline return expression
  return inlineExpression(func.returnExpr, substitutions);
}

/**
 * Recursively inline variables in an expression
 */
function inlineExpression(expr: Expression, subs: Map<string, Expression>): Expression {
  switch (expr.kind) {
    case 'number':
      return expr;

    case 'variable':
      // If variable has a substitution, inline it (recursively)
      if (subs.has(expr.name)) {
        return inlineExpression(subs.get(expr.name)!, subs);
      }
      return expr;

    case 'binary':
      return {
        kind: 'binary',
        operator: expr.operator,
        left: inlineExpression(expr.left, subs),
        right: inlineExpression(expr.right, subs)
      };

    case 'unary':
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: inlineExpression(expr.operand, subs)
      };

    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(arg => inlineExpression(arg, subs))
      };

    case 'component':
      return {
        kind: 'component',
        object: inlineExpression(expr.object, subs),
        component: expr.component
      };
  }
}
