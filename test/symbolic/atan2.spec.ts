import { describe, it, expect } from 'vitest';
import { parse } from '../../src/symbolic/Parser';
import { computeGradients } from '../../src/symbolic/SymbolicDiff';
import { simplify } from '../../src/symbolic/Simplify';
import { generateCode } from '../../src/symbolic/CodeGen';

describe('atan2 Gradient', () => {
  it('should compute gradient of θ = atan2(u×v, u·v) - inline version', () => {
    // For 2D vectors u=(ux, uy) and v=(vx, vy):
    // Inline version without intermediate variables
    const input = `
      output = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    `;

    const program = parse(input);
    const gradients = computeGradients(program, ['ux', 'uy', 'vx', 'vy']);

    // Check that all gradients were computed
    expect(gradients.has('ux')).toBe(true);
    expect(gradients.has('uy')).toBe(true);
    expect(gradients.has('vx')).toBe(true);
    expect(gradients.has('vy')).toBe(true);

    // Simplify and generate code
    const grad_ux = simplify(gradients.get('ux')!);
    const code_ux = generateCode(grad_ux);

    // Should contain the atan2 derivative formula components
    expect(code_ux).toContain('Math.pow');
    expect(code_ux).toContain('vy');
  });

  it('should handle simple atan2 directly', () => {
    const input = 'output = atan2(y, x)';
    const program = parse(input);
    const gradients = computeGradients(program, ['x', 'y']);

    const grad_x = simplify(gradients.get('x')!);
    const grad_y = simplify(gradients.get('y')!);

    const code_x = generateCode(grad_x);
    const code_y = generateCode(grad_y);

    // ∂atan2(y,x)/∂x = -y/(x²+y²)
    expect(code_x).toContain('-y');
    expect(code_x).toContain('Math.pow');

    // ∂atan2(y,x)/∂y = x/(x²+y²)
    expect(code_y).toContain('x');
    expect(code_y).toContain('Math.pow');
  });
});
