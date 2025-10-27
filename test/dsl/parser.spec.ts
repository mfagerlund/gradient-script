import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';

describe('DSL Parser', () => {
  it('should parse simple function with scalar parameters', () => {
    const input = `
      function times_two(a∇) {
        return a * 2
      }
    `;

    const program = parse(input);

    expect(program.kind).toBe('program');
    expect(program.functions).toHaveLength(1);

    const func = program.functions[0];
    expect(func.kind).toBe('function');
    expect(func.name).toBe('times_two');
    expect(func.parameters).toHaveLength(1);
    expect(func.parameters[0].name).toBe('a');
    expect(func.parameters[0].requiresGrad).toBe(true);
  });

  it('should parse function with structured parameters', () => {
    const input = `
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return u.x * v.x + u.y * v.y
      }
    `;

    const program = parse(input);

    const func = program.functions[0];
    expect(func.parameters).toHaveLength(2);

    expect(func.parameters[0].name).toBe('u');
    expect(func.parameters[0].requiresGrad).toBe(true);
    expect(func.parameters[0].paramType).toEqual({ components: ['x', 'y'] });

    expect(func.parameters[1].name).toBe('v');
    expect(func.parameters[1].requiresGrad).toBe(true);
    expect(func.parameters[1].paramType).toEqual({ components: ['x', 'y'] });
  });

  it('should parse function with intermediate variables', () => {
    const input = `
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = u.x * v.y - u.y * v.x
        dot = u.x * v.x + u.y * v.y
        return atan2(cross, dot)
      }
    `;

    const program = parse(input);

    const func = program.functions[0];
    expect(func.body).toHaveLength(2);
    expect(func.body[0].kind).toBe('assignment');
    expect(func.body[0].variable).toBe('cross');
    expect(func.body[1].variable).toBe('dot');
    expect(func.returnExpr.kind).toBe('call');
  });

  it('should parse power operators ^ and **', () => {
    const input1 = `
      function square(x∇) {
        return x^2
      }
    `;

    const program1 = parse(input1);
    expect(program1.functions[0].returnExpr.kind).toBe('binary');
    const expr1 = program1.functions[0].returnExpr as any;
    expect(expr1.operator).toBe('^');

    const input2 = `
      function square_alt(x∇) {
        return x**2
      }
    `;

    const program2 = parse(input2);
    const expr2 = program2.functions[0].returnExpr as any;
    expect(expr2.operator).toBe('**');
  });

  it('should parse function calls', () => {
    const input = `
      function test(u∇: {x, y}, v∇: {x, y}) {
        return atan2(cross2d(u, v), dot2d(u, v))
      }
    `;

    const program = parse(input);
    const func = program.functions[0];

    expect(func.returnExpr.kind).toBe('call');
    const atan2Call = func.returnExpr as any;
    expect(atan2Call.name).toBe('atan2');
    expect(atan2Call.args).toHaveLength(2);

    expect(atan2Call.args[0].kind).toBe('call');
    expect(atan2Call.args[0].name).toBe('cross2d');

    expect(atan2Call.args[1].kind).toBe('call');
    expect(atan2Call.args[1].name).toBe('dot2d');
  });

  it('should parse component access', () => {
    const input = `
      function get_x(v: {x, y}) {
        return v.x
      }
    `;

    const program = parse(input);
    const func = program.functions[0];

    expect(func.returnExpr.kind).toBe('component');
    const access = func.returnExpr as any;
    expect(access.component).toBe('x');
    expect(access.object.kind).toBe('variable');
    expect(access.object.name).toBe('v');
  });

  it('should parse mixed gradient and non-gradient parameters', () => {
    const input = `
      function mix(a∇, b, c∇: {x, y}) {
        return a * b + c.x
      }
    `;

    const program = parse(input);
    const func = program.functions[0];

    expect(func.parameters[0].requiresGrad).toBe(true);
    expect(func.parameters[1].requiresGrad).toBe(false);
    expect(func.parameters[2].requiresGrad).toBe(true);
  });

  it('should handle operator precedence correctly', () => {
    const input = `
      function test(x∇) {
        return x + x * 2
      }
    `;

    const program = parse(input);
    const expr = program.functions[0].returnExpr as any;

    // Should parse as: x + (x * 2)
    expect(expr.kind).toBe('binary');
    expect(expr.operator).toBe('+');
    expect(expr.right.kind).toBe('binary');
    expect(expr.right.operator).toBe('*');
  });

  it('should handle power operator as right-associative', () => {
    const input = `
      function test(x∇) {
        return x^x^2
      }
    `;

    const program = parse(input);
    const expr = program.functions[0].returnExpr as any;

    // Should parse as: x^(x^2)
    expect(expr.kind).toBe('binary');
    expect(expr.operator).toBe('^');
    expect(expr.left.kind).toBe('variable');
    expect(expr.right.kind).toBe('binary');
    expect(expr.right.operator).toBe('^');
  });
});
