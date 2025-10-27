/**
 * Analyzes functions for known discontinuities
 */

import { Expression, FunctionDef } from './AST.js';
import { builtIns, DiscontinuityInfo } from './BuiltIns.js';

export interface DiscontinuityWarning {
  functionName: string;
  location: string; // Where in the expression
  discontinuities: DiscontinuityInfo[];
}

/**
 * Analyze a function for discontinuities
 */
export function analyzeDiscontinuities(func: FunctionDef): DiscontinuityWarning[] {
  const warnings: DiscontinuityWarning[] = [];

  // Check return expression
  collectDiscontinuities(func.returnExpr, 'return expression', warnings);

  // Check intermediate variables
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      collectDiscontinuities(stmt.expression, `variable '${stmt.variable}'`, warnings);
    }
  }

  return warnings;
}

/**
 * Recursively collect discontinuities from an expression
 */
function collectDiscontinuities(
  expr: Expression,
  location: string,
  warnings: DiscontinuityWarning[]
): void {
  switch (expr.kind) {
    case 'call':
      const disconts = builtIns.getDiscontinuities(expr.name);
      if (disconts.length > 0) {
        warnings.push({
          functionName: expr.name,
          location,
          discontinuities: disconts
        });
      }

      // Recurse into arguments
      for (const arg of expr.args) {
        collectDiscontinuities(arg, location, warnings);
      }
      break;

    case 'binary':
      collectDiscontinuities(expr.left, location, warnings);
      collectDiscontinuities(expr.right, location, warnings);
      break;

    case 'unary':
      collectDiscontinuities(expr.operand, location, warnings);
      break;

    case 'component':
      collectDiscontinuities(expr.object, location, warnings);
      break;
  }
}

/**
 * Format discontinuity warnings for display
 */
export function formatDiscontinuityWarnings(warnings: DiscontinuityWarning[]): string {
  if (warnings.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('⚠️  DISCONTINUITY WARNINGS:');
  lines.push('');
  lines.push('The following functions have known discontinuities that may affect');
  lines.push('numerical gradient checking:');
  lines.push('');

  for (const warning of warnings) {
    lines.push(`  • ${warning.functionName} (in ${warning.location})`);
    for (const discont of warning.discontinuities) {
      lines.push(`    - ${discont.description}`);
      lines.push(`      Occurs when: ${discont.condition}`);
    }
    lines.push('');
  }

  lines.push('Note: Symbolic gradients remain correct at these points,');
  lines.push('but numerical validation may show large errors due to discontinuities.');

  return lines.join('\n');
}
