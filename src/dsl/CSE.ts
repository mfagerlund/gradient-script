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
  Variable,
  NumberLiteral
} from './AST.js';
import { ExpressionTransformer } from './ExpressionTransformer.js';
import { serializeExpression } from './ExpressionUtils.js';

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
 * Counts occurrences of subexpressions during traversal
 */
class ExpressionCounter extends ExpressionTransformer {
  counts = new Map<string, number>();
  expressions = new Map<string, Expression>();

  count(expr: Expression): void {
    this.transform(expr);
  }

  serialize(expr: Expression): string {
    return serializeExpression(expr);
  }

  private recordExpression(expr: Expression): void {
    const key = this.serialize(expr);
    const currentCount = this.counts.get(key) || 0;
    this.counts.set(key, currentCount + 1);

    if (!this.expressions.has(key)) {
      this.expressions.set(key, expr);
    }
  }

  protected visitNumber(node: NumberLiteral): Expression {
    this.recordExpression(node);
    return node;
  }

  protected visitVariable(node: Variable): Expression {
    this.recordExpression(node);
    return node;
  }

  protected visitBinaryOp(node: BinaryOp): Expression {
    this.recordExpression(node);
    return super.visitBinaryOp(node);
  }

  protected visitUnaryOp(node: UnaryOp): Expression {
    this.recordExpression(node);
    return super.visitUnaryOp(node);
  }

  protected visitFunctionCall(node: FunctionCall): Expression {
    this.recordExpression(node);
    return super.visitFunctionCall(node);
  }

  protected visitComponentAccess(node: ComponentAccess): Expression {
    this.recordExpression(node);
    return super.visitComponentAccess(node);
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

  let result = expr;
  for (const [exprStr, varName] of subexprMap.entries()) {
    const exprToReplace = counter.expressions.get(exprStr);
    if (exprToReplace && counter.serialize(result) !== exprStr) {
      result = substituteInExpression(result, exprToReplace, { kind: 'variable', name: varName }, counter);
    }
  }

  return result;
}

/**
 * Transformer that substitutes a pattern with a replacement expression
 * Used for CSE optimization to replace repeated subexpressions with intermediate variables
 */
class PatternSubstitutionTransformer extends ExpressionTransformer {
  constructor(
    private pattern: Expression,
    private replacement: Expression,
    private counter: ExpressionCounter
  ) {
    super();
  }

  transform(expr: Expression): Expression {
    if (this.counter.serialize(expr) === this.counter.serialize(this.pattern)) {
      return this.replacement;
    }
    return super.transform(expr);
  }
}

/**
 * Helper to substitute an expression pattern with a replacement
 */
function substituteInExpression(
  expr: Expression,
  pattern: Expression,
  replacement: Expression,
  counter: ExpressionCounter
): Expression {
  const transformer = new PatternSubstitutionTransformer(pattern, replacement, counter);
  return transformer.transform(expr);
}
