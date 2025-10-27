import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';
import { inferFunction } from '../../src/dsl/TypeInference';
import { computeFunctionGradients } from '../../src/dsl/Differentiation';
import { GradientChecker } from '../../src/dsl/GradientChecker';

describe('DSL Gradient Checking', () => {
  it('should validate gradients for simple scalar function', () => {
    const input = `
      function square(x∇) {
        return x * x
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([['x', 3.0]]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for angle_between function', () => {
    const input = `
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([
      ['u', { x: 1.0, y: 0.0 }],
      ['v', { x: 0.0, y: 1.0 }]
    ]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.maxError).toBeLessThan(1e-4);
  });

  it('should validate gradients for dot product', () => {
    const input = `
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([
      ['u', { x: 2.0, y: 3.0 }],
      ['v', { x: 4.0, y: 5.0 }]
    ]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for magnitude squared', () => {
    const input = `
      function mag_squared(v∇: {x, y}) {
        return v.x * v.x + v.y * v.y
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([['v', { x: 3.0, y: 4.0 }]]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for distance', () => {
    const input = `
      function distance(p1∇: {x, y}, p2∇: {x, y}) {
        return distance2d(p1, p2)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([
      ['p1', { x: 1.0, y: 2.0 }],
      ['p2', { x: 4.0, y: 6.0 }]
    ]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients with trigonometric functions', () => {
    const input = `
      function trig_combo(x∇) {
        return sin(x) * cos(x)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([['x', Math.PI / 4]]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients for power functions', () => {
    const input = `
      function cubic(x∇) {
        return x^3
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([['x', 2.5]]);

    const result = checker.check(func, gradients, env, testPoint);

    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should validate gradients at multiple test points', () => {
    const input = `
      function test(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

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
    const input = `
      function simple(x∇) {
        return x * 2
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const checker = new GradientChecker();
    const testPoint = new Map([['x', 5.0]]);

    const result = checker.check(func, gradients, env, testPoint);

    // This should pass, but we're checking the result structure
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('maxError');
    expect(result).toHaveProperty('meanError');
  });
});
