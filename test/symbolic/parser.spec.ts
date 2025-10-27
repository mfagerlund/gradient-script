import { describe, it, expect } from 'vitest';
import { parse } from '../../src/symbolic/Parser';
import { NumberNode, VariableNode, BinaryOpNode, FunctionCallNode } from '../../src/symbolic/AST';

describe('Parser', () => {
  describe('Basic expressions', () => {
    it('should parse number literals', () => {
      const program = parse('x = 42');
      expect(program.assignments.length).toBe(1);
      expect(program.assignments[0].variable).toBe('x');
      expect(program.assignments[0].expression.type).toBe('Number');
      expect((program.assignments[0].expression as NumberNode).value).toBe(42);
    });

    it('should parse variable references', () => {
      const program = parse('y = x');
      expect(program.assignments[0].expression.type).toBe('Variable');
      expect((program.assignments[0].expression as VariableNode).name).toBe('x');
    });

    it('should parse addition', () => {
      const program = parse('z = x + y');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.type).toBe('BinaryOp');
      expect(expr.op).toBe('+');
      expect((expr.left as VariableNode).name).toBe('x');
      expect((expr.right as VariableNode).name).toBe('y');
    });

    it('should parse subtraction', () => {
      const program = parse('z = x - y');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('-');
    });

    it('should parse multiplication', () => {
      const program = parse('z = x * y');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('*');
    });

    it('should parse division', () => {
      const program = parse('z = x / y');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('/');
    });

    it('should parse power operator', () => {
      const program = parse('z = x ** 2');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('**');
      expect((expr.right as NumberNode).value).toBe(2);
    });
  });

  describe('Operator precedence', () => {
    it('should handle multiplication before addition', () => {
      const program = parse('z = x + y * 2');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('+');
      expect((expr.right as BinaryOpNode).op).toBe('*');
    });

    it('should handle power before multiplication', () => {
      const program = parse('z = x * y ** 2');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('*');
      expect((expr.right as BinaryOpNode).op).toBe('**');
    });

    it('should handle parentheses', () => {
      const program = parse('z = (x + y) * 2');
      const expr = program.assignments[0].expression as BinaryOpNode;
      expect(expr.op).toBe('*');
      expect((expr.left as BinaryOpNode).op).toBe('+');
    });
  });

  describe('Function calls', () => {
    it('should parse single-argument functions', () => {
      const program = parse('y = sin(x)');
      const expr = program.assignments[0].expression as FunctionCallNode;
      expect(expr.type).toBe('FunctionCall');
      expect(expr.name).toBe('sin');
      expect(expr.args.length).toBe(1);
      expect((expr.args[0] as VariableNode).name).toBe('x');
    });

    it('should parse nested functions', () => {
      const program = parse('y = sin(cos(x))');
      const expr = program.assignments[0].expression as FunctionCallNode;
      expect(expr.name).toBe('sin');
      const inner = expr.args[0] as FunctionCallNode;
      expect(inner.name).toBe('cos');
    });

    it('should parse two-argument functions', () => {
      const program = parse('z = pow(x, 2)');
      const expr = program.assignments[0].expression as FunctionCallNode;
      expect(expr.name).toBe('pow');
      expect(expr.args.length).toBe(2);
    });
  });

  describe('Complex expressions', () => {
    it('should parse compound expressions', () => {
      const program = parse('a = 3; b = 2; c = a * a + b; output = sin(c)');
      expect(program.assignments.length).toBe(4);
      expect(program.output).toBe('output');
    });

    it('should handle unary minus', () => {
      const program = parse('y = -x');
      const expr = program.assignments[0].expression;
      expect(expr.type).toBe('UnaryOp');
    });

    it('should parse complex mathematical expression', () => {
      const program = parse('output = (x ** 2 + y ** 2) / sqrt(x * x + y * y)');
      expect(program.assignments.length).toBe(1);
      expect(program.output).toBe('output');
    });
  });

  describe('Multiple assignments', () => {
    it('should handle multiple lines', () => {
      const input = `
        x = 1
        y = 2
        z = x + y
        output = z * 2
      `;
      const program = parse(input);
      expect(program.assignments.length).toBe(4);
      expect(program.output).toBe('output');
    });

    it('should auto-detect last assignment as output', () => {
      const program = parse('a = 1; b = a + 2');
      expect(program.output).toBe('b');
    });
  });

  describe('Error handling', () => {
    it('should throw on unexpected tokens', () => {
      expect(() => parse('x = @')).toThrow();
    });

    it('should throw on unmatched parentheses', () => {
      expect(() => parse('y = (x + 2')).toThrow();
    });

    it('should throw on invalid function syntax', () => {
      // sin without parentheses is actually valid (treated as variable multiplication)
      // but a function call with wrong arg count should fail during differentiation
      expect(() => parse('y = sin(')).toThrow();
    });
  });
});
