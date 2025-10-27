/**
 * Complete example: θ = atan2(u×v, u·v) gradient computation
 */

import { parse, computeGradients, simplify, generateGradientCode, generateCode } from '../src/index';

console.log('=== Gradient of θ = atan2(u×v, u·v) ===\n');

// Inline version (required due to current intermediate variable limitation)
const input = `
  output = atan2(ux * vy - uy * vx, ux * vx + uy * vy)
`;

const program = parse(input);
const gradients = computeGradients(program, ['ux', 'uy', 'vx', 'vy']);

// Show individual gradients
console.log('Individual gradients:\n');

for (const param of ['ux', 'uy', 'vx', 'vy']) {
  const grad = simplify(gradients.get(param)!);
  const code = generateCode(grad);
  console.log(`∂θ/∂${param}:`);
  console.log(`  ${code}\n`);
}

// Generate complete code
console.log('=== Complete Gradient Function ===\n');

const simplified = new Map();
for (const [param, expr] of gradients.entries()) {
  simplified.set(param, simplify(expr));
}

const code = generateGradientCode(program, simplified);
console.log(code);

console.log('\n=== Mathematical Interpretation ===\n');
console.log('For 2D vectors u = (ux, uy) and v = (vx, vy):');
console.log('  • Cross product (scalar): u×v = ux*vy - uy*vx');
console.log('  • Dot product: u·v = ux*vx + uy*vy');
console.log('  • Angle: θ = atan2(u×v, u·v)');
console.log('');
console.log('The gradients tell us how θ changes as we modify each component:');
console.log('  • ∂θ/∂ux: Rate of change when moving u in x-direction');
console.log('  • ∂θ/∂uy: Rate of change when moving u in y-direction');
console.log('  • ∂θ/∂vx: Rate of change when moving v in x-direction');
console.log('  • ∂θ/∂vy: Rate of change when moving v in y-direction');
console.log('');
console.log('Applications:');
console.log('  • Robotics: Optimize joint angles for desired orientation');
console.log('  • Computer Vision: Align image features');
console.log('  • Physics: Angular momentum and rotation optimization');
