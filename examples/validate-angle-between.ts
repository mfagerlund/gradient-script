/**
 * Comprehensive validation of angle_between gradients
 * Shows analytical vs numerical gradients with detailed comparison
 */

import { parse } from '../dist/dsl/Parser.js';
import { inferFunction } from '../dist/dsl/TypeInference.js';
import { computeFunctionGradients } from '../dist/dsl/Differentiation.js';
import { GradientChecker } from '../dist/dsl/GradientChecker.js';
import { simplify } from '../dist/dsl/Simplify.js';
import { ExpressionCodeGen } from '../dist/dsl/CodeGen.js';
import { analyzeDiscontinuities, formatDiscontinuityWarnings } from '../dist/dsl/DiscontinuityAnalyzer.js';

console.log('='.repeat(80));
console.log('GRADIENT VALIDATION: angle_between(u, v) = atan2(cross2d(u,v), dot2d(u,v))');
console.log('='.repeat(80));
console.log();

const input = `
function angle_between(u∇: {x, y}, v∇: {x, y}) {
  cross = cross2d(u, v)
  dot = dot2d(u, v)
  return atan2(cross, dot)
}
`;

console.log('Function Definition:');
console.log(input);
console.log('='.repeat(80));
console.log();

// Parse and compute gradients
const program = parse(input);
const func = program.functions[0];
const env = inferFunction(func);
const gradients = computeFunctionGradients(func, env);

// Simplify gradients
const simplifiedGradients = new Map();
for (const [param, grad] of gradients.gradients.entries()) {
  if ('components' in grad) {
    const simplifiedComps = new Map();
    for (const [comp, expr] of grad.components.entries()) {
      simplifiedComps.set(comp, simplify(expr));
    }
    simplifiedGradients.set(param, { components: simplifiedComps });
  } else {
    simplifiedGradients.set(param, simplify(grad));
  }
}

// Display symbolic gradients
console.log('SYMBOLIC GRADIENTS (Simplified):');
console.log('='.repeat(80));

const codegen = new ExpressionCodeGen('typescript');

for (const [param, grad] of simplifiedGradients.entries()) {
  if ('components' in grad) {
    console.log(`\ngrad_${param}:`);
    for (const [comp, expr] of grad.components.entries()) {
      const code = codegen.generate(expr);
      console.log(`  ${comp}: ${code}`);
    }
  } else {
    const code = codegen.generate(grad);
    console.log(`\ngrad_${param}: ${code}`);
  }
}

console.log();
console.log('='.repeat(80));

// Analyze for discontinuities
const discontinuityWarnings = analyzeDiscontinuities(func);
if (discontinuityWarnings.length > 0) {
  console.log(formatDiscontinuityWarnings(discontinuityWarnings));
  console.log();
  console.log('='.repeat(80));
}

console.log('NUMERICAL VALIDATION');
console.log('='.repeat(80));
console.log();

// Test at multiple interesting points
const testPoints = [
  {
    name: 'Perpendicular vectors (90°)',
    point: new Map([
      ['u', { x: 1.0, y: 0.0 }],
      ['v', { x: 0.0, y: 1.0 }]
    ])
  },
  {
    name: 'Parallel vectors (0°)',
    point: new Map([
      ['u', { x: 1.0, y: 0.0 }],
      ['v', { x: 2.0, y: 0.0 }]
    ])
  },
  {
    name: 'Opposite vectors (180°)',
    point: new Map([
      ['u', { x: 1.0, y: 0.0 }],
      ['v', { x: -1.0, y: 0.0 }]
    ])
  },
  {
    name: '45° angle',
    point: new Map([
      ['u', { x: 1.0, y: 0.0 }],
      ['v', { x: 1.0, y: 1.0 }]
    ])
  },
  {
    name: 'Random vectors',
    point: new Map([
      ['u', { x: 2.5, y: 3.2 }],
      ['v', { x: -1.3, y: 0.7 }]
    ])
  },
  {
    name: 'Small vectors',
    point: new Map([
      ['u', { x: 0.1, y: 0.2 }],
      ['v', { x: 0.3, y: 0.4 }]
    ])
  }
];

const checker = new GradientChecker(1e-5, 1e-4);

let allPassed = true;

for (const test of testPoints) {
  console.log(`Test: ${test.name}`);

  const u = test.point.get('u') as { x: number; y: number };
  const v = test.point.get('v') as { x: number; y: number };

  // Compute actual angle
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  const angle = Math.atan2(cross, dot);
  const angleDeg = angle * 180 / Math.PI;

  console.log(`  u = (${u.x.toFixed(2)}, ${u.y.toFixed(2)})`);
  console.log(`  v = (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
  console.log(`  angle = ${angle.toFixed(6)} rad = ${angleDeg.toFixed(2)}°`);
  console.log();

  const result = checker.check(
    func,
    { gradients: simplifiedGradients },
    env,
    test.point
  );

  if (result.passed) {
    console.log(`  ✓ PASSED - All gradients match!`);
    console.log(`  Max error: ${result.maxError.toExponential(2)}`);
  } else {
    console.log(`  ✗ FAILED - Gradient mismatch detected!`);
    allPassed = false;

    for (const error of result.errors) {
      const paramStr = error.component
        ? `${error.parameter}.${error.component}`
        : error.parameter;

      console.log(`\n  Error in ${paramStr}:`);
      console.log(`    Analytical: ${error.analytical.toExponential(6)}`);
      console.log(`    Numerical:  ${error.numerical.toExponential(6)}`);
      console.log(`    Difference: ${error.error.toExponential(6)}`);
      console.log(`    Relative:   ${(error.relativeError * 100).toFixed(4)}%`);
    }
  }

  console.log();
  console.log('-'.repeat(80));
  console.log();
}

console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log();

if (allPassed) {
  console.log('✓ ALL TESTS PASSED!');
  console.log();
  console.log('The symbolic gradients computed by GradientScript match');
  console.log('the numerical gradients (finite differences) within tolerance.');
  console.log();
  console.log('This validates that:');
  console.log('  • The differentiation rules are correct');
  console.log('  • The chain rule is applied properly');
  console.log('  • Built-in function expansions are correct');
  console.log('  • Expression simplification preserves correctness');
} else {
  console.log('✗ SOME TESTS FAILED');
  console.log();
  console.log('There are discrepancies between analytical and numerical gradients.');
}

console.log();
console.log('='.repeat(80));
