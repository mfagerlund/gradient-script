/**
 * Common Subexpression Elimination (CSE)
 * Identifies repeated expressions and factors them out
 */

import {
  Expression,
  FunctionCall,
  BinaryOp,
  UnaryOp,
  ComponentAccess,
  Variable
} from './AST.js';

export interface CSEResult {
  intermediates: Map<string, Expression>;
  simplified: Expression;
}

export interface StructuredCSEResult {
  intermediates: Map<string, Expression>;
  components: Map<string, Expression>;
}

/**
 * Perform CSE on an expression
 */
export function eliminateCommonSubexpressions(expr: Expression, minCount: number = 2): CSEResult {
  const counter = new ExpressionCounter();
  counter.count(expr);

  const intermediates = new Map<string, Expression>();
  let varCounter = 0;

  const subexprMap = new Map<string, string>();

  for (const [exprStr, count] of counter.counts.entries()) {
    if (count >= minCount) {
      const parsed = counter.expressions.get(exprStr);
      if (parsed && shouldExtract(parsed)) {
        const varName = `_tmp${varCounter++}`;
        intermediates.set(varName, parsed);
        subexprMap.set(exprStr, varName);
      }
    }
  }

  const simplified = substituteExpressions(expr, subexprMap, counter);

  return { intermediates, simplified };
}

/**
 * Perform CSE on structured gradients (for structured types like {x, y})
 */
export function eliminateCommonSubexpressionsStructured(
  components: Map<string, Expression>,
  minCount: number = 2
): StructuredCSEResult {
  const counter = new ExpressionCounter();

  for (const expr of components.values()) {
    counter.count(expr);
  }

  const intermediates = new Map<string, Expression>();
  let varCounter = 0;

  const subexprMap = new Map<string, string>();

  for (const [exprStr, count] of counter.counts.entries()) {
    if (count >= minCount) {
      const parsed = counter.expressions.get(exprStr);
      if (parsed && shouldExtract(parsed)) {
        const varName = `_tmp${varCounter++}`;
        intermediates.set(varName, parsed);
        subexprMap.set(exprStr, varName);
      }
    }
  }

  const simplifiedComponents = new Map<string, Expression>();
  for (const [comp, expr] of components.entries()) {
    simplifiedComponents.set(comp, substituteExpressions(expr, subexprMap, counter));
  }

  return { intermediates, components: simplifiedComponents };
}

/**
 * Check if an expression should be extracted
 */
function shouldExtract(expr: Expression): boolean {
  switch (expr.kind) {
    case 'number':
    case 'variable':
      return false;

    case 'component':
      return expr.object.kind !== 'variable';

    case 'unary':
      return shouldExtract(expr.operand);

    case 'binary':
      return true;

    case 'call':
      return true;

    default:
      return false;
  }
}

/**
 * Count occurrences of each subexpression
 */
class ExpressionCounter {
  counts = new Map<string, number>();
  expressions = new Map<string, Expression>();

  count(expr: Expression): void {
    const key = this.serialize(expr);

    const currentCount = this.counts.get(key) || 0;
    this.counts.set(key, currentCount + 1);

    if (!this.expressions.has(key)) {
      this.expressions.set(key, expr);
    }

    switch (expr.kind) {
      case 'binary':
        this.count(expr.left);
        this.count(expr.right);
        break;

      case 'unary':
        this.count(expr.operand);
        break;

      case 'call':
        for (const arg of expr.args) {
          this.count(arg);
        }
        break;

      case 'component':
        this.count(expr.object);
        break;
    }
  }

  serialize(expr: Expression): string {
    switch (expr.kind) {
      case 'number':
        return `num(${expr.value})`;

      case 'variable':
        return `var(${expr.name})`;

      case 'binary':
        return `bin(${expr.operator},${this.serialize(expr.left)},${this.serialize(expr.right)})`;

      case 'unary':
        return `un(${expr.operator},${this.serialize(expr.operand)})`;

      case 'call':
        const args = expr.args.map(a => this.serialize(a)).join(',');
        return `call(${expr.name},${args})`;

      case 'component':
        return `comp(${this.serialize(expr.object)},${expr.component})`;
    }
  }
}

/**
 * Substitute common subexpressions with variables
 */
function substituteExpressions(
  expr: Expression,
  subexprMap: Map<string, string>,
  counter: ExpressionCounter
): Expression {
  const key = counter.serialize(expr);

  if (subexprMap.has(key)) {
    return {
      kind: 'variable',
      name: subexprMap.get(key)!
    };
  }

  switch (expr.kind) {
    case 'number':
    case 'variable':
      return expr;

    case 'binary':
      return {
        kind: 'binary',
        operator: expr.operator,
        left: substituteExpressions(expr.left, subexprMap, counter),
        right: substituteExpressions(expr.right, subexprMap, counter)
      };

    case 'unary':
      return {
        kind: 'unary',
        operator: expr.operator,
        operand: substituteExpressions(expr.operand, subexprMap, counter)
      };

    case 'call':
      return {
        kind: 'call',
        name: expr.name,
        args: expr.args.map(arg => substituteExpressions(arg, subexprMap, counter))
      };

    case 'component':
      return {
        kind: 'component',
        object: substituteExpressions(expr.object, subexprMap, counter),
        component: expr.component
      };
  }
}
