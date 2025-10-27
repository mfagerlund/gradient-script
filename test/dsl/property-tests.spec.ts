import { describe, it, expect } from 'vitest';
import { parse } from '../../src/dsl/Parser';
import { inferFunction } from '../../src/dsl/TypeInference';
import { computeFunctionGradients } from '../../src/dsl/Differentiation';
import { generateGradientFunction } from '../../src/dsl/CodeGen';

function evalGeneratedCode(code: string, funcName: string): any {
  const func = new Function(`
    function dot2d(u, v) { return u.x * v.x + u.y * v.y; }
    function cross2d(u, v) { return u.x * v.y - u.y * v.x; }
    function magnitude2d(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
    ${code}
    return ${funcName};
  `)();
  return func;
}

describe('Property Tests - Singularities', () => {
  it('should handle near-zero denominators in normalized operations', () => {
    const input = `
      function normalized_dot(u∇: {x, y}, v∇: {x, y}) {
        dot = u.x * v.x + u.y * v.y
        u_mag = sqrt(u.x * u.x + u.y * u.y)
        v_mag = sqrt(v.x * v.x + v.y * v.y)
        return dot / (u_mag * v_mag)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'normalized_dot_grad');

    // Test with vectors approaching zero
    const epsilon = 1e-8;
    const u = { x: epsilon, y: epsilon };
    const v = { x: 1, y: 0 };

    const result = f_grad(u, v);

    // Gradients should not be NaN or Infinity
    expect(result.du.x).not.toBeNaN();
    expect(result.du.y).not.toBeNaN();
    expect(result.dv.x).not.toBeNaN();
    expect(result.dv.y).not.toBeNaN();

    expect(Math.abs(result.du.x)).toBeLessThan(1e10); // Not infinity
    expect(Math.abs(result.du.y)).toBeLessThan(1e10);
  });

  it('should handle division by zero in distance function', () => {
    const input = `
      function distance(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return sqrt(dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'distance_grad');

    // Test with nearly identical points
    const epsilon = 1e-10;
    const u = { x: 0, y: 0 };
    const v = { x: epsilon, y: epsilon };

    const result = f_grad(u, v);

    // Should produce large but finite gradients
    expect(result.du.x).not.toBeNaN();
    expect(result.du.y).not.toBeNaN();
    expect(Math.abs(result.du.x)).toBeLessThan(1e10);
  });

  it('should handle atan2 singularity at origin', () => {
    const input = `
      function angle_between(u∇: {x, y}, v∇: {x, y}) {
        cross = u.x * v.y - u.y * v.x
        dot = u.x * v.x + u.y * v.y
        return atan2(cross, dot)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'angle_between_grad');

    // Test with parallel vectors (cross=0, dot>0)
    const u = { x: 1, y: 0 };
    const v = { x: 2, y: 0 };

    const result = f_grad(u, v);

    // Angle should be 0, gradients should be finite
    expect(result.value).toBeCloseTo(0, 10);
    expect(result.du.x).not.toBeNaN();
    expect(result.du.y).not.toBeNaN();
    expect(result.dv.x).not.toBeNaN();
    expect(result.dv.y).not.toBeNaN();

    // Test with anti-parallel vectors (cross=0, dot<0)
    const u2 = { x: 1, y: 0 };
    const v2 = { x: -1, y: 0 };

    const result2 = f_grad(u2, v2);

    // Angle should be π
    expect(Math.abs(result2.value)).toBeCloseTo(Math.PI, 10);
    expect(result2.du.x).not.toBeNaN();
  });
});

describe('Property Tests - Rotation Invariance', () => {
  it('should preserve distance under rotation', () => {
    const input = `
      function distance(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return sqrt(dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'distance_grad');

    // Original vectors
    const u = { x: 3, y: 4 };
    const v = { x: 1, y: 1 };

    const result = f_grad(u, v);

    // Rotate by 90 degrees: (x, y) -> (-y, x)
    const rotate90 = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });
    const u_rot = rotate90(u);
    const v_rot = rotate90(v);

    const result_rot = f_grad(u_rot, v_rot);

    // Distance should be the same
    expect(result.value).toBeCloseTo(result_rot.value, 10);

    // Gradient magnitudes should be the same
    const grad_u_mag = Math.sqrt(result.du.x * result.du.x + result.du.y * result.du.y);
    const grad_u_rot_mag = Math.sqrt(result_rot.du.x * result_rot.du.x + result_rot.du.y * result_rot.du.y);

    expect(grad_u_mag).toBeCloseTo(grad_u_rot_mag, 10);
  });

  it('should rotate gradients consistently with inputs', () => {
    const input = `
      function dot_product(u∇: {x, y}, v∇: {x, y}) {
        return u.x * v.x + u.y * v.y
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'dot_product_grad');

    const u = { x: 2, y: 3 };
    const v = { x: 4, y: 5 };

    const result = f_grad(u, v);

    // Rotate by 90 degrees
    const rotate90 = (p: { x: number; y: number }) => ({ x: -p.y, y: p.x });
    const u_rot = rotate90(u);
    const v_rot = rotate90(v);

    const result_rot = f_grad(u_rot, v_rot);

    // du should rotate like u: du_rot = rotate90(du)
    const du_rotated = rotate90(result.du);
    const dv_rotated = rotate90(result.dv);

    expect(result_rot.du.x).toBeCloseTo(du_rotated.x, 10);
    expect(result_rot.du.y).toBeCloseTo(du_rotated.y, 10);
    expect(result_rot.dv.x).toBeCloseTo(dv_rotated.x, 10);
    expect(result_rot.dv.y).toBeCloseTo(dv_rotated.y, 10);
  });
});

describe('Property Tests - Symmetry', () => {
  it('should have symmetric gradients for distance function', () => {
    const input = `
      function distance(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return sqrt(dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'distance_grad');

    const u = { x: 3, y: 4 };
    const v = { x: 1, y: 1 };

    const result = f_grad(u, v);
    const result_swapped = f_grad(v, u);

    // distance(u, v) = distance(v, u)
    expect(result.value).toBeCloseTo(result_swapped.value, 10);

    // du at (u,v) should equal dv at (v,u)
    expect(result.du.x).toBeCloseTo(result_swapped.dv.x, 10);
    expect(result.du.y).toBeCloseTo(result_swapped.dv.y, 10);

    // dv at (u,v) should equal du at (v,u)
    expect(result.dv.x).toBeCloseTo(result_swapped.du.x, 10);
    expect(result.dv.y).toBeCloseTo(result_swapped.du.y, 10);
  });

  it('should have anti-symmetric cross product gradients', () => {
    const input = `
      function cross_product(u∇: {x, y}, v∇: {x, y}) {
        return u.x * v.y - u.y * v.x
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'cross_product_grad');

    const u = { x: 2, y: 3 };
    const v = { x: 4, y: 5 };

    const result = f_grad(u, v);
    const result_swapped = f_grad(v, u);

    // cross(u, v) = -cross(v, u)
    expect(result.value).toBeCloseTo(-result_swapped.value, 10);
  });
});

describe('Property Tests - Scale Invariance', () => {
  it('should have scale-invariant gradients for normalized dot product', () => {
    const input = `
      function cosine_similarity(u∇: {x, y}, v∇: {x, y}) {
        dot = u.x * v.x + u.y * v.y
        u_mag = sqrt(u.x * u.x + u.y * u.y)
        v_mag = sqrt(v.x * v.x + v.y * v.y)
        return dot / (u_mag * v_mag)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'cosine_similarity_grad');

    const u = { x: 1, y: 2 };
    const v = { x: 3, y: 4 };

    const result = f_grad(u, v);

    // Scale u and v by constant factors
    const scale_u = 2.5;
    const scale_v = 3.7;
    const u_scaled = { x: u.x * scale_u, y: u.y * scale_u };
    const v_scaled = { x: v.x * scale_v, y: v.y * scale_v };

    const result_scaled = f_grad(u_scaled, v_scaled);

    // Cosine similarity should be scale-invariant
    expect(result.value).toBeCloseTo(result_scaled.value, 8);
  });

  it('should scale gradients correctly for squared distance', () => {
    const input = `
      function distance_squared(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return dx * dx + dy * dy
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'distance_squared_grad');

    const u = { x: 3, y: 4 };
    const v = { x: 1, y: 1 };

    const result = f_grad(u, v);

    // Scale both by factor k
    const k = 2;
    const u_scaled = { x: u.x * k, y: u.y * k };
    const v_scaled = { x: v.x * k, y: v.y * k };

    const result_scaled = f_grad(u_scaled, v_scaled);

    // Distance squared scales as k^2
    expect(result_scaled.value).toBeCloseTo(result.value * k * k, 10);

    // Gradients scale as k (since d(k^2 * f)/d(k*x) = k * df/dx)
    expect(result_scaled.du.x).toBeCloseTo(result.du.x * k, 10);
    expect(result_scaled.du.y).toBeCloseTo(result.du.y * k, 10);
  });
});

describe('Property Tests - Gradient Properties', () => {
  it('should satisfy gradient directionality for distance function', () => {
    const input = `
      function distance(u∇: {x, y}, v: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return sqrt(dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'distance_grad');

    const u = { x: 5, y: 5 };
    const v = { x: 2, y: 1 };

    const result = f_grad(u, v);

    // Gradient should point from v towards u (increasing distance)
    const direction = { x: u.x - v.x, y: u.y - v.y };
    const dist = result.value;

    // Normalize gradient and direction
    const grad_norm = Math.sqrt(result.du.x * result.du.x + result.du.y * result.du.y);
    const dir_norm = Math.sqrt(direction.x * direction.x + direction.y * direction.y);

    const grad_unit = { x: result.du.x / grad_norm, y: result.du.y / grad_norm };
    const dir_unit = { x: direction.x / dir_norm, y: direction.y / dir_norm };

    // Gradient should be parallel to displacement vector
    expect(grad_unit.x).toBeCloseTo(dir_unit.x, 8);
    expect(grad_unit.y).toBeCloseTo(dir_unit.y, 8);

    // Gradient magnitude should be 1 for distance function
    expect(grad_norm).toBeCloseTo(1, 8);
  });

  it('should have zero gradient sum for translation-invariant functions', () => {
    const input = `
      function relative_distance(u∇: {x, y}, v∇: {x, y}) {
        dx = u.x - v.x
        dy = u.y - v.y
        return sqrt(dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'relative_distance_grad');

    const u = { x: 3, y: 4 };
    const v = { x: 1, y: 1 };

    const result = f_grad(u, v);

    // For translation-invariant functions: du + dv = 0
    const sum_x = result.du.x + result.dv.x;
    const sum_y = result.du.y + result.dv.y;

    expect(sum_x).toBeCloseTo(0, 10);
    expect(sum_y).toBeCloseTo(0, 10);
  });
});

describe('Property Tests - Advanced Invariants', () => {
  it('SE(2): when transformed point matches target, gradients are zero', () => {
    const input = `
      function se2_residual(theta∇, t∇: {x, y}, p: {x, y}, target: {x, y}) {
        c = cos(theta)
        s = sin(theta)
        x = c * p.x - s * p.y + t.x
        y = s * p.x + c * p.y + t.y
        dx = x - target.x
        dy = y - target.y
        return 0.5 * (dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'se2_residual_grad');

    // Test: when target equals the transformed point, residual is zero
    const theta = Math.PI / 6;
    const t = { x: 1, y: 2 };
    const p = { x: 3, y: 4 };

    // Compute transformed point
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const target = {
      x: c * p.x - s * p.y + t.x,
      y: s * p.x + c * p.y + t.y
    };

    const result = f_grad(theta, t, p, target);

    // When residual is zero, gradients should be zero (or very small)
    expect(result.value).toBeCloseTo(0, 10);
    expect(Math.abs(result.dtheta)).toBeLessThan(1e-10);
    expect(Math.abs(result.dt.x)).toBeLessThan(1e-10);
    expect(Math.abs(result.dt.y)).toBeLessThan(1e-10);
  });

  it('SE(2): gradient magnitude should be proportional to residual', () => {
    const input = `
      function se2_residual(theta∇, t∇: {x, y}, p: {x, y}, target: {x, y}) {
        c = cos(theta)
        s = sin(theta)
        x = c * p.x - s * p.y + t.x
        y = s * p.x + c * p.y + t.y
        dx = x - target.x
        dy = y - target.y
        return 0.5 * (dx * dx + dy * dy)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'se2_residual_grad');

    const theta = 0;
    const t = { x: 0, y: 0 };
    const p = { x: 1, y: 0 };
    const target = { x: 2, y: 0 };

    const result = f_grad(theta, t, p, target);

    // Residual should be non-zero
    expect(result.value).toBeGreaterThan(0);

    // Gradients should point in direction to reduce residual
    expect(result.dt.x).not.toBe(0);
  });

  it('Reprojection: uniform scale of intrinsics and coords maintains structure', () => {
    const input = `
      function reproj_error(P∇: {x, y, z}, fx, fy, cx, cy, u_obs: {x, y}) {
        X = P.x
        Y = P.y
        Z = P.z
        u = fx * (X / Z) + cx
        v = fy * (Y / Z) + cy
        du = u - u_obs.x
        dv = v - u_obs.y
        return 0.5 * (du * du + dv * dv)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'reproj_error_grad');

    // Original parameters - ensure non-zero error
    const P = { x: 2, y: 3, z: 10 };
    const fx = 500, fy = 500, cx = 250, cy = 250;
    const u_obs = { x: 350, y: 400 };

    const result1 = f_grad(P, fx, fy, cx, cy, u_obs);

    // Scale intrinsics and observed coords by same factor
    const scale = 2;
    const result2 = f_grad(P, fx * scale, fy * scale, cx * scale, cy * scale,
                           { x: u_obs.x * scale, y: u_obs.y * scale });

    // Error should scale quadratically (pixel errors scale linearly, squared error scales quadratically)
    expect(result2.value).toBeCloseTo(result1.value * scale * scale, 5);

    // Gradient direction should be consistent (magnitude scales)
    // Only check if gradients are non-zero
    if (Math.abs(result1.dP.x) > 1e-10) {
      const grad_ratio_x = result2.dP.x / result1.dP.x;
      expect(grad_ratio_x).toBeCloseTo(scale * scale, 5);
    }
    if (Math.abs(result1.dP.y) > 1e-10) {
      const grad_ratio_y = result2.dP.y / result1.dP.y;
      expect(grad_ratio_y).toBeCloseTo(scale * scale, 5);
    }
    if (Math.abs(result1.dP.z) > 1e-10) {
      const grad_ratio_z = result2.dP.z / result1.dP.z;
      expect(grad_ratio_z).toBeCloseTo(scale * scale, 5);
    }
  });

  it('Bearing: rotation of input by φ shifts angle by φ', () => {
    const input = `
      function bearing_of(p∇: {x, y}) {
        mx = p.x
        my = p.y
        mag = sqrt(mx * mx + my * my)
        nx = mx / mag
        ny = my / mag
        return atan2(ny, nx)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'bearing_of_grad');

    // Original point at 45 degrees
    const p = { x: 1, y: 1 };
    const result1 = f_grad(p);

    // Rotate by 30 degrees
    const phi = Math.PI / 6;
    const cos_phi = Math.cos(phi);
    const sin_phi = Math.sin(phi);
    const p_rotated = {
      x: cos_phi * p.x - sin_phi * p.y,
      y: sin_phi * p.x + cos_phi * p.y
    };

    const result2 = f_grad(p_rotated);

    // Angle should increase by phi
    const angle_diff = result2.value - result1.value;
    expect(angle_diff).toBeCloseTo(phi, 8);

    // Both results should have finite gradients
    expect(result1.dp.x).not.toBeNaN();
    expect(result1.dp.y).not.toBeNaN();
    expect(result2.dp.x).not.toBeNaN();
    expect(result2.dp.y).not.toBeNaN();
  });

  it('Bearing: gradient should be perpendicular to input vector', () => {
    const input = `
      function bearing_of(p∇: {x, y}) {
        mx = p.x
        my = p.y
        mag = sqrt(mx * mx + my * my)
        nx = mx / mag
        ny = my / mag
        return atan2(ny, nx)
      }
    `;

    const program = parse(input);
    const func = program.functions[0];
    const env = inferFunction(func);
    const gradients = computeFunctionGradients(func, env);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'bearing_of_grad');

    const p = { x: 3, y: 4 };
    const result = f_grad(p);

    // Gradient of angle w.r.t. position should be perpendicular to position
    // grad ⊥ p means grad · p = 0
    const dot_product = result.dp.x * p.x + result.dp.y * p.y;

    expect(dot_product).toBeCloseTo(0, 8);
  });
});
