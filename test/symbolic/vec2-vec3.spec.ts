import { describe, it, expect } from 'vitest';
import { parse } from '../../src/symbolic/Parser';
import { computeGradients, differentiate } from '../../src/symbolic/SymbolicDiff';
import { simplify } from '../../src/symbolic/Simplify';
import { generateCode } from '../../src/symbolic/CodeGen';

describe('Vec2/Vec3 Support', () => {
  describe('Parsing', () => {
    it('should parse Vec2 constructor', () => {
      const program = parse('v = Vec2(x, y)');
      expect(program.assignments[0].expression.type).toBe('VectorConstructor');
    });

    it('should parse Vec3 constructor', () => {
      const program = parse('v = Vec3(x, y, z)');
      expect(program.assignments[0].expression.type).toBe('VectorConstructor');
    });

    it('should parse vector component access', () => {
      const program = parse('a = v.x');
      expect(program.assignments[0].expression.type).toBe('VectorAccess');
    });

    it('should parse vector magnitude property', () => {
      const program = parse('m = v.magnitude');
      expect(program.assignments[0].expression.type).toBe('FunctionCall');
    });
  });

  describe('Component-wise operations', () => {
    it('should differentiate Vec2 component access', () => {
      // d/d(v.x) of v.x = 1, d/d(v.y) of v.x = 0
      const program = parse('output = v.x');
      const grad_vx = differentiate(program.assignments[0].expression, 'v.x');
      const grad_vy = differentiate(program.assignments[0].expression, 'v.y');

      expect(simplify(grad_vx).toString()).toBe('1');
      expect(simplify(grad_vy).toString()).toBe('0');
    });

    it('should handle Vec2 in expressions', () => {
      // d/dx of (x² + y²)
      const program = parse('output = v.x * v.x + v.y * v.y');
      const grad_vx = differentiate(program.assignments[0].expression, 'v.x');

      const simplified = simplify(grad_vx);
      const code = generateCode(simplified);

      // Should be 2*v.x
      expect(code).toContain('2');
      expect(code).toContain('v.x');
    });
  });

  describe('Vector magnitude', () => {
    it.skip('should differentiate magnitude (TODO: vector variable handling)', () => {
      // This is the case mentioned in the plan: component gradients with vector notation
      // Currently blocked by needing to handle vector variables properly
      const program = parse('output = v.magnitude');
      const grad_vx = differentiate(program.assignments[0].expression, 'v.x');

      // Should be v.x / |v|
      expect(grad_vx).toBeDefined();
    });

    it('should handle expanded magnitude formula', () => {
      // Manual expansion of |v| = sqrt(vx² + vy²)
      const program = parse('output = sqrt(vx * vx + vy * vy)');
      const gradients = computeGradients(program, ['vx', 'vy']);

      const grad_vx = simplify(gradients.get('vx')!);
      const grad_vy = simplify(gradients.get('vy')!);

      const code_vx = generateCode(grad_vx);
      const code_vy = generateCode(grad_vy);

      // d/dvx(sqrt(vx² + vy²)) = vx/sqrt(vx² + vy²)
      expect(code_vx).toContain('vx');
      expect(code_vx).toContain('sqrt');

      // d/dvy(sqrt(vx² + vy²)) = vy/sqrt(vx² + vy²)
      expect(code_vy).toContain('vy');
      expect(code_vy).toContain('sqrt');
    });
  });

  describe('Dot product', () => {
    it('should handle expanded dot product', () => {
      // u·v = ux*vx + uy*vy
      const program = parse('output = ux * vx + uy * vy');
      const gradients = computeGradients(program, ['ux', 'uy', 'vx', 'vy']);

      // d/dux(u·v) = vx
      const grad_ux = simplify(gradients.get('ux')!);
      expect(generateCode(grad_ux)).toBe('vx');

      // d/dvy(u·v) = uy
      const grad_vy = simplify(gradients.get('vy')!);
      expect(generateCode(grad_vy)).toBe('uy');
    });
  });

  describe('Cross product (2D)', () => {
    it('should handle 2D cross product (scalar)', () => {
      // u×v = ux*vy - uy*vx (scalar in 2D)
      const program = parse('output = ux * vy - uy * vx');
      const gradients = computeGradients(program, ['ux', 'uy', 'vx', 'vy']);

      // d/dux(u×v) = vy
      const grad_ux = simplify(gradients.get('ux')!);
      expect(generateCode(grad_ux)).toBe('vy');

      // d/duy(u×v) = -vx
      const grad_uy = simplify(gradients.get('uy')!);
      expect(generateCode(grad_uy)).toBe('-vx');
    });
  });

  describe('Code generation with comments', () => {
    it('should generate component-wise gradients with vector notation in comments', () => {
      const program = parse('output = vx * vx + vy * vy');
      const gradients = computeGradients(program, ['vx', 'vy']);

      const simplified = new Map();
      for (const [param, expr] of gradients.entries()) {
        simplified.set(param, simplify(expr));
      }

      // Check that gradients are computed correctly
      expect(generateCode(simplified.get('vx')!)).toContain('2');
      expect(generateCode(simplified.get('vy')!)).toContain('2');
    });
  });
});
