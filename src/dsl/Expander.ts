/**
 * Expander for GradientScript DSL
 * Expands built-in functions and struct operations into scalar operations
 */

import {
  Expression,
  BinaryOp,
  FunctionCall,
  ComponentAccess,
  Variable,
  NumberLiteral
} from './AST.js';
import { Type, Types } from './Types.js';

/**
 * Expand built-in function calls to scalar expressions
 */
export function expandBuiltIn(call: FunctionCall): Expression {
  const { name, args } = call;

  switch (name) {
    case 'dot2d':
      return expandDot2d(args[0], args[1]);
    case 'cross2d':
      return expandCross2d(args[0], args[1]);
    case 'magnitude2d':
      return expandMagnitude2d(args[0]);
    case 'normalize2d':
      throw new Error('normalize2d not yet supported in differentiation');
    case 'distance2d':
      return expandDistance2d(args[0], args[1]);
    case 'dot3d':
      return expandDot3d(args[0], args[1]);
    case 'cross3d':
      throw new Error('cross3d returns vector - not yet supported');
    case 'magnitude3d':
      return expandMagnitude3d(args[0]);
    default:
      // Math functions (sin, cos, etc.) don't need expansion
      return call;
  }
}

/**
 * Expand dot2d(u, v) → u.x * v.x + u.y * v.y
 */
function expandDot2d(u: Expression, v: Expression): Expression {
  return {
    kind: 'binary',
    operator: '+',
    left: {
      kind: 'binary',
      operator: '*',
      left: component(u, 'x'),
      right: component(v, 'x')
    },
    right: {
      kind: 'binary',
      operator: '*',
      left: component(u, 'y'),
      right: component(v, 'y')
    }
  };
}

/**
 * Expand cross2d(u, v) → u.x * v.y - u.y * v.x
 */
function expandCross2d(u: Expression, v: Expression): Expression {
  return {
    kind: 'binary',
    operator: '-',
    left: {
      kind: 'binary',
      operator: '*',
      left: component(u, 'x'),
      right: component(v, 'y')
    },
    right: {
      kind: 'binary',
      operator: '*',
      left: component(u, 'y'),
      right: component(v, 'x')
    }
  };
}

/**
 * Expand magnitude2d(v) → sqrt(v.x^2 + v.y^2)
 */
function expandMagnitude2d(v: Expression): Expression {
  return {
    kind: 'call',
    name: 'sqrt',
    args: [{
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'binary',
        operator: '^',
        left: component(v, 'x'),
        right: { kind: 'number', value: 2 }
      },
      right: {
        kind: 'binary',
        operator: '^',
        left: component(v, 'y'),
        right: { kind: 'number', value: 2 }
      }
    }]
  };
}

/**
 * Expand distance2d(p1, p2) → magnitude2d(p2 - p1)
 * But we can't subtract structs yet, so expand fully:
 * sqrt((p2.x - p1.x)^2 + (p2.y - p1.y)^2)
 */
function expandDistance2d(p1: Expression, p2: Expression): Expression {
  const dx: BinaryOp = {
    kind: 'binary',
    operator: '-',
    left: component(p2, 'x'),
    right: component(p1, 'x')
  };

  const dy: BinaryOp = {
    kind: 'binary',
    operator: '-',
    left: component(p2, 'y'),
    right: component(p1, 'y')
  };

  return {
    kind: 'call',
    name: 'sqrt',
    args: [{
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'binary',
        operator: '^',
        left: dx,
        right: { kind: 'number', value: 2 }
      },
      right: {
        kind: 'binary',
        operator: '^',
        left: dy,
        right: { kind: 'number', value: 2 }
      }
    }]
  };
}

/**
 * Expand dot3d(u, v) → u.x * v.x + u.y * v.y + u.z * v.z
 */
function expandDot3d(u: Expression, v: Expression): Expression {
  return {
    kind: 'binary',
    operator: '+',
    left: {
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'binary',
        operator: '*',
        left: component(u, 'x'),
        right: component(v, 'x')
      },
      right: {
        kind: 'binary',
        operator: '*',
        left: component(u, 'y'),
        right: component(v, 'y')
      }
    },
    right: {
      kind: 'binary',
      operator: '*',
      left: component(u, 'z'),
      right: component(v, 'z')
    }
  };
}

/**
 * Expand magnitude3d(v) → sqrt(v.x^2 + v.y^2 + v.z^2)
 */
function expandMagnitude3d(v: Expression): Expression {
  return {
    kind: 'call',
    name: 'sqrt',
    args: [{
      kind: 'binary',
      operator: '+',
      left: {
        kind: 'binary',
        operator: '+',
        left: {
          kind: 'binary',
          operator: '^',
          left: component(v, 'x'),
          right: { kind: 'number', value: 2 }
        },
        right: {
          kind: 'binary',
          operator: '^',
          left: component(v, 'y'),
          right: { kind: 'number', value: 2 }
        }
      },
      right: {
        kind: 'binary',
        operator: '^',
        left: component(v, 'z'),
        right: { kind: 'number', value: 2 }
      }
    }]
  };
}

/**
 * Helper: Create component access expression
 */
function component(obj: Expression, comp: string): ComponentAccess {
  return {
    kind: 'component',
    object: obj,
    component: comp
  };
}

/**
 * Check if a function call should be expanded
 */
export function shouldExpand(name: string): boolean {
  const expandable = ['dot2d', 'cross2d', 'magnitude2d', 'distance2d', 'dot3d', 'magnitude3d'];
  return expandable.includes(name);
}
