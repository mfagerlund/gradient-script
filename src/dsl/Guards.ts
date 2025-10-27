/**
 * Edge case guards for generated gradient code
 * Detects potential issues like division by zero, sqrt of negative, etc.
 */

import {
  Expression,
  FunctionDef,
  BinaryOp,
  FunctionCall
} from './AST.js';

export interface Guard {
  type: 'division_by_zero' | 'sqrt_negative' | 'normalize_zero' | 'atan2_zero';
  expression: Expression;
  description: string;
  suggestion: string;
}

export interface GuardAnalysisResult {
  guards: Guard[];
  hasIssues: boolean;
}

/**
 * Analyze function for potential edge cases
 */
export function analyzeGuards(func: FunctionDef): GuardAnalysisResult {
  const guards: Guard[] = [];

  // Analyze return expression
  collectGuards(func.returnExpr, guards);

  // Analyze intermediate expressions
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      collectGuards(stmt.expression, guards);
    }
  }

  return {
    guards,
    hasIssues: guards.length > 0
  };
}

/**
 * Collect potential guards from an expression
 */
function collectGuards(expr: Expression, guards: Guard[]): void {
  switch (expr.kind) {
    case 'binary':
      if (expr.operator === '/') {
        guards.push({
          type: 'division_by_zero',
          expression: expr.right,
          description: `Division by zero if denominator becomes zero`,
          suggestion: `Add check: if (denominator === 0) return { value: 0, gradients: {...} };`
        });
      }
      collectGuards(expr.left, guards);
      collectGuards(expr.right, guards);
      break;

    case 'unary':
      collectGuards(expr.operand, guards);
      break;

    case 'call':
      analyzeCallGuards(expr, guards);
      for (const arg of expr.args) {
        collectGuards(arg, guards);
      }
      break;

    case 'component':
      collectGuards(expr.object, guards);
      break;
  }
}

/**
 * Analyze function calls for specific edge cases
 */
function analyzeCallGuards(expr: FunctionCall, guards: Guard[]): void {
  switch (expr.name) {
    case 'sqrt':
      guards.push({
        type: 'sqrt_negative',
        expression: expr.args[0],
        description: `sqrt of negative number produces NaN`,
        suggestion: `Add check: Math.max(0, value) or abs(value)`
      });
      break;

    case 'magnitude2d':
    case 'magnitude3d':
      // magnitude uses sqrt internally
      guards.push({
        type: 'sqrt_negative',
        expression: expr,
        description: `magnitude of vector (uses sqrt internally)`,
        suggestion: `Ensure vector components are valid`
      });
      break;

    case 'normalize2d':
    case 'normalize3d':
      guards.push({
        type: 'normalize_zero',
        expression: expr,
        description: `Normalizing zero vector causes division by zero`,
        suggestion: `Check if magnitude > epsilon before normalizing`
      });
      break;

    case 'atan2':
      guards.push({
        type: 'atan2_zero',
        expression: expr,
        description: `atan2(0, 0) is undefined`,
        suggestion: `Check if both arguments are zero: if (y === 0 && x === 0) return 0;`
      });
      break;

    case 'log':
      guards.push({
        type: 'division_by_zero',
        expression: expr.args[0],
        description: `log(0) is -Infinity, log(negative) is NaN`,
        suggestion: `Add check: Math.max(epsilon, value)`
      });
      break;

    case 'asin':
    case 'acos':
      guards.push({
        type: 'division_by_zero',
        expression: expr.args[0],
        description: `${expr.name} requires argument in [-1, 1]`,
        suggestion: `Clamp value: Math.max(-1, Math.min(1, value))`
      });
      break;
  }
}

/**
 * Format guard analysis for display
 */
export function formatGuardWarnings(result: GuardAnalysisResult): string {
  if (!result.hasIssues) {
    return '';
  }

  const lines: string[] = [];
  lines.push('⚠️  EDGE CASE WARNINGS:');
  lines.push('');
  lines.push('The generated code may encounter edge cases that produce');
  lines.push('NaN, Infinity, or incorrect results:');
  lines.push('');

  // Group by type
  const byType = new Map<string, Guard[]>();
  for (const guard of result.guards) {
    const existing = byType.get(guard.type) || [];
    existing.push(guard);
    byType.set(guard.type, existing);
  }

  for (const [type, guards] of byType.entries()) {
    const typeLabel = formatGuardType(type);
    lines.push(`  • ${typeLabel} (${guards.length} occurrence${guards.length > 1 ? 's' : ''})`);

    // Show first occurrence
    const first = guards[0];
    lines.push(`    ${first.description}`);
    lines.push(`    💡 ${first.suggestion}`);
    lines.push('');
  }

  lines.push('Consider adding runtime checks or ensuring inputs are within valid ranges.');
  lines.push('');

  return lines.join('\n');
}

function formatGuardType(type: string): string {
  switch (type) {
    case 'division_by_zero':
      return 'Division by zero';
    case 'sqrt_negative':
      return 'Square root of negative';
    case 'normalize_zero':
      return 'Normalizing zero vector';
    case 'atan2_zero':
      return 'atan2(0, 0) undefined';
    default:
      return type;
  }
}

/**
 * Generate guard code snippets for common cases
 */
export function generateGuardCode(guards: Guard[], format: 'typescript' | 'javascript' | 'python' = 'typescript'): string[] {
  const snippets: string[] = [];

  // Group by type and generate appropriate guards
  const hasNormalize = guards.some(g => g.type === 'normalize_zero');
  const hasDivision = guards.some(g => g.type === 'division_by_zero');
  const hasAtan2 = guards.some(g => g.type === 'atan2_zero');

  if (format === 'typescript' || format === 'javascript') {
    if (hasNormalize) {
      snippets.push('const EPSILON = 1e-10;');
      snippets.push('if (magnitude < EPSILON) {');
      snippets.push('  // Return zero gradient for zero vector');
      snippets.push('  return { value: 0, grad_v: { x: 0, y: 0 } };');
      snippets.push('}');
    }

    if (hasDivision) {
      snippets.push('// Guard against division by zero');
      snippets.push('if (Math.abs(denominator) < EPSILON) {');
      snippets.push('  // Handle edge case appropriately');
      snippets.push('}');
    }

    if (hasAtan2) {
      snippets.push('// Guard against atan2(0, 0)');
      snippets.push('if (y === 0 && x === 0) {');
      snippets.push('  return { value: 0, gradients: {...} };');
      snippets.push('}');
    }
  } else {
    // Python
    if (hasNormalize) {
      snippets.push('EPSILON = 1e-10');
      snippets.push('if magnitude < EPSILON:');
      snippets.push('    # Return zero gradient for zero vector');
      snippets.push('    return {"value": 0, "grad_v": {"x": 0, "y": 0}}');
    }

    if (hasDivision) {
      snippets.push('# Guard against division by zero');
      snippets.push('if abs(denominator) < EPSILON:');
      snippets.push('    # Handle edge case appropriately');
      snippets.push('    pass');
    }
  }

  return snippets;
}
