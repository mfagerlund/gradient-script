import { describe, it, expect } from 'vitest';
import { parseAndCompile } from '../helpers.js';

describe('DSL atan2 Example', () => {
  it('should compute gradients for angle_between function', () => {
    const input = `
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    // Check that we have gradients for u and v
    expect(result.gradients.has('u')).toBe(true);
    expect(result.gradients.has('v')).toBe(true);

    const gradU = result.gradients.get('u')!;
    const gradV = result.gradients.get('v')!;

    // Should be structured gradients
    expect(gradU).toHaveProperty('components');
    expect(gradV).toHaveProperty('components');

    const gradUStruct = gradU as any;
    const gradVStruct = gradV as any;

    // Should have x and y components
    expect(gradUStruct.components.has('x')).toBe(true);
    expect(gradUStruct.components.has('y')).toBe(true);
    expect(gradVStruct.components.has('x')).toBe(true);
    expect(gradVStruct.components.has('y')).toBe(true);
  });

  it('should compute gradients for simple dot product', () => {
    const input = `
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    expect(result.gradients.has('u')).toBe(true);
    expect(result.gradients.has('v')).toBe(true);

    // For dot product:
    // d/du (u·v) = v
    // d/dv (u·v) = u
    // So grad_u should be {x: v.x, y: v.y}
    // And grad_v should be {x: u.x, y: u.y}
  });

  it('should compute gradients for cross product', () => {
    const input = `
      function cross_product(u∇: {x, y}, v: {x, y}) {
        return cross2d(u, v)
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    // Only u has gradients (v doesn't have ∇)
    expect(result.gradients.has('u')).toBe(true);
    expect(result.gradients.has('v')).toBe(false);
  });

  it('should compute gradients for magnitude squared', () => {
    const input = `
      function mag_squared(v∇: {x, y}) {
        return v.x * v.x + v.y * v.y
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    expect(result.gradients.has('v')).toBe(true);

    // d/dv.x (v.x^2 + v.y^2) = 2*v.x
    // d/dv.y (v.x^2 + v.y^2) = 2*v.y
  });

  it('should compute gradients for distance squared', () => {
    const input = `
      function distance_sq(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return dx * dx + dy * dy
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    expect(result.gradients.has('u')).toBe(true);
    expect(result.gradients.has('v')).toBe(true);
  });

  it('should compute gradients with power operator', () => {
    const input = `
      function test(v∇: {x, y}) {
        return v.x^2 + v.y^2
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    expect(result.gradients.has('v')).toBe(true);
  });

  it('should handle scalar parameters', () => {
    const input = `
      function times_two(a∇) {
        return a * 2
      }
    `;

    const { func, env, gradients: result } = parseAndCompile(input);

    expect(result.gradients.has('a')).toBe(true);

    const gradA = result.gradients.get('a')!;
    // Should be a simple expression, not structured
    expect(gradA).not.toHaveProperty('components');
  });
});
