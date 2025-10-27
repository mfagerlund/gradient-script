import { describe, it, expect } from 'vitest';
import { parseAndCompile } from '../helpers.js';
import { parse } from '../../src/dsl/Parser.js';
import { inferFunction } from '../../src/dsl/TypeInference.js';
import { computeFunctionGradients } from '../../src/dsl/Differentiation.js';
import { generateGradientFunction } from '../../src/dsl/CodeGen.js';

describe('Code Generation - Execution Tests', () => {

  function evalGeneratedCode(code: string, funcName: string): any {
    const fullCode = `
      function dot2d(u, v) { return u.x * v.x + u.y * v.y; }
      function cross2d(u, v) { return u.x * v.y - u.y * v.x; }
      function magnitude2d(u) { return Math.sqrt(u.x * u.x + u.y * u.y); }
      ${code}
      return ${funcName};
    `;
    return new Function(fullCode)();
  }

  it('should generate executable code for simple scalar function', () => {
    const { func, env, gradients } = parseAndCompile(`
      function f(x∇) {
        return x * x
      }
    `);

    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const result = f_grad(3);

    expect(result.value).toBe(9);
    expect(result.dx).toBe(6);
  });

  it('should generate executable code with correct operator precedence', () => {
    const { func, env, gradients } = parseAndCompile(`
      function f(a∇, b∇, c∇, d∇) {
        return a / (c + d)
      }
    `);

    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const result = f_grad(10, 2, 3, 1);

    expect(result.value).toBe(2.5);
    expect(result.da).toBe(0.25);
    expect(result.dc).toBeCloseTo(-0.625, 10);
    expect(result.dd).toBeCloseTo(-0.625, 10);
  });

  it('should generate executable code for structured types', () => {
    const { func, env, gradients } = parseAndCompile(`
      function f(u∇: {x, y}) {
        return u.x * u.x + u.y * u.y
      }
    `);

    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const result = f_grad({ x: 3, y: 4 });

    expect(result.value).toBe(25);
    expect(result.du.x).toBe(6);
    expect(result.du.y).toBe(8);
  });

  it('should generate executable code for dot product', () => {
    const input = `
      function f(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const result = f_grad({ x: 2, y: 3 }, { x: 4, y: 5 });

    expect(result.value).toBe(23);
    expect(result.du.x).toBe(4);
    expect(result.du.y).toBe(5);
    expect(result.dv.x).toBe(2);
    expect(result.dv.y).toBe(3);
  });

  it('should generate executable code for angle_between without NaN', () => {
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
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const angle_between_grad = evalGeneratedCode(code, 'angle_between_grad');

    const u = { x: 1.0, y: 0.0 };
    const v = { x: 0.0, y: 1.0 };
    const result = angle_between_grad(u, v);

    expect(result.value).toBeCloseTo(Math.PI / 2, 10);
    expect(result.du.x).not.toBeNaN();
    expect(result.du.y).not.toBeNaN();
    expect(result.dv.x).not.toBeNaN();
    expect(result.dv.y).not.toBeNaN();

    expect(result.du.x).toBeCloseTo(0, 10);
    expect(result.du.y).toBeCloseTo(-1, 10);
    expect(result.dv.x).toBeCloseTo(-1, 10);
    expect(result.dv.y).toBeCloseTo(0, 10);
  });

  it('should handle complex nested expressions', () => {
    const input = `
      function f(a∇, b∇, c∇) {
        return (a * b + c) / (a - b)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const result = f_grad(5, 2, 3);

    const expected_value = (5 * 2 + 3) / (5 - 2);
    expect(result.value).toBeCloseTo(expected_value, 10);

    expect(result.da).not.toBeNaN();
    expect(result.db).not.toBeNaN();
    expect(result.dc).not.toBeNaN();

    const denom = 5 - 2;
    const numerator = 5 * 2 + 3;

    const expected_da = (2 * denom - numerator) / (denom * denom);
    const expected_db = (5 * denom + numerator) / (denom * denom);
    const expected_dc = 1 / denom;

    expect(result.da).toBeCloseTo(expected_da, 10);
    expect(result.db).toBeCloseTo(expected_db, 10);
    expect(result.dc).toBeCloseTo(expected_dc, 10);
  });

  it('should handle magnitude correctly', () => {
    const input = `
      function f(u∇: {x, y}) {
        return magnitude2d(u)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const u = { x: 3, y: 4 };
    const result = f_grad(u);

    expect(result.value).toBe(5);
    expect(result.du.x).toBeCloseTo(0.6, 10);
    expect(result.du.y).toBeCloseTo(0.8, 10);
  });

  it('should handle chained operations with intermediates', () => {
    const input = `
      function f(u∇: {x, y}, v∇: {x, y}) {
        d = dot2d(u, v)
        m1 = magnitude2d(u)
        m2 = magnitude2d(v)
        return d / (m1 * m2)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'f_grad');
    const u = { x: 1, y: 0 };
    const v = { x: 1, y: 1 };
    const result = f_grad(u, v);

    const dot = 1;
    const m1 = 1;
    const m2 = Math.sqrt(2);
    const expected_value = dot / (m1 * m2);

    expect(result.value).toBeCloseTo(expected_value, 10);
    expect(result.du.x).not.toBeNaN();
    expect(result.du.y).not.toBeNaN();
    expect(result.dv.x).not.toBeNaN();
    expect(result.dv.y).not.toBeNaN();
  });
});
