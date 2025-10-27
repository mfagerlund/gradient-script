import { describe, it, expect } from 'vitest';
import { parse } from '../../src/symbolic/Parser';
import { differentiate } from '../../src/symbolic/SymbolicDiff';
import { simplify } from '../../src/symbolic/Simplify';
import { generateCode } from '../../src/symbolic/CodeGen';

describe('Expression Simplification', () => {
  describe('Identity simplifications', () => {
    it('should simplify x + 0 = x', () => {
      const program = parse('y = x + 0');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify 0 + x = x', () => {
      const program = parse('y = 0 + x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify x * 1 = x', () => {
      const program = parse('y = x * 1');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify 1 * x = x', () => {
      const program = parse('y = 1 * x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify x - 0 = x', () => {
      const program = parse('y = x - 0');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify x / 1 = x', () => {
      const program = parse('y = x / 1');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify x ** 1 = x', () => {
      const program = parse('y = x ** 1');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });
  });

  describe('Zero simplifications', () => {
    it('should simplify x * 0 = 0', () => {
      const program = parse('y = x * 0');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should simplify 0 * x = 0', () => {
      const program = parse('y = 0 * x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should simplify 0 / x = 0', () => {
      const program = parse('y = 0 / x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should simplify x - x = 0', () => {
      const program = parse('y = x - x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should simplify x / x = 1', () => {
      const program = parse('y = x / x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('1');
    });
  });

  describe('Constant folding', () => {
    it('should fold 2 + 3 = 5', () => {
      const program = parse('y = 2 + 3');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('5');
    });

    it('should fold 5 * 3 = 15', () => {
      const program = parse('y = 5 * 3');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('15');
    });

    it('should fold 10 / 2 = 5', () => {
      const program = parse('y = 10 / 2');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('5');
    });

    it('should fold 2 ** 3 = 8', () => {
      const program = parse('y = 2 ** 3');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('8');
    });

    it('should fold nested constants', () => {
      const program = parse('y = (2 + 3) * 4');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('20');
    });
  });

  describe('Function simplifications', () => {
    it('should fold sin(0) = 0', () => {
      const program = parse('y = sin(0)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should fold cos(0) = 1', () => {
      const program = parse('y = cos(0)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('1');
    });

    it('should fold exp(0) = 1', () => {
      const program = parse('y = exp(0)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('1');
    });

    it('should fold log(1) = 0', () => {
      const program = parse('y = log(1)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should fold sqrt(4) = 2', () => {
      const program = parse('y = sqrt(4)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('2');
    });
  });

  describe('Gradient simplifications', () => {
    it('should simplify d/dx(x + 0) = 1', () => {
      const program = parse('y = x + 0');
      const grad = differentiate(program.assignments[0].expression, 'x');
      const simplified = simplify(grad);
      const code = generateCode(simplified);
      expect(code).toBe('1');
    });

    it('should simplify d/dx(x * 1) = 1', () => {
      const program = parse('y = x * 1');
      const grad = differentiate(program.assignments[0].expression, 'x');
      const simplified = simplify(grad);
      const code = generateCode(simplified);
      expect(code).toBe('1');
    });

    it('should simplify d/dx(x^2) to not include 0 terms', () => {
      const program = parse('y = x ** 2');
      const grad = differentiate(program.assignments[0].expression, 'x');
      const simplified = simplify(grad);
      const code = generateCode(simplified);
      // Should be 2*x, not contain "+ 0" or "* 1"
      expect(code).not.toContain('+ 0');
      expect(code).not.toContain('* 1');
    });

    it('should simplify complex gradient expression', () => {
      const program = parse('y = x * x + 0 * y');
      const grad = differentiate(program.assignments[0].expression, 'x');
      const simplified = simplify(grad);
      const code = generateCode(simplified);
      // d/dx(x^2 + 0) = 2x
      expect(code).toContain('2');
      expect(code).toContain('x');
      expect(code).not.toContain('0');
    });
  });

  describe('Negation simplifications', () => {
    it('should simplify -(-x) = x', () => {
      const program = parse('y = -(-x)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('x');
    });

    it('should simplify -(0) = 0', () => {
      const program = parse('y = -(0)');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('0');
    });

    it('should simplify 0 - x = -x', () => {
      const program = parse('y = 0 - x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('-x');
    });

    it('should simplify x * -1 = -x', () => {
      const program = parse('y = x * -1');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('-x');
    });

    it('should simplify -1 * x = -x', () => {
      const program = parse('y = -1 * x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('-x');
    });
  });

  describe('Special patterns', () => {
    it('should simplify x + x = 2*x', () => {
      const program = parse('y = x + x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toBe('2 * x');
    });

    it('should simplify x * x = x^2', () => {
      const program = parse('y = x * x');
      const simplified = simplify(program.assignments[0].expression);
      const code = generateCode(simplified);
      expect(code).toContain('Math.pow(x, 2)');
    });
  });
});
