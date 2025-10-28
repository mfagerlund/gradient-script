/**
 * Inliner for GradientScript DSL
 * Inlines intermediate variables before differentiation
 */

import {
  Expression,
  FunctionDef
} from './AST.js';
import { ExpressionTransformer } from './ExpressionTransformer.js';

/**
 * Expression transformer that substitutes variables from a substitution map
 * Handles recursive inlining by reprocessing substituted expressions
 * Used for inlining intermediate variables to eliminate assignments
 */
class VariableSubstitutionTransformer extends ExpressionTransformer {
  constructor(private substitutions: Map<string, Expression>) {
    super();
  }

  protected visitVariable(node: { kind: 'variable'; name: string }): Expression {
    const replacement = this.substitutions.get(node.name);
    if (replacement) {
      // Recursively inline the replacement
      return this.transform(replacement);
    }
    return node;
  }
}

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

  // Use transformer to inline all variables
  const transformer = new VariableSubstitutionTransformer(substitutions);
  return transformer.transform(func.returnExpr);
}
