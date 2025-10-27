/**
 * Debug the opposite vectors case
 */

import { parse } from '../dist/dsl/Parser.js';
import { inferFunction } from '../dist/dsl/TypeInference.js';
import { computeFunctionGradients } from '../dist/dsl/Differentiation.js';
import { simplify } from '../dist/dsl/Simplify.js';
import { ExpressionCodeGen } from '../dist/dsl/CodeGen.js';

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

// Get u.y gradient
const gradU = gradients.gradients.get('u') as any;
const gradUy = gradU.components.get('y');

console.log('Raw gradient for u.y:');
console.log(JSON.stringify(gradUy, null, 2));

const simplified = simplify(gradUy);
console.log('\nSimplified:');
console.log(JSON.stringify(simplified, null, 2));

const codegen = new ExpressionCodeGen('typescript');
console.log('\nCode:');
console.log(codegen.generate(simplified));

console.log('\n\nEvaluating at u=(1,0), v=(-1,0):');
const u = { x: 1, y: 0 };
const v = { x: -1, y: 0 };

const cross = u.x * v.y - u.y * v.x; // = 0
const dot = u.x * v.x + u.y * v.y;   // = -1

console.log(`cross = ${cross}`);
console.log(`dot = ${dot}`);

// The gradient formula for atan2(y, x) w.r.t. its first argument is:
// d/dy atan2(y, x) = x / (x^2 + y^2)

// For atan2(cross, dot) w.r.t. u.y:
// We need d(atan2(cross, dot))/d(u.y)
// = (d atan2 / d cross) * (d cross / d u.y) + (d atan2 / d dot) * (d dot / d u.y)
// = (dot / (dot^2 + cross^2)) * (-v.x) + (-cross / (dot^2 + cross^2)) * (v.y)

const denom = dot * dot + cross * cross; // = 1 + 0 = 1
const term1 = (dot / denom) * (-v.x);     // = (-1 / 1) * (1) = -1
const term2 = (-cross / denom) * (v.y);   // = (0 / 1) * 0 = 0

console.log(`\nManual calculation:`);
console.log(`denom = ${denom}`);
console.log(`term1 (dot * -v.x / denom) = ${term1}`);
console.log(`term2 (-cross * v.y / denom) = ${term2}`);
console.log(`total = ${term1 + term2}`);

console.log('\nNumerical gradient:');
const h = 1e-5;
const angle_plus = Math.atan2(u.x * v.y - (u.y + h) * v.x, u.x * v.x + (u.y + h) * v.y);
const angle_minus = Math.atan2(u.x * v.y - (u.y - h) * v.x, u.x * v.x + (u.y - h) * v.y);
const numerical = (angle_plus - angle_minus) / (2 * h);

console.log(`angle(u.y + h) = ${angle_plus}`);
console.log(`angle(u.y - h) = ${angle_minus}`);
console.log(`numerical gradient = ${numerical}`);

console.log('\n\nAHA! The issue:');
console.log('When vectors are opposite (180°), atan2 returns π.');
console.log('Small changes in y-component cause wrapping: π → -π');
console.log('This creates a discontinuity that breaks numerical differentiation.');
console.log('The analytical gradient IS correct (-1), but numerical fails at singularity.');
