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
  variableName?: string; // The assignment variable name if this is in an assignment
  line?: number; // Line number in source
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
  collectGuards(func.returnExpr, guards, undefined);

  // Analyze intermediate expressions
  for (const stmt of func.body) {
    if (stmt.kind === 'assignment') {
      collectGuards(stmt.expression, guards, stmt.variable, stmt.loc?.line);
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
function collectGuards(expr: Expression, guards: Guard[], variableName?: string, line?: number): void {
  switch (expr.kind) {
    case 'binary':
      if (expr.operator === '/') {
        guards.push({
          type: 'division_by_zero',
          expression: expr.right,
          description: `Division by zero if denominator becomes zero`,
          suggestion: `Add check: if (Math.abs(denominator) < epsilon) return {...};`,
          variableName,
          line: line || expr.loc?.line
        });
      }
      collectGuards(expr.left, guards, variableName, line);
      collectGuards(expr.right, guards, variableName, line);
      break;

    case 'unary':
      collectGuards(expr.operand, guards, variableName, line);
      break;

    case 'call':
      analyzeCallGuards(expr, guards, variableName, line || expr.loc?.line);
      for (const arg of expr.args) {
        collectGuards(arg, guards, variableName, line);
      }
      break;

    case 'component':
      collectGuards(expr.object, guards, variableName, line);
      break;
  }
}

/**
 * Analyze function calls for specific edge cases
 */
function analyzeCallGuards(expr: FunctionCall, guards: Guard[], variableName?: string, line?: number): void {
  switch (expr.name) {
    case 'sqrt':
      // Check if it's sqrt of sum of squares (always safe)
      const arg = expr.args[0];
      const isSumOfSquares = arg.kind === 'binary' && arg.operator === '+' &&
        isSqExpression(arg.left) && isSqExpression(arg.right);

      guards.push({
        type: 'sqrt_negative',
        expression: expr.args[0],
        description: isSumOfSquares
          ? `sqrt of sum of squares (safe, but can be zero)`
          : `sqrt of negative number produces NaN`,
        suggestion: isSumOfSquares
          ? `Add epsilon for numerical stability: sqrt(max(dx*dx + dy*dy, epsilon))`
          : `Guard negative values: sqrt(max(0, value))`,
        variableName,
        line
      });
      break;

    case 'magnitude2d':
    case 'magnitude3d':
      guards.push({
        type: 'sqrt_negative',
        expression: expr,
        description: `magnitude uses sqrt internally (safe, but can be zero)`,
        suggestion: `Gradients may have division by zero when magnitude is zero`,
        variableName,
        line
      });
      break;

    case 'normalize2d':
    case 'normalize3d':
      guards.push({
        type: 'normalize_zero',
        expression: expr,
        description: `Normalizing zero vector causes division by zero`,
        suggestion: `if (magnitude < epsilon) return zero vector or skip normalization`,
        variableName,
        line
      });
      break;

    case 'atan2':
      guards.push({
        type: 'atan2_zero',
        expression: expr,
        description: `atan2(0, 0) is undefined and gradients have division by zero`,
        suggestion: `if (y === 0 && x === 0) return 0 with zero gradients`,
        variableName,
        line
      });
      break;

    case 'log':
      guards.push({
        type: 'division_by_zero',
        expression: expr.args[0],
        description: `log(0) is -Infinity, log(negative) is NaN`,
        suggestion: `Clamp to positive: log(max(epsilon, value))`,
        variableName,
        line
      });
      break;

    case 'asin':
    case 'acos':
      guards.push({
        type: 'division_by_zero',
        expression: expr.args[0],
        description: `${expr.name} requires argument in [-1, 1]`,
        suggestion: `Clamp: ${expr.name}(max(-1, min(1, value)))`,
        variableName,
        line
      });
      break;
  }
}

/**
 * Check if expression is a squared term (x^2 or x*x)
 */
function isSqExpression(expr: Expression): boolean {
  if (expr.kind === 'binary') {
    if (expr.operator === '*') {
      // Check if x * x
      if (expr.left.kind === 'variable' && expr.right.kind === 'variable') {
        return expr.left.name === expr.right.name;
      }
    } else if (expr.operator === '^' || expr.operator === '**') {
      // Check if x^2
      if (expr.right.kind === 'number' && expr.right.value === 2) {
        return true;
      }
    }
  }
  return false;
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
  lines.push('NaN, Infinity, or incorrect gradients:');
  lines.push('');

  // Show each guard individually with context
  for (const guard of result.guards) {
    const typeLabel = formatGuardType(guard.type);

    // Show location and variable if available
    let location = '  •';
    if (guard.line) {
      location += ` Line ${guard.line}:`;
    }
    if (guard.variableName) {
      location += ` ${guard.variableName} =`;
    }

    lines.push(location);
    lines.push(`    ${typeLabel}: ${guard.description}`);
    lines.push(`    💡 Fix: ${guard.suggestion}`);
    lines.push('');
  }

  lines.push('Add runtime checks or ensure inputs are within valid ranges.');
  lines.push('Use --guards --epsilon 1e-10 to automatically emit epsilon guards.');
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
