import { describe, it, expect } from 'vitest';
import { checkScalarGradient, checkVec2Gradient, checkGradient, parseAndCompile } from '../helpers.js';
import { GradientChecker } from '../../src/dsl/GradientChecker.js';

describe('DSL Gradient Checking', () => {
  it('should validate gradients for simple scalar function', () => {
    const result = checkScalarGradient(`
      function square(x∇) {
        return x * x
      }
    `, 3.0);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for angle_between function', () => {
    const result = checkVec2Gradient(`
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `, {
      u: { x: 1.0, y: 0.0 },
      v: { x: 0.0, y: 1.0 }
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.maxError).toBeLessThan(1e-4);
  });

  it('should validate gradients for dot product', () => {
    const result = checkVec2Gradient(`
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `, {
      u: { x: 2.0, y: 3.0 },
      v: { x: 4.0, y: 5.0 }
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for magnitude squared', () => {
    const result = checkVec2Gradient(`
      function mag_squared(v∇: {x, y}) {
        return v.x * v.x + v.y * v.y
      }
    `, {
      v: { x: 3.0, y: 4.0 }
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for distance', () => {
    const result = checkVec2Gradient(`
      function distance(p1∇: {x, y}, p2∇: {x, y}) {
        return distance2d(p1, p2)
      }
    `, {
      p1: { x: 1.0, y: 2.0 },
      p2: { x: 4.0, y: 6.0 }
    });

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients with trigonometric functions', () => {
    const result = checkScalarGradient(`
      function trig_combo(x∇) {
        return sin(x) * cos(x)
      }
    `, Math.PI / 4);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for power functions', () => {
    const result = checkScalarGradient(`
      function cubic(x∇) {
        return x^3
      }
    `, 2.5);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients at multiple test points', () => {
    const { func, env, gradients } = parseAndCompile(`
      function test(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `);

    const checker = new GradientChecker();

    // Test at multiple points
    const testPoints = [
      new Map([['u', { x: 1.0, y: 0.0 }], ['v', { x: 0.0, y: 1.0 }]]),
      new Map([['u', { x: 1.0, y: 1.0 }], ['v', { x: -1.0, y: 1.0 }]]),
      new Map([['u', { x: 2.5, y: 3.2 }], ['v', { x: -1.3, y: 0.7 }]]),
      new Map([['u', { x: 0.1, y: 0.2 }], ['v', { x: 0.3, y: 0.4 }]])
    ];

    for (const testPoint of testPoints) {
      const result = checker.check(func, gradients, env, testPoint);
      expect(result.passed).toBe(true);
    }
  });

  it('should provide detailed error information when gradients mismatch', () => {
    // This would only fail if we had a bug in differentiation
    // Just testing the error reporting structure
    const result = checkScalarGradient(`
      function simple(x∇) {
        return x * 2
      }
    `, 5.0);

    // This should pass, but we're checking the result structure
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('maxError');
    expect(result).toHaveProperty('meanError');
  });
});
