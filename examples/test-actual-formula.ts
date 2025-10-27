/**
 * Test if the generated code actually works correctly
 */

import { parse } from '../dist/dsl/Parser.js';
import { inferFunction } from '../dist/dsl/TypeInference.js';
import { computeFunctionGradients } from '../dist/dsl/Differentiation.js';
import { simplify } from '../dist/dsl/Simplify.js';
import { generateComplete } from '../dist/dsl/CodeGen.js';

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

// Generate the code
const code = generateComplete(func, gradients, env, { simplify: true });

console.log('Generated Code:');
console.log('='.repeat(80));
console.log(code);
console.log('='.repeat(80));
console.log();

// Define the helper functions
function dot2d(u: any, v: any) {
  return u.x * v.x + u.y * v.y;
}

function cross2d(u: any, v: any) {
  return u.x * v.y - u.y * v.x;
}

// Test point
const u = { x: 1.0, y: 0.0 };
const v = { x: 0.0, y: 1.0 };

console.log(`Test point: u=(${u.x}, ${u.y}), v=(${v.x}, ${v.y})`);
console.log();

// Execute the generated code by eval (normally you'd compile it)
// Extract just the gradient function
const gradFuncMatch = code.match(/function angle_between_grad\(u, v\) \{[\s\S]*?\n\}/);
if (!gradFuncMatch) {
  console.error('Could not extract gradient function!');
  process.exit(1);
}

let angle_between_grad: any;
try {
  eval(gradFuncMatch[0]);
} catch (e) {
  console.error('Failed to eval generated code:', e);
  process.exit(1);
}

const result = angle_between_grad(u, v);

console.log('Gradient from GENERATED CODE:');
console.log(`grad_u.x = ${result.grad_u.x}`);
console.log(`grad_u.y = ${result.grad_u.y}`);
console.log(`grad_v.x = ${result.grad_v.x}`);
console.log(`grad_v.y = ${result.grad_v.y}`);
console.log();

// Compute correct analytical gradients
const cross = cross2d(u, v);
const dot = dot2d(u, v);
const denom = dot * dot + cross * cross;

const correct_grad_u_x = (dot * v.y - cross * v.x) / denom;
const correct_grad_u_y = (dot * (-v.x) - cross * v.y) / denom;
const correct_grad_v_x = (dot * (-u.y) - cross * u.x) / denom;
const correct_grad_v_y = (dot * u.x - cross * (-u.y)) / denom;

console.log('CORRECT Analytical Gradients:');
console.log(`grad_u.x = ${correct_grad_u_x}`);
console.log(`grad_u.y = ${correct_grad_u_y}`);
console.log(`grad_v.x = ${correct_grad_v_x}`);
console.log(`grad_v.y = ${correct_grad_v_y}`);
console.log();

// Compare
const tol = 1e-10;
const errors = {
  u_x: Math.abs(result.grad_u.x - correct_grad_u_x),
  u_y: Math.abs(result.grad_u.y - correct_grad_u_y),
  v_x: Math.abs(result.grad_v.x - correct_grad_v_x),
  v_y: Math.abs(result.grad_v.y - correct_grad_v_y)
};

console.log('Errors:');
console.log(`grad_u.x error: ${errors.u_x.toExponential(2)}`);
console.log(`grad_u.y error: ${errors.u_y.toExponential(2)}`);
console.log(`grad_v.x error: ${errors.v_x.toExponential(2)}`);
console.log(`grad_v.y error: ${errors.v_y.toExponential(2)}`);
console.log();

const maxError = Math.max(...Object.values(errors));
if (maxError < tol) {
  console.log('✅ GENERATED CODE IS CORRECT!');
  console.log('   The AST and numerical evaluation are correct.');
  console.log('   The display might just need better parenthesization.');
} else {
  console.log('❌ GENERATED CODE IS WRONG!');
  console.log('   We have a bug in the gradient computation or codegen.');
}
