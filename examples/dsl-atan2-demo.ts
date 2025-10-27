/**
 * Demo: Generate gradients for angle_between function using new DSL
 */

import { parse } from '../dist/dsl/Parser.js';
import { inferFunction } from '../dist/dsl/TypeInference.js';
import { computeFunctionGradients } from '../dist/dsl/Differentiation.js';
import { generateComplete } from '../dist/dsl/CodeGen.js';

console.log('=' .repeat(80));
console.log('GradientScript DSL Demo: angle_between Function');
console.log('='.repeat(80));
console.log();

const input = `
function angle_between(u∇: {x, y}, v∇: {x, y}) {
  cross = cross2d(u, v)
  dot = dot2d(u, v)
  return atan2(cross, dot)
}
`;

console.log('Input DSL Code:');
console.log(input);
console.log('='.repeat(80));
console.log();

// Parse
const program = parse(input);
const func = program.functions[0];

// Infer types
const env = inferFunction(func);

// Compute gradients
const gradients = computeFunctionGradients(func, env);

// Generate TypeScript code
const tsCode = generateComplete(func, gradients, env, {
  format: 'typescript',
  includeComments: true
});

console.log('Generated TypeScript:');
console.log('='.repeat(80));
console.log(tsCode);
console.log('='.repeat(80));
console.log();

// Generate Python code
const pyCode = generateComplete(func, gradients, env, {
  format: 'python',
  includeComments: true
});

console.log('Generated Python:');
console.log('='.repeat(80));
console.log(pyCode);
console.log('='.repeat(80));
console.log();

console.log('Gradient Parameters:');
for (const [paramName, grad] of gradients.gradients.entries()) {
  if ('components' in grad) {
    console.log(`  ${paramName}: {${Array.from(grad.components.keys()).join(', ')}}`);
  } else {
    console.log(`  ${paramName}: scalar`);
  }
}
