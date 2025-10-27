/**
 * Expression simplification for GradientScript DSL
 * Applies algebraic simplification rules
 */

import {
  Expression,
  NumberLiteral,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess
} from './AST.js';
import { ExpressionTransformer } from './ExpressionTransformer.js';

/**
 * Simplifier - applies algebraic simplification rules recursively
 */
class Simplifier extends ExpressionTransformer {
  private fixedPoint: boolean = false;

  constructor(fixedPoint: boolean = false) {
    super();
    this.fixedPoint = fixedPoint;
  }

  protected visitBinaryOp(expr: BinaryOp): Expression {
    const left = this.transform(expr.left);
    const right = this.transform(expr.right);

    const leftNum = isNumber(left) ? left.value : null;
    const rightNum = isNumber(right) ? right.value : null;

    // Constant folding
    if (leftNum !== null && rightNum !== null) {
      let result: number;
      switch (expr.operator) {
        case '+': result = leftNum + rightNum; break;
        case '-': result = leftNum - rightNum; break;
        case '*': result = leftNum * rightNum; break;
        case '/': result = leftNum / rightNum; break;
        case '^':
        case '**': result = Math.pow(leftNum, rightNum); break;
      }
      return { kind: 'number', value: result };
    }

    // Addition rules
    if (expr.operator === '+') {
      if (leftNum === 0) return right;
      if (rightNum === 0) return left;
    }

    // Subtraction rules
    if (expr.operator === '-') {
      if (rightNum === 0) return left;
      if (leftNum === 0) {
        return { kind: 'unary', operator: '-', operand: right };
      }
      if (expressionsEqual(left, right)) {
        return { kind: 'number', value: 0 };
      }
    }

    // Multiplication rules
    if (expr.operator === '*') {
      if (leftNum === 0) return { kind: 'number', value: 0 };
      if (rightNum === 0) return { kind: 'number', value: 0 };
      if (leftNum === 1) return right;
      if (rightNum === 1) return left;

      // (x / x) * y → y
      if (left.kind === 'binary' && left.operator === '/') {
        if (expressionsEqual(left.left, left.right)) {
          return right;
        }
      }

      // 0.5 * (a + a) → a
      if (leftNum === 0.5 && right.kind === 'binary' && right.operator === '+') {
        const { left: l1, right: r1 } = right;
        if (expressionsEqual(l1, r1)) {
          return l1;
        }
      }

      // 0.5 * (a*b + b*a) → a*b
      if (leftNum === 0.5 && right.kind === 'binary' && right.operator === '+') {
        const { left: l1, right: r1 } = right;
        if (l1.kind === 'binary' && l1.operator === '*' &&
            r1.kind === 'binary' && r1.operator === '*') {
          if (expressionsEqual(l1.left, r1.right) && expressionsEqual(l1.right, r1.left)) {
            return l1;
          }
        }
      }

      // c * (a*b + b*a) → 2*c*a*b
      if (leftNum !== null && right.kind === 'binary' && right.operator === '+') {
        const { left: l1, right: r1 } = right;
        if (l1.kind === 'binary' && l1.operator === '*' &&
            r1.kind === 'binary' && r1.operator === '*') {
          if (expressionsEqual(l1.left, r1.right) && expressionsEqual(l1.right, r1.left)) {
            return {
              kind: 'binary',
              operator: '*',
              left: { kind: 'number', value: 2 * leftNum },
              right: l1
            };
          }
        }
      }
    }

    // Division rules
    if (expr.operator === '/') {
      if (leftNum === 0) return { kind: 'number', value: 0 };
      if (rightNum === 1) return left;
      if (expressionsEqual(left, right)) {
        return { kind: 'number', value: 1 };
      }
    }

    // Power rules
    if (expr.operator === '^' || expr.operator === '**') {
      if (rightNum === 0) return { kind: 'number', value: 1 };
      if (rightNum === 1) return left;
      if (leftNum === 0) return { kind: 'number', value: 0 };
      if (leftNum === 1) return { kind: 'number', value: 1 };
    }

    return {
      kind: 'binary',
      operator: expr.operator,
      left,
      right
    };
  }

  protected visitUnaryOp(expr: UnaryOp): Expression {
    const operand = this.transform(expr.operand);

    if (expr.operator === '-') {
      // Double negation: --x = x
      if (operand.kind === 'unary' && operand.operator === '-') {
        return operand.operand;
      }

      // Negate number: -5 = -5
      if (isNumber(operand)) {
        return { kind: 'number', value: -operand.value };
      }
    }

    if (expr.operator === '+') {
      return operand;
    }

    return {
      kind: 'unary',
      operator: expr.operator,
      operand
    };
  }

  protected visitFunctionCall(expr: FunctionCall): Expression {
    const args = expr.args.map(arg => this.transform(arg));

    if (expr.name === 'sqrt' && args.length === 1) {
      const arg = args[0];
      if (isNumber(arg) && arg.value >= 0) {
        return { kind: 'number', value: Math.sqrt(arg.value) };
      }
    }

    if (expr.name === 'abs' && args.length === 1) {
      const arg = args[0];
      if (isNumber(arg)) {
        return { kind: 'number', value: Math.abs(arg.value) };
      }
    }

    return {
      kind: 'call',
      name: expr.name,
      args
    };
  }

  protected visitComponentAccess(expr: ComponentAccess): Expression {
    const object = this.transform(expr.object);

    // (u + v).x -> u.x + v.x
    if (object.kind === 'binary') {
      return this.transform({
        kind: 'binary',
        operator: object.operator,
        left: {
          kind: 'component',
          object: object.left,
          component: expr.component
        },
        right: {
          kind: 'component',
          object: object.right,
          component: expr.component
        }
      });
    }

    return {
      kind: 'component',
      object,
      component: expr.component
    };
  }
}

/**
 * Simplify an expression using algebraic rules
 */
export function simplify(expr: Expression): Expression {
  let current = expr;
  let simplified: Expression;

  do {
    simplified = current;
    current = new Simplifier(false).transform(simplified);
  } while (!expressionsEqual(current, simplified));

  return current;
}

/**
 * Check if expression is a number literal
 */
function isNumber(expr: Expression): expr is NumberLiteral {
  return expr.kind === 'number';
}

/**
 * Check if two expressions are structurally equal
 */
function expressionsEqual(a: Expression, b: Expression): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'number':
      return b.kind === 'number' && a.value === b.value;

    case 'variable':
      return b.kind === 'variable' && a.name === b.name;

    case 'binary':
      if (b.kind !== 'binary') return false;
      return a.operator === b.operator &&
        expressionsEqual(a.left, b.left) &&
        expressionsEqual(a.right, b.right);

    case 'unary':
      if (b.kind !== 'unary') return false;
      return a.operator === b.operator &&
        expressionsEqual(a.operand, b.operand);

    case 'call':
      if (b.kind !== 'call') return false;
      return a.name === b.name &&
        a.args.length === b.args.length &&
        a.args.every((arg, i) => expressionsEqual(arg, b.args[i]));

    case 'component':
      if (b.kind !== 'component') return false;
      return a.component === b.component &&
        expressionsEqual(a.object, b.object);
  }
}

/**
 * Simplify all gradients in a map
 */
export function simplifyGradients(
  gradients: Map<string, Expression | { components: Map<string, Expression> }>
): Map<string, Expression | { components: Map<string, Expression> }> {
  const simplified = new Map();

  for (const [key, value] of gradients.entries()) {
    if ('components' in value) {
      const simplifiedComps = new Map();
      for (const [comp, expr] of value.components.entries()) {
        simplifiedComps.set(comp, simplify(expr));
      }
      simplified.set(key, { components: simplifiedComps });
    } else {
      simplified.set(key, simplify(value));
    }
  }

  return simplified;
}
