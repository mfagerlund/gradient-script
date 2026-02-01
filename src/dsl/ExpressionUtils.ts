/**
 * Shared utility functions for expression manipulation
 * Eliminates code duplication across Differentiation, Inliner, and CSE modules
 */

import {
  Expression,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess
} from './AST.js';

/**
 * Substitute all occurrences of a variable with a replacement expression
 * Used by: Differentiation, Inliner, CSE
 */
export function substituteVariable(
  expr: Expression,
  varName: string,
  replacement: Expression
): Expression {
  switch (expr.kind) {
    case 'number':
      return expr;

    case 'variable':
      return expr.name === varName ? replacement : expr;

    case 'binary':
      return {
        kind: 'binary',
        operator: expr.operator,
        left: substituteVariable(expr.left, varName, replacement),
        right: substituteVariable(expr.right, varName, replacement)
      };

    case 'unary':
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: substituteVariable(expr.operand, varName, replacement)
      };

    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(arg => substituteVariable(arg, varName, replacement))
      };

    case 'component':
      return {
        kind: 'component',
        object: substituteVariable(expr.object, varName, replacement),
        component: expr.component
      };
  }
}

/**
 * Check if expression is zero
 */
export function isZero(expr: Expression): boolean {
  return expr.kind === 'number' && expr.value === 0;
}

/**
 * Check if expression is one
 */
export function isOne(expr: Expression): boolean {
  return expr.kind === 'number' && expr.value === 1;
}

/**
 * Check if expression is a constant (number literal)
 */
export function isConstant(expr: Expression): boolean {
  return expr.kind === 'number';
}

/**
 * Check if expression is a variable
 * If name is provided, checks if it matches that specific variable name
 */
export function isVariable(expr: Expression, name?: string): boolean {
  if (expr.kind !== 'variable') {
    return false;
  }
  return name === undefined || expr.name === name;
}

/**
 * Check if expression is a negative number
 */
export function isNegative(expr: Expression): boolean {
  return expr.kind === 'number' && expr.value < 0;
}

/**
 * Create a number literal
 */
export function makeNumber(value: number): NumberLiteral {
  return { kind: 'number', value };
}

/**
 * Create a binary operation
 */
export function makeBinaryOp(
  op: '+' | '-' | '*' | '/' | '^' | '**',
  left: Expression,
  right: Expression
): BinaryOp {
  return {
    kind: 'binary',
    operator: op,
    left,
    right
  };
}

/**
 * Create a variable reference
 */
export function makeVariable(name: string): Variable {
  return { kind: 'variable', name };
}

/**
 * Get all variable names used in an expression
 */
export function getVariables(expr: Expression): Set<string> {
  const vars = new Set<string>();

  function collect(e: Expression): void {
    switch (e.kind) {
      case 'variable':
        vars.add(e.name);
        break;

      case 'binary':
        collect(e.left);
        collect(e.right);
        break;

      case 'unary':
        collect(e.operand);
        break;

      case 'call':
        for (const arg of e.args) {
          collect(arg);
        }
        break;

      case 'component':
        collect(e.object);
        if (e.object.kind === 'variable') {
          vars.add(`${e.object.name}.${e.component}`);
        }
        break;
    }
  }

  collect(expr);
  return vars;
}

/**
 * Check if an expression contains a specific variable
 */
export function containsVariable(expr: Expression, varName: string): boolean {
  switch (expr.kind) {
    case 'number':
      return false;

    case 'variable':
      return expr.name === varName;

    case 'binary':
      return containsVariable(expr.left, varName) || containsVariable(expr.right, varName);

    case 'unary':
      return containsVariable(expr.operand, varName);

    case 'call':
      return expr.args.some(arg => containsVariable(arg, varName));

    case 'component':
      if (expr.object.kind === 'variable') {
        const fullName = `${expr.object.name}.${expr.component}`;
        return fullName === varName || expr.object.name === varName;
      }
      return containsVariable(expr.object, varName);
  }
}

/**
 * Calculate the maximum nesting depth of an expression
 */
export function expressionDepth(expr: Expression): number {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return 1;

    case 'binary':
      return 1 + Math.max(expressionDepth(expr.left), expressionDepth(expr.right));

    case 'unary':
      return 1 + expressionDepth(expr.operand);

    case 'call':
      if (expr.args.length === 0) {
        return 1;
      }
      return 1 + Math.max(...expr.args.map(expressionDepth));

    case 'component':
      return 1 + expressionDepth(expr.object);
  }
}

/**
 * Serializes an expression to structural string representation.
 * Used for exact expression comparison - operand order matters.
 *
 * This ensures consistent string representation of expressions across different
 * parts of the codebase.
 */
export function serializeExpression(expr: Expression): string {
  switch (expr.kind) {
    case 'number':
      return `num(${expr.value})`;

    case 'variable':
      return `var(${expr.name})`;

    case 'binary':
      return `bin(${expr.operator},${serializeExpression(expr.left)},${serializeExpression(expr.right)})`;

    case 'unary':
      return `un(${expr.operator},${serializeExpression(expr.operand)})`;

    case 'call':
      const args = expr.args.map(arg => serializeExpression(arg)).join(',');
      return `call(${expr.name},${args})`;

    case 'component':
      return `comp(${serializeExpression(expr.object)},${expr.component})`;
  }
}

/**
 * Serializes an expression to canonical form for CSE matching.
 * Commutative operations (+ and *) have operands sorted lexicographically,
 * so a*b and b*a produce the same canonical string.
 */
export function serializeCanonical(expr: Expression): string {
  switch (expr.kind) {
    case 'number':
      return `num(${expr.value})`;

    case 'variable':
      return `var(${expr.name})`;

    case 'binary': {
      const leftStr = serializeCanonical(expr.left);
      const rightStr = serializeCanonical(expr.right);

      // For commutative operations, sort operands lexicographically
      if (expr.operator === '+' || expr.operator === '*') {
        const [first, second] = leftStr <= rightStr ? [leftStr, rightStr] : [rightStr, leftStr];
        return `bin(${expr.operator},${first},${second})`;
      }

      // Non-commutative: preserve order
      return `bin(${expr.operator},${leftStr},${rightStr})`;
    }

    case 'unary':
      return `un(${expr.operator},${serializeCanonical(expr.operand)})`;

    case 'call': {
      const args = expr.args.map(arg => serializeCanonical(arg)).join(',');
      return `call(${expr.name},${args})`;
    }

    case 'component':
      return `comp(${serializeCanonical(expr.object)},${expr.component})`;
  }
}
