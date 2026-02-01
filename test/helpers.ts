/**
 * Test helper utilities to reduce boilerplate in test files
 * Consolidates common test patterns for gradient checking
 */

import { parse } from '../src/dsl/Parser.js';
import { inferFunction } from '../src/dsl/TypeInference.js';
import { computeFunctionGradients, GradientResult } from '../src/dsl/Differentiation.js';
import { GradientChecker, GradCheckResult } from '../src/dsl/GradientChecker.js';
import { FunctionDef } from '../src/dsl/AST.js';
import { TypeEnv } from '../src/dsl/Types.js';

/**
 * Result of parsing and compiling a GradientScript function
 */
export interface CompilationResult {
  func: FunctionDef;
  env: TypeEnv;
  gradients: GradientResult;
}

/**
 * Parse and compile a GradientScript source string
 *
 * @param source - GradientScript source code
 * @returns Parsed function, type environment, and computed gradients
 *
 * @example
 * const { func, env, gradients } = parseAndCompile(`
 *   function square(x∇) {
 *     return x * x
 *   }
 * `);
 */
export function parseAndCompile(source: string): CompilationResult {
  const program = parse(source);
  const func = program.functions[0];
  const env = inferFunction(func);
  const gradients = computeFunctionGradients(func, env);

  return { func, env, gradients };
}

/**
 * Check gradients against numerical differentiation at a test point
 *
 * @param source - GradientScript source code
 * @param testPoint - Point at which to evaluate gradients
 * @returns Gradient check result with pass/fail and error metrics
 *
 * @example
 * const result = checkGradient(`
 *   function distance(u∇: {x, y}, v∇: {x, y}) {
 *     dx = u.x - v.x
 *     dy = u.y - v.y
 *     return sqrt(dx * dx + dy * dy)
 *   }
 * `, new Map([
 *   ['u', { x: 1.0, y: 2.0 }],
 *   ['v', { x: 3.0, y: 4.0 }]
 * ]));
 *
 * expect(result.passed).toBe(true);
 * expect(result.maxError).toBeLessThan(1e-4);
 */
export function checkGradient(
  source: string,
  testPoint: Map<string, any>
): GradCheckResult {
  const { func, env, gradients } = parseAndCompile(source);
  const checker = new GradientChecker();
  return checker.check(func, gradients, env, testPoint);
}

/**
 * Check gradients for a scalar function (single number parameter)
 *
 * @param source - GradientScript source code
 * @param x - Test point value
 * @returns Gradient check result
 *
 * @example
 * const result = checkScalarGradient(`
 *   function square(x∇) {
 *     return x * x
 *   }
 * `, 3.0);
 *
 * expect(result.passed).toBe(true);
 */
export function checkScalarGradient(
  source: string,
  x: number
): GradCheckResult {
  return checkGradient(source, new Map([['x', x]]));
}

/**
 * Check gradients for a 2D vector function
 *
 * @param source - GradientScript source code
 * @param params - Map of parameter names to 2D vectors {x, y}
 * @returns Gradient check result
 *
 * @example
 * const result = checkVec2Gradient(`
 *   function dot(u∇: {x, y}, v∇: {x, y}) {
 *     return u.x * v.x + u.y * v.y
 *   }
 * `, {
 *   u: { x: 1, y: 2 },
 *   v: { x: 3, y: 4 }
 * });
 *
 * expect(result.passed).toBe(true);
 */
export function checkVec2Gradient(
  source: string,
  params: Record<string, { x: number; y: number }>
): GradCheckResult {
  const testPoint = new Map(Object.entries(params));
  return checkGradient(source, testPoint);
}

/**
 * Check gradients for a 3D vector function
 *
 * @param source - GradientScript source code
 * @param params - Map of parameter names to 3D vectors {x, y, z}
 * @returns Gradient check result
 *
 * @example
 * const result = checkVec3Gradient(`
 *   function dot3d(u∇: {x, y, z}, v∇: {x, y, z}) {
 *     return u.x * v.x + u.y * v.y + u.z * v.z
 *   }
 * `, {
 *   u: { x: 1, y: 2, z: 3 },
 *   v: { x: 4, y: 5, z: 6 }
 * });
 *
 * expect(result.passed).toBe(true);
 */
export function checkVec3Gradient(
  source: string,
  params: Record<string, { x: number; y: number; z: number }>
): GradCheckResult {
  const testPoint = new Map(Object.entries(params));
  return checkGradient(source, testPoint);
}

/**
 * Check gradients at multiple test points for better coverage
 *
 * @param source - GradientScript source code
 * @param testPointsGenerator - Function that generates test points
 * @param numPoints - Number of test points to check
 * @returns Array of gradient check results
 */
export function checkGradientMultiplePoints(
  source: string,
  testPointsGenerator: () => Map<string, any>,
  numPoints: number = 5
): GradCheckResult[] {
  const { func, env, gradients } = parseAndCompile(source);
  const checker = new GradientChecker();
  const results: GradCheckResult[] = [];

  for (let i = 0; i < numPoints; i++) {
    const testPoint = testPointsGenerator();
    results.push(checker.check(func, gradients, env, testPoint));
  }

  return results;
}
