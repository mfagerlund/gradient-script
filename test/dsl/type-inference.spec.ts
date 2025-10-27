import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';
import { inferTypes } from '../../src/dsl/TypeInference';
import { Types } from '../../src/dsl/Types';

describe('DSL Type Inference', () => {
  it('should infer scalar types for simple arithmetic', () => {
    const input = `
      function test(a∇) {
        return a * 2
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(func.type).toBeDefined();
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer structured types from parameter annotations', () => {
    const input = `
      function test(u∇: {x, y}) {
        return u.x
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(func.type).toBeDefined();
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer types for dot2d function', () => {
    const input = `
      function test(u∇: {x, y}, v∇: {x, y}) {
        return dot2d(u, v)
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer types for cross2d function', () => {
    const input = `
      function test(u∇: {x, y}, v∇: {x, y}) {
        return cross2d(u, v)
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer types for magnitude2d function', () => {
    const input = `
      function test(v∇: {x, y}) {
        return magnitude2d(v)
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer types for intermediate variables', () => {
    const input = `
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = cross2d(u, v)
        dot = dot2d(u, v)
        return atan2(cross, dot)
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);

    // Check intermediate variable types
    const crossAssign = func.body[0];
    expect(crossAssign.expression.type).toBeDefined();
    expect(Types.isScalar(crossAssign.expression.type!)).toBe(true);
  });

  it('should infer types for element-wise operations', () => {
    const input = `
      function test(u∇: {x, y}, v∇: {x, y}) {
        sum = u.x + v.x
        return sum
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should detect type errors in binary operations', () => {
    const input = `
      function bad(u∇: {x, y}, v∇: {x, y, z}) {
        return u.x + v.w
      }
    `;

    const program = parse(input);

    expect(() => {
      inferTypes(program);
    }).toThrow(/Component does not exist/);
  });

  it('should detect unknown function calls', () => {
    const input = `
      function bad(u∇: {x, y}) {
        return unknown_func(u)
      }
    `;

    const program = parse(input);

    expect(() => {
      inferTypes(program);
    }).toThrow(/Unknown function/);
  });

  it('should detect wrong argument types for built-in functions', () => {
    const input = `
      function bad(u∇: {x, y}, v∇: {x, y, z}) {
        return dot2d(u, v)
      }
    `;

    const program = parse(input);

    expect(() => {
      inferTypes(program);
    }).toThrow(/No matching overload/);
  });

  it('should infer types for 3D operations', () => {
    const input = `
      function test(u∇: {x, y, z}, v∇: {x, y, z}) {
        return dot3d(u, v)
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should infer vec3 return type for cross3d', () => {
    const input = `
      function test(u∇: {x, y, z}, v∇: {x, y, z}) {
        result = cross3d(u, v)
        return result.x
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);

    // Check that cross3d returns a struct
    const crossAssign = func.body[0];
    expect(crossAssign.expression.type).toBeDefined();
    expect(Types.isStruct(crossAssign.expression.type!)).toBe(true);
  });

  it('should handle scalar math functions', () => {
    const input = `
      function test(x∇) {
        return sin(cos(x))
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });

  it('should handle power operations', () => {
    const input = `
      function test(x∇) {
        return x^2 + x**3
      }
    `;

    const program = parse(input);
    inferTypes(program);

    const func = program.functions[0];
    expect(Types.isScalar(func.type!)).toBe(true);
  });
});
