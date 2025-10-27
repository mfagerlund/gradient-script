/**
 * Expression simplification for GradientScript DSL
 * Applies algebraic simplification rules
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
 * Simplify an expression
 */
export function simplify(expr: Expression): Expression {
  // Apply simplification rules recursively
  const simplified = simplifyOnce(expr);

  // Keep simplifying until no more changes
  if (!expressionsEqual(simplified, expr)) {
    return simplify(simplified);
  }

  return simplified;
}

/**
 * Apply one round of simplification
 */
function simplifyOnce(expr: Expression): Expression {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return expr;

    case 'binary':
      return simplifyBinary(expr);

    case 'unary':
      return simplifyUnary(expr);

    case 'call':
      return simplifyCall(expr);

    case 'component':
      return simplifyComponent(expr);
  }
}

function simplifyBinary(expr: BinaryOp): Expression {
  const left = simplify(expr.left);
  const right = simplify(expr.right);

  // Get numeric values if both are numbers
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
    // 0 + x = x
    if (leftNum === 0) return right;
    // x + 0 = x
    if (rightNum === 0) return left;
  }

  // Subtraction rules
  if (expr.operator === '-') {
    // x - 0 = x
    if (rightNum === 0) return left;
    // 0 - x = -x
    if (leftNum === 0) {
      return { kind: 'unary', operator: '-', operand: right };
    }
    // x - x = 0
    if (expressionsEqual(left, right)) {
      return { kind: 'number', value: 0 };
    }
  }

  // Multiplication rules
  if (expr.operator === '*') {
    // 0 * x = 0
    if (leftNum === 0) return { kind: 'number', value: 0 };
    // x * 0 = 0
    if (rightNum === 0) return { kind: 'number', value: 0 };
    // 1 * x = x
    if (leftNum === 1) return right;
    // x * 1 = x
    if (rightNum === 1) return left;

    // (x / x) * y → y  (when left is x/x division)
    if (left.kind === 'binary' && left.operator === '/') {
      if (expressionsEqual(left.left, left.right)) {
        return right; // x/x = 1, so 1*y = y
      }
    }

    // 0.5 * (a + a) → a (duplicate addition)
    if (leftNum === 0.5 && right.kind === 'binary' && right.operator === '+') {
      const { left: l1, right: r1 } = right;
      if (expressionsEqual(l1, r1)) {
        return l1; // Return a
      }
    }

    // 0.5 * (a*b + b*a) → a*b (symmetric product simplification)
    if (leftNum === 0.5 && right.kind === 'binary' && right.operator === '+') {
      const { left: l1, right: r1 } = right;
      if (l1.kind === 'binary' && l1.operator === '*' &&
          r1.kind === 'binary' && r1.operator === '*') {
        // Check if l1 = a*b and r1 = b*a
        if (expressionsEqual(l1.left, r1.right) && expressionsEqual(l1.right, r1.left)) {
          return l1; // Return a*b
        }
      }
    }

    // c * (a*b + b*a) → 2*c*a*b (general symmetric product)
    if (leftNum !== null && right.kind === 'binary' && right.operator === '+') {
      const { left: l1, right: r1 } = right;
      if (l1.kind === 'binary' && l1.operator === '*' &&
          r1.kind === 'binary' && r1.operator === '*') {
        if (expressionsEqual(l1.left, r1.right) && expressionsEqual(l1.right, r1.left)) {
          // c * (a*b + b*a) = c * 2*a*b = 2*c*a*b
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
    // 0 / x = 0 (assuming x != 0)
    if (leftNum === 0) return { kind: 'number', value: 0 };
    // x / 1 = x
    if (rightNum === 1) return left;
    // x / x = 1
    if (expressionsEqual(left, right)) {
      return { kind: 'number', value: 1 };
    }
  }

  // Power rules
  if (expr.operator === '^' || expr.operator === '**') {
    // x^0 = 1
    if (rightNum === 0) return { kind: 'number', value: 1 };
    // x^1 = x
    if (rightNum === 1) return left;
    // 0^x = 0 (for x > 0)
    if (leftNum === 0) return { kind: 'number', value: 0 };
    // 1^x = 1
    if (leftNum === 1) return { kind: 'number', value: 1 };
  }

  // No simplification applied, return with simplified children
  return {
    kind: 'binary',
    operator: expr.operator,
    left,
    right
  };
}

function simplifyUnary(expr: UnaryOp): Expression {
  const operand = simplify(expr.operand);

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
    // Unary plus: +x = x
    return operand;
  }

  return {
    kind: 'unary',
    operator: expr.operator,
    operand
  };
}

function simplifyCall(expr: FunctionCall): Expression {
  // Simplify arguments
  const args = expr.args.map(arg => simplify(arg));

  // Some function-specific simplifications
  if (expr.name === 'sqrt' && args.length === 1) {
    const arg = args[0];

    // sqrt(x^2) could be simplified to abs(x), but be careful with signs
    // For now, just fold constants
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

function simplifyComponent(expr: ComponentAccess): Expression {
  const object = simplify(expr.object);

  // If object is a binary operation, expand component access
  // (u + v).x -> u.x + v.x
  if (object.kind === 'binary') {
    return simplify({
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
      // Structured gradient
      const simplifiedComps = new Map();
      for (const [comp, expr] of value.components.entries()) {
        simplifiedComps.set(comp, simplify(expr));
      }
      simplified.set(key, { components: simplifiedComps });
    } else {
      // Scalar gradient
      simplified.set(key, simplify(value));
    }
  }

  return simplified;
}
