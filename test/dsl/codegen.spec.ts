import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';
import { inferFunction } from '../../src/dsl/TypeInference';
import { computeFunctionGradients } from '../../src/dsl/Differentiation';
import { generateComplete, generateGradientFunction, generateForwardFunction } from '../../src/dsl/CodeGen';

describe('DSL Code Generation', () => {
  it('should generate TypeScript code for simple scalar function', () => {
    const input = `
      function times_two(a∇) {
        return a * 2
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env);

    expect(code).toContain('function times_two_grad');
    expect(code).toContain('da');
    expect(code).toContain('return');
  });

  it('should generate code for angle_between function', () => {
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

    const code = generateComplete(func, gradients, env);

    // Should have forward function
    expect(code).toContain('function angle_between(u, v)');

    // Should have gradient function
    expect(code).toContain('function angle_between_grad(u, v)');

    // Should have structured gradients
    expect(code).toContain('du');
    expect(code).toContain('dv');

    // Should compute intermediate variables
    expect(code).toContain('cross');
    expect(code).toContain('dot');

    // Should use Math.atan2
    expect(code).toContain('Math.atan2');
  });

  it('should generate code for dot product', () => {
    const input = `
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env);

    expect(code).toContain('du');
    expect(code).toContain('dv');

    // Should expand dot2d to component operations
    expect(code).toContain('u.x');
    expect(code).toContain('v.x');
  });

  it('should generate code with power operators', () => {
    const input = `
      function square(x∇) {
        return x^2
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env);

    // Should convert ^ to either x*x or Math.pow (optimization)
    expect(code).toMatch(/x \* x|Math\.pow/);
  });

  it('should generate forward function separately', () => {
    const input = `
      function test(u: {x, y}, v: {x, y}) {
        sum = u.x + v.x
        return sum * 2
      }
    `;

    const program = parse(input);
    const func = program.functions[0];

    const code = generateForwardFunction(func);

    expect(code).toContain('function test(u, v)');
    expect(code).toContain('const sum');
    expect(code).toContain('return');
  });

  it('should handle complex expressions in gradients', () => {
    const input = `
      function distance_sq(u∇: {x, y}, v: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return dx * dx + dy * dy
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env);

    expect(code).toContain('du');
    expect(code).not.toContain('dv'); // v doesn't have ∇
  });

  it('should generate Python code when requested', () => {
    const input = `
      function square(x∇) {
        return x * x
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env, { format: 'python' });

    expect(code).toContain('def square_grad');
    expect(code).not.toContain('const');
    expect(code).not.toContain('function');
  });

  it('should include comments when requested', () => {
    const input = `
      function test(a∇) {
        return a * 2
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env, { includeComments: true });

    expect(code).toContain('//');
  });

  it('should handle magnitude2d expansion', () => {
    const input = `
      function mag(v∇: {x, y}) {
        return magnitude2d(v)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateComplete(func, gradients, env);

    // Should expand magnitude2d to sqrt(v.x^2 + v.y^2)
    expect(code).toContain('Math.sqrt');
    // Should use x*x optimization for ^2
    expect(code).toMatch(/x \* .*\.x|Math\.pow/);
  });

  it('reuses forward variables in gradients without CSE', () => {
    const input = `
      function rod(pix∇, piy∇, pjx∇, pjy∇, rest) {
        dx = pix - pjx
        dy = piy - pjy
        len = sqrt(dx * dx + dy * dy)
        return len - rest
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env, { cse: false });

    expect(code).toMatch(/const dpix = .*dx/);
    expect(code).toMatch(/const dpjy = .*dy/);
    expect(code).not.toContain('(pix - pjx + pix - pjx)');
    expect(code).not.toContain('(piy - pjy + piy - pjy)');
  });

  it('reuses sqrt forward variable (len) in gradients', () => {
    const input = `
      function rod(pix∇, piy∇, pjx∇, pjy∇, rest) {
        dx = pix - pjx
        dy = piy - pjy
        len = sqrt(dx * dx + dy * dy)
        return len - rest
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);

    const code = generateGradientFunction(func, gradients, env, { cse: false });

    // Should use len instead of Math.sqrt(dx * dx + dy * dy) in gradients
    // Expected: dpix = dx / len
    // Not: dpix = (dx + dx) / (2 * Math.sqrt(dx * dx + dy * dy))
    expect(code).toMatch(/dpix.*=.*dx.*\/.*len/);
    expect(code).toMatch(/dpiy.*=.*dy.*\/.*len/);

    // Should not have redundant sqrt expressions in gradients
    const gradientSection = code.split('// Gradients')[1] || code;
    const sqrtMatches = (gradientSection.match(/Math\.sqrt\(/g) || []).length;
    expect(sqrtMatches).toBe(0); // No sqrt in gradient expressions when len exists
  });

});
