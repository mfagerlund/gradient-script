import { describe, it, expect } from 'vitest';
import { serializeExpression } from '../../src/dsl/ExpressionUtils';
import {
  Expression,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess
} from '../../src/dsl/AST';

describe('Expression Serialization', () => {
  it('should serialize number literals', () => {
    const expr: NumberLiteral = { kind: 'number', value: 42 };
    expect(serializeExpression(expr)).toBe('num(42)');
  });

  it('should serialize negative numbers', () => {
    const expr: NumberLiteral = { kind: 'number', value: -3.14 };
    expect(serializeExpression(expr)).toBe('num(-3.14)');
  });

  it('should serialize variables', () => {
    const expr: Variable = { kind: 'variable', name: 'x' };
    expect(serializeExpression(expr)).toBe('var(x)');
  });

  it('should serialize binary operations', () => {
    const expr: BinaryOp = {
      kind: 'binary',
      operator: '+',
      left: { kind: 'variable', name: 'a' },
      right: { kind: 'number', value: 5 }
    };
    expect(serializeExpression(expr)).toBe('bin(+,var(a),num(5))');
  });

  it('should serialize nested binary operations', () => {
    const expr: BinaryOp = {
      kind: 'binary',
      operator: '*',
      left: {
        kind: 'binary',
        operator: '+',
        left: { kind: 'variable', name: 'x' },
        right: { kind: 'number', value: 1 }
      },
      right: { kind: 'variable', name: 'y' }
    };
    expect(serializeExpression(expr)).toBe('bin(*,bin(+,var(x),num(1)),var(y))');
  });

  it('should serialize unary operations', () => {
    const expr: UnaryOp = {
      kind: 'unary',
      operator: '-',
      operand: { kind: 'variable', name: 'x' }
    };
    expect(serializeExpression(expr)).toBe('un(-,var(x))');
  });

  it('should serialize function calls with no arguments', () => {
    const expr: FunctionCall = {
      kind: 'call',
      name: 'foo',
      args: []
    };
    expect(serializeExpression(expr)).toBe('call(foo,)');
  });

  it('should serialize function calls with single argument', () => {
    const expr: FunctionCall = {
      kind: 'call',
      name: 'sin',
      args: [{ kind: 'variable', name: 'x' }]
    };
    expect(serializeExpression(expr)).toBe('call(sin,var(x))');
  });

  it('should serialize function calls with multiple arguments', () => {
    const expr: FunctionCall = {
      kind: 'call',
      name: 'atan2',
      args: [
        { kind: 'variable', name: 'y' },
        { kind: 'variable', name: 'x' }
      ]
    };
    expect(serializeExpression(expr)).toBe('call(atan2,var(y),var(x))');
  });

  it('should serialize component access', () => {
    const expr: ComponentAccess = {
      kind: 'component',
      object: { kind: 'variable', name: 'v' },
      component: 'x'
    };
    expect(serializeExpression(expr)).toBe('comp(var(v),x)');
  });

  it('should serialize nested component access', () => {
    const expr: ComponentAccess = {
      kind: 'component',
      object: {
        kind: 'component',
        object: { kind: 'variable', name: 'obj' },
        component: 'inner'
      },
      component: 'field'
    };
    expect(serializeExpression(expr)).toBe('comp(comp(var(obj),inner),field)');
  });

  it('should produce identical strings for identical expressions', () => {
    const expr1: BinaryOp = {
      kind: 'binary',
      operator: '*',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'variable', name: 'y' }
    };

    const expr2: BinaryOp = {
      kind: 'binary',
      operator: '*',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'variable', name: 'y' }
    };

    expect(serializeExpression(expr1)).toBe(serializeExpression(expr2));
  });

  it('should produce different strings for different expressions', () => {
    const expr1: BinaryOp = {
      kind: 'binary',
      operator: '+',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'variable', name: 'y' }
    };

    const expr2: BinaryOp = {
      kind: 'binary',
      operator: '*',
      left: { kind: 'variable', name: 'x' },
      right: { kind: 'variable', name: 'y' }
    };

    expect(serializeExpression(expr1)).not.toBe(serializeExpression(expr2));
  });

  it('should serialize complex nested expression', () => {
    // sqrt(x*x + y*y)
    const expr: FunctionCall = {
      kind: 'call',
      name: 'sqrt',
      args: [{
        kind: 'binary',
        operator: '+',
        left: {
          kind: 'binary',
          operator: '*',
          left: { kind: 'variable', name: 'x' },
          right: { kind: 'variable', name: 'x' }
        },
        right: {
          kind: 'binary',
          operator: '*',
          left: { kind: 'variable', name: 'y' },
          right: { kind: 'variable', name: 'y' }
        }
      }]
    };

    expect(serializeExpression(expr)).toBe(
      'call(sqrt,bin(+,bin(*,var(x),var(x)),bin(*,var(y),var(y))))'
    );
  });

  it('should handle all operators', () => {
    const operators: Array<'+' | '-' | '*' | '/' | '^' | '**'> = ['+', '-', '*', '/', '^', '**'];

    operators.forEach(op => {
      const expr: BinaryOp = {
        kind: 'binary',
        operator: op,
        left: { kind: 'variable', name: 'a' },
        right: { kind: 'variable', name: 'b' }
      };

      expect(serializeExpression(expr)).toBe(`bin(${op},var(a),var(b))`);
    });
  });
});
