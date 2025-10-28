import { describe, it, expect } from 'vitest';
import { parseAndCompile } from '../helpers.js';
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

function numericalGradient(f: (x: number) => number, x: number, h = 1e-7): number {
  return (f(x + h) - f(x - h)) / (2 * h);
}

function numericalGradient2D(
  f: (p: { x: number; y: number }) => number,
  p: { x: number; y: number },
  h = 1e-7
): { x: number; y: number } {
  return {
    x: (f({ x: p.x + h, y: p.y }) - f({ x: p.x - h, y: p.y })) / (2 * h),
    y: (f({ x: p.x, y: p.y + h }) - f({ x: p.x, y: p.y - h })) / (2 * h),
  };
}

describe('Real-World Examples - Geometry', () => {
  it('should compute gradients for signed distance to line', () => {
    const input = `
      function signed_distance_point_line(p∇: {x, y}, a: {x, y}, b: {x, y}) {
        apx = p.x - a.x
        apy = p.y - a.y
        abx = b.x - a.x
        aby = b.y - a.y
        num = apx * aby - apy * abx
        den = sqrt(abx * abx + aby * aby)
        return num / den
      }
    `;

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'signed_distance_point_line_grad');

    // Test point above line from (0,0) to (1,0)
    const p = { x: 0.5, y: 1 };
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };

    const result = f_grad(p, a, b);

    // Signed distance should be -1 (point is on negative side of line a→b)
    // The cross product apx*aby - apy*abx gives a negative value
    expect(Math.abs(result.value)).toBeCloseTo(1, 10);

    // Gradient should point perpendicular to line
    expect(result.dp.x).not.toBeNaN();
    expect(result.dp.y).not.toBeNaN();

    // Verify with numerical gradient
    const f_numerical = (p_test: { x: number; y: number }) => {
      const apx = p_test.x - a.x;
      const apy = p_test.y - a.y;
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const num = apx * aby - apy * abx;
      const den = Math.sqrt(abx * abx + aby * aby);
      return num / den;
    };

    const numerical_grad = numericalGradient2D(f_numerical, p);
    expect(result.dp.x).toBeCloseTo(numerical_grad.x, 5);
    expect(result.dp.y).toBeCloseTo(numerical_grad.y, 5);
  });

  it('should compute gradients for triangle area', () => {
    const input = `
      function triangle_area(a∇: {x, y}, b∇: {x, y}, c∇: {x, y}) {
        abx = b.x - a.x
        aby = b.y - a.y
        acx = c.x - a.x
        acy = c.y - a.y
        return 0.5 * (abx * acy - aby * acx)
      }
    `;

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'triangle_area_grad');

    // Right triangle at origin
    const a = { x: 0, y: 0 };
    const b = { x: 2, y: 0 };
    const c = { x: 0, y: 3 };

    const result = f_grad(a, b, c);

    // Area should be 3 (0.5 * 2 * 3)
    expect(result.value).toBeCloseTo(3, 10);

    // All gradients should be finite
    expect(result.da.x).not.toBeNaN();
    expect(result.da.y).not.toBeNaN();
    expect(result.db.x).not.toBeNaN();
    expect(result.db.y).not.toBeNaN();
    expect(result.dc.x).not.toBeNaN();
    expect(result.dc.y).not.toBeNaN();

    // Verify gradient for vertex a with numerical differentiation
    const f_numerical_a = (a_test: { x: number; y: number }) => {
      const abx = b.x - a_test.x;
      const aby = b.y - a_test.y;
      const acx = c.x - a_test.x;
      const acy = c.y - a_test.y;
      return 0.5 * (abx * acy - aby * acx);
    };

    const numerical_grad_a = numericalGradient2D(f_numerical_a, a);
    expect(result.da.x).toBeCloseTo(numerical_grad_a.x, 5);
    expect(result.da.y).toBeCloseTo(numerical_grad_a.y, 5);
  });

  it('should compute gradients for circle fitting energy', () => {
    const input = `
      function circle_fit_energy(c∇: {x, y}, R∇, p: {x, y}) {
        dx = p.x - c.x
        dy = p.y - c.y
        d = sqrt(dx * dx + dy * dy)
        e = d - R
        return 0.5 * e * e
      }
    `;

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'circle_fit_energy_grad');

    // Circle at (1, 1), radius 2, point at (4, 5)
    const c = { x: 1, y: 1 };
    const R = 2;
    const p = { x: 4, y: 5 };

    const result = f_grad(c, R, p);

    // Distance from c to p is 5, error is 3, energy is 4.5
    const dist = Math.sqrt(9 + 16); // 5
    const error = dist - R; // 3
    const expected_energy = 0.5 * error * error; // 4.5

    expect(result.value).toBeCloseTo(expected_energy, 10);

    // Gradients should be finite
    expect(result.dc.x).not.toBeNaN();
    expect(result.dc.y).not.toBeNaN();
    expect(result.dR).not.toBeNaN();

    // Verify dc with numerical gradient
    const f_numerical_c = (c_test: { x: number; y: number }) => {
      const dx = p.x - c_test.x;
      const dy = p.y - c_test.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const e = d - R;
      return 0.5 * e * e;
    };

    const numerical_grad_c = numericalGradient2D(f_numerical_c, c);
    expect(result.dc.x).toBeCloseTo(numerical_grad_c.x, 5);
    expect(result.dc.y).toBeCloseTo(numerical_grad_c.y, 5);
  });
});

describe('Real-World Examples - Robotics & Vision', () => {
  it('should compute gradients for SE(2) residual', () => {
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

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'se2_residual_grad');

    // Transform point (1, 0) with rotation pi/4 and translation (0.5, 0.5)
    const theta = Math.PI / 4;
    const t = { x: 0.5, y: 0.5 };
    const p = { x: 1, y: 0 };
    const target = { x: 1, y: 1 };

    const result = f_grad(theta, t, p, target);

    // Transformed point should be approximately (sqrt(2)/2 + 0.5, sqrt(2)/2 + 0.5)
    // Check result is finite
    expect(result.value).not.toBeNaN();
    expect(result.value).toBeGreaterThanOrEqual(0);

    // Gradients should be finite
    expect(result.dtheta).not.toBeNaN();
    expect(result.dt.x).not.toBeNaN();
    expect(result.dt.y).not.toBeNaN();

    // Verify dtheta with numerical gradient
    const f_numerical_theta = (theta_test: number) => {
      const c = Math.cos(theta_test);
      const s = Math.sin(theta_test);
      const x = c * p.x - s * p.y + t.x;
      const y = s * p.x + c * p.y + t.y;
      const dx = x - target.x;
      const dy = y - target.y;
      return 0.5 * (dx * dx + dy * dy);
    };

    const numerical_grad_theta = numericalGradient(f_numerical_theta, theta);
    expect(result.dtheta).toBeCloseTo(numerical_grad_theta, 5);
  });

  it('should compute gradients for pinhole reprojection error', () => {
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

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'reproj_error_grad');

    // 3D point at (2, 3, 10), camera at (500, 500, 250, 250), observed at (350, 400)
    const P = { x: 2, y: 3, z: 10 };
    const fx = 500;
    const fy = 500;
    const cx = 250;
    const cy = 250;
    const u_obs = { x: 350, y: 400 };

    const result = f_grad(P, fx, fy, cx, cy, u_obs);

    // Check result is finite
    expect(result.value).not.toBeNaN();
    expect(result.value).toBeGreaterThanOrEqual(0);

    // Gradients should be finite (3D vector)
    expect(result.dP.x).not.toBeNaN();
    expect(result.dP.y).not.toBeNaN();
    expect(result.dP.z).not.toBeNaN();

    // Verify gradient with numerical differentiation
    const f_numerical = (P_test: { x: number; y: number; z: number }) => {
      const u = fx * (P_test.x / P_test.z) + cx;
      const v = fy * (P_test.y / P_test.z) + cy;
      const du = u - u_obs.x;
      const dv = v - u_obs.y;
      return 0.5 * (du * du + dv * dv);
    };

    const h = 1e-7;
    const numerical_grad = {
      x: (f_numerical({ x: P.x + h, y: P.y, z: P.z }) - f_numerical({ x: P.x - h, y: P.y, z: P.z })) / (2 * h),
      y: (f_numerical({ x: P.x, y: P.y + h, z: P.z }) - f_numerical({ x: P.x, y: P.y - h, z: P.z })) / (2 * h),
      z: (f_numerical({ x: P.x, y: P.y, z: P.z + h }) - f_numerical({ x: P.x, y: P.y, z: P.z - h })) / (2 * h),
    };

    expect(result.dP.x).toBeCloseTo(numerical_grad.x, 5);
    expect(result.dP.y).toBeCloseTo(numerical_grad.y, 5);
    expect(result.dP.z).toBeCloseTo(numerical_grad.z, 5);
  });

  it('should compute gradients for bearing angle', () => {
    // Simplified version - atan2(y, x) directly instead of normalizing first
    // The bearing angle is the same either way, but simpler for differentiation
    const input = `
      function bearing_of(p∇: {x, y}) {
        return atan2(p.y, p.x)
      }
    `;

    const { func, env, gradients } = parseAndCompile(input);
    const code = generateGradientFunction(func, gradients, env, { simplify: true });

    const f_grad = evalGeneratedCode(code, 'bearing_of_grad');

    // Point at 45 degrees
    const p = { x: 1, y: 1 };

    const result = f_grad(p);

    // Bearing should be pi/4
    expect(result.value).toBeCloseTo(Math.PI / 4, 10);

    // Gradients should be finite
    expect(result.dp.x).not.toBeNaN();
    expect(result.dp.y).not.toBeNaN();

    // Verify with numerical gradient
    const f_numerical = (p_test: { x: number; y: number }) => {
      return Math.atan2(p_test.y, p_test.x);
    };

    const numerical_grad = numericalGradient2D(f_numerical, p);
    expect(result.dp.x).toBeCloseTo(numerical_grad.x, 5);
    expect(result.dp.y).toBeCloseTo(numerical_grad.y, 5);

    // Also verify analytical gradient: d/dx = -y/(x²+y²), d/dy = x/(x²+y²)
    const mag_sq = p.x * p.x + p.y * p.y;
    expect(result.dp.x).toBeCloseTo(-p.y / mag_sq, 10);
    expect(result.dp.y).toBeCloseTo(p.x / mag_sq, 10);
  });
});
