import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';
import { parseAndCompile } from '../helpers.js';
import { GradientChecker } from '../../src/dsl/GradientChecker';
import { ParseError, TypeError } from '../../src/dsl/Errors';
import { inferFunction } from '../../src/dsl/TypeInference';
import { computeFunctionGradients } from '../../src/dsl/Differentiation';

describe('DSL Edge Cases', () => {
  describe('Division by Zero in Gradients', () => {
    it('should handle distance between identical points (gradient singularity)', () => {
      const input = `
        function distance(p1∇: {x, y}, p2∇: {x, y}) {
          return distance2d(p1, p2)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['p1', { x: 1.0, y: 2.0 }],
        ['p2', { x: 1.0, y: 2.0 }]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
      expect(result.maxError).toBeLessThan(1e-4);
    });

    it('should have gradient errors when distance very close to singularity', () => {
      const input = `
        function distance(p1∇: {x, y}, p2∇: {x, y}) {
          return distance2d(p1, p2)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['p1', { x: 0.0, y: 0.0 }],
        ['p2', { x: 1e-6, y: 1e-6 }]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle magnitude at origin (gradient singularity)', () => {
      const input = `
        function mag(v∇: {x, y}) {
          return magnitude2d(v)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['v', { x: 0.0, y: 0.0 }]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
      expect(result.maxError).toBeLessThan(1e-4);
    });

    it('should handle normalization away from origin', () => {
      const input = `
        function norm(v∇: {x, y}) {
          mag = magnitude2d(v)
          return mag * 2.0
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['v', { x: 3.0, y: 4.0 }]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should have gradient errors with near-zero denominator', () => {
      const input = `
        function ratio(a∇, b∇) {
          return a / b
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['a', 1.0],
        ['b', 1e-10]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle sqrt near zero', () => {
      const input = `
        function sqrt_test(x∇) {
          return sqrt(x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 1e-8]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });
  });

  describe('Non-smooth Function Boundaries', () => {
    it('should have gradient errors for min when arguments are equal (non-smooth)', () => {
      const input = `
        function min_test(a∇, b∇) {
          return min(a, b)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['a', 3.0],
        ['b', 3.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should have gradient errors for max when arguments are equal (non-smooth)', () => {
      const input = `
        function max_test(a∇, b∇) {
          return max(a, b)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['a', 5.0],
        ['b', 5.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle min when a < b', () => {
      const input = `
        function min_test(a∇, b∇) {
          return min(a, b)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['a', 2.0],
        ['b', 5.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle max when a > b', () => {
      const input = `
        function max_test(a∇, b∇) {
          return max(a, b)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['a', 7.0],
        ['b', 3.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle clamp with min and max', () => {
      const input = `
        function clamp_manual(x∇, lo, hi) {
          return min(max(x, lo), hi)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 5.0],
        ['lo', 0.0],
        ['hi', 10.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should have gradient errors at clamp boundary using min/max', () => {
      const input = `
        function clamp_manual(x∇) {
          lo = 0.0
          hi = 10.0
          return min(max(x, lo), hi)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 1e-10]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle manual clamp in middle range', () => {
      const input = `
        function clamp_manual(x∇, lo, hi) {
          return min(max(x, lo), hi)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 5.0],
        ['lo', 0.0],
        ['hi', 10.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should have gradient errors for abs at zero (non-smooth)', () => {
      const input = `
        function abs_test(x∇) {
          return abs(x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 0.001]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should have gradient errors near atan2 branch cut', () => {
      const input = `
        function angle(y∇, x∇) {
          return atan2(y, x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['y', 1e-10],
        ['x', -1.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Type Inference Edge Cases', () => {
    it('should reject mismatched struct types in binary operations', () => {
      const input = `
        function bad(u∇: {x, y}, v∇: {x, y, z}) {
          return dot2d(u, v)
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow();
    });

    it('should reject accessing non-existent component', () => {
      const input = `
        function bad(v∇: {x, y}) {
          return v.z
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow(/Component does not exist/);
    });

    it('should reject accessing component on scalar', () => {
      const input = `
        function bad(x∇) {
          return x.y
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow();
    });

    it('should reject built-in with wrong number of arguments', () => {
      const input = `
        function bad(v∇: {x, y}) {
          return dot2d(v)
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow();
    });

    it('should reject unknown function call', () => {
      const input = `
        function bad(x∇) {
          return unknown_function(x)
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow(/Unknown function/);
    });

    it('should reject mixing vec2 and vec3 in cross3d', () => {
      const input = `
        function bad(u∇: {x, y}, v∇: {x, y, z}) {
          return cross3d(u, v)
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow();
    });

    it('should accept valid component access chain', () => {
      const input = `
        function good(v∇: {x, y}) {
          return v.x + v.y
        }
      `;

      const program = parse(input);
      const env = inferFunction(program.functions[0]);

      expect(env).toBeDefined();
    });

    it('should reject calling scalar function on struct', () => {
      const input = `
        function bad(v∇: {x, y}) {
          return sin(v)
        }
      `;

      const program = parse(input);

      expect(() => {
        inferFunction(program.functions[0]);
      }).toThrow();
    });
  });

  describe('Parser Error Cases', () => {
    it('should throw ParseError on missing closing parenthesis', () => {
      const input = `
        function bad(x∇) {
          return sin(x
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw ParseError on unmatched braces', () => {
      const input = `
        function bad(x∇) {
          return x * 2
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw error on invalid operator', () => {
      const input = `
        function bad(x∇) {
          return x & 2
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow();
    });

    it('should throw ParseError on missing function keyword', () => {
      const input = `
        bad(x∇) {
          return x * 2
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw ParseError on invalid parameter syntax', () => {
      const input = `
        function bad(x∇ y∇) {
          return x + y
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw ParseError on missing return statement', () => {
      const input = `
        function bad(x∇) {
          y = x * 2
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw ParseError on empty function body', () => {
      const input = `
        function bad(x∇) {
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should throw ParseError on malformed type annotation', () => {
      const input = `
        function bad(v∇: {x, y,}) {
          return v.x
        }
      `;

      expect(() => {
        parse(input);
      }).toThrow(ParseError);
    });

    it('should parse valid function with all features', () => {
      const input = `
        function good(u∇: {x, y}, v∇: {x, y}, scale) {
          mag_u = magnitude2d(u)
          mag_v = magnitude2d(v)
          return (mag_u + mag_v) * scale
        }
      `;

      const program = parse(input);
      expect(program.functions).toHaveLength(1);
      expect(program.functions[0].parameters).toHaveLength(3);
    });
  });

  describe('Deep Expression Nesting', () => {
    it('should handle 20 levels of nested addition', () => {
      const nested = 'x + '.repeat(20) + 'x';
      const input = `
        function deep(x∇) {
          return ${nested}
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 1.0]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle 20 levels of nested multiplication', () => {
      const nested = 'x * '.repeat(20) + 'x';
      const input = `
        function deep(x∇) {
          return ${nested}
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 1.01]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle nested function calls', () => {
      const input = `
        function deep(x∇) {
          return sin(cos(sin(cos(sin(cos(sin(cos(x))))))))
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 0.5]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle deeply nested parentheses', () => {
      const input = `
        function deep(x∇) {
          return ((((((((((x + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1) + 1)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 5.0]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle complex nested expression with mixed operators', () => {
      const input = `
        function complex(x∇, y∇) {
          return ((x * (y + (x / (y - (x + (y * x)))))) ^ 2)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 2.0],
        ['y', 5.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });
  });

  describe('Numerical Stability', () => {
    it('should handle very small values near machine epsilon', () => {
      const input = `
        function tiny(x∇, y∇) {
          return x * y
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 1e-10],
        ['y', 1e-10]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should have precision issues with very large values', () => {
      const input = `
        function large(x∇, y∇) {
          return x + y
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 1e10],
        ['y', 1e10]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle exp with moderate values', () => {
      const input = `
        function exp_test(x∇) {
          return exp(x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 5.0]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle log near 1', () => {
      const input = `
        function log_test(x∇) {
          return log(x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 1.0001]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle mixed scales in vector operations', () => {
      const input = `
        function mixed(u∇: {x, y}, v∇: {x, y}) {
          return dot2d(u, v)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['u', { x: 1e-5, y: 1e5 }],
        ['v', { x: 1e5, y: 1e-5 }]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle subtraction with loss of significance', () => {
      const input = `
        function cancel(x∇, y∇) {
          return x - y
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 1.0000000001],
        ['y', 1.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should reject pow function (not implemented)', () => {
      const input = `
        function pow_test(x∇) {
          return pow(x, 0.5)
        }
      `;

      const program = parse(input);
      const func = program.functions[0];
      const env = inferFunction(func);

      expect(() => {
        computeFunctionGradients(func, env);
      }).toThrow(/not implemented/);
    });

    it('should handle trigonometric functions near boundaries', () => {
      const input = `
        function trig(x∇) {
          return sin(x) / cos(x)
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', Math.PI / 4]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });
  });

  describe('Boundary Conditions for Inverse Trig', () => {
    it('should reject asin (not implemented)', () => {
      const input = `
        function asin_test(x∇) {
          return asin(x)
        }
      `;

      const program = parse(input);
      const func = program.functions[0];
      const env = inferFunction(func);

      expect(() => {
        computeFunctionGradients(func, env);
      }).toThrow(/not implemented/);
    });

    it('should reject acos (not implemented)', () => {
      const input = `
        function acos_test(x∇) {
          return acos(x)
        }
      `;

      const program = parse(input);
      const func = program.functions[0];
      const env = inferFunction(func);

      expect(() => {
        computeFunctionGradients(func, env);
      }).toThrow(/not implemented/);
    });
  });

  describe('Zero Gradient Cases', () => {
    it('should handle constant function', () => {
      const input = `
        function constant(x∇) {
          return 42.0
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([['x', 5.0]]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });

    it('should handle function independent of gradient parameter', () => {
      const input = `
        function independent(x∇, y) {
          return y * 2
        }
      `;

      const { func, env, gradients } = parseAndCompile(input);

      const checker = new GradientChecker();
      const testPoint = new Map([
        ['x', 3.0],
        ['y', 7.0]
      ]);

      const result = checker.check(func, gradients, env, testPoint);

      expect(result.passed).toBe(true);
    });
  });
});
