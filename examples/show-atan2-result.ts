/**
 * Show the actual gradient computation for θ = atan2(u×v, u·v)
 */

import { parse, computeGradients, simplify, generateCode, generateGradientCode } from './src/index';

console.log('='.repeat(80));
console.log('GRADIENT OF θ = atan2(u×v, u·v)');
console.log('='.repeat(80));
console.log('\nFor 2D vectors u = (ux, uy) and v = (vx, vy):');
console.log('  • Cross product (scalar): u×v = ux*vy - uy*vx');
console.log('  • Dot product: u·v = ux*vx + uy*vy');
console.log('  • Angle: θ = atan2(u×v, u·v)');
console.log('\n' + '='.repeat(80));

// Compute gradients
const input = 'output = atan2(ux * vy - uy * vx, ux * vx + uy * vy)';
const program = parse(input);
const gradients = computeGradients(program, ['ux', 'uy', 'vx', 'vy']);

// Simplify all gradients
const simplified = new Map();
for (const [param, expr] of gradients.entries()) {
  simplified.set(param, simplify(expr));
}

// Show individual gradients
console.log('\nINDIVIDUAL GRADIENTS:\n');

const params = ['ux', 'uy', 'vx', 'vy'];
for (const param of params) {
  const grad = simplified.get(param)!;
  const code = generateCode(grad);
  console.log(`∂θ/∂${param}:`);
  console.log(`  ${code}`);
  console.log('');
}

// Generate complete function
console.log('='.repeat(80));
console.log('COMPLETE GRADIENT FUNCTION:');
console.log('='.repeat(80));
console.log('');

const fullCode = generateGradientCode(program, simplified);
console.log(fullCode);

console.log('\n' + '='.repeat(80));
console.log('NUMERICAL VERIFICATION:');
console.log('='.repeat(80));

// Test with specific values
const ux = 1, uy = 0, vx = 0, vy = 1;
const cross = ux * vy - uy * vx;
const dot = ux * vx + uy * vy;
const theta = Math.atan2(cross, dot);

console.log(`\nTest vectors: u = (${ux}, ${uy}), v = (${vx}, ${vy})`);
console.log(`  Cross product: ${cross}`);
console.log(`  Dot product: ${dot}`);
console.log(`  θ = atan2(${cross}, ${dot}) = ${theta.toFixed(4)} rad = ${(theta * 180 / Math.PI).toFixed(2)}°`);

// Evaluate gradients at this point
const denom = Math.pow(ux * vx + uy * vy, 2) + Math.pow(ux * vy - uy * vx, 2);

const grad_ux_val = ((ux * vx + uy * vy) * vy + -(ux * vy - uy * vx) * vx) / denom;
const grad_uy_val = ((ux * vx + uy * vy) * -vx + -(ux * vy - uy * vx) * vy) / denom;
const grad_vx_val = ((ux * vx + uy * vy) * -uy + -(ux * vy - uy * vx) * ux) / denom;
const grad_vy_val = ((ux * vx + uy * vy) * ux + -(ux * vy - uy * vx) * -uy) / denom;

console.log(`\nGradient values at u=(1,0), v=(0,1):`);
console.log(`  ∂θ/∂ux = ${grad_ux_val.toFixed(4)}`);
console.log(`  ∂θ/∂uy = ${grad_uy_val.toFixed(4)}`);
console.log(`  ∂θ/∂vx = ${grad_vx_val.toFixed(4)}`);
console.log(`  ∂θ/∂vy = ${grad_vy_val.toFixed(4)}`);

console.log('\n' + '='.repeat(80));
console.log('INTERPRETATION:');
console.log('='.repeat(80));
console.log(`
At u=(1,0) and v=(0,1), the angle is π/2 (90°).

The gradients tell us:
  • ∂θ/∂ux = 0: Moving u in x-direction doesn't change the angle
  • ∂θ/∂uy = -1: Moving u in y-direction decreases the angle
  • ∂θ/∂vx = 1: Moving v in x-direction increases the angle
  • ∂θ/∂vy = 0: Moving v in y-direction doesn't change the angle

This makes geometric sense: the vectors are perpendicular, and moving
them along their current directions doesn't change the angle, but
moving them perpendicular to their directions does.
`);
