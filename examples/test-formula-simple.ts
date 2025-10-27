/**
 * Directly test if our formula is right by manually checking
 */

// Helper functions
function dot2d(u: any, v: any) {
  return u.x * v.x + u.y * v.y;
}

function cross2d(u: any, v: any) {
  return u.x * v.y - u.y * v.x;
}

// Test point: perpendicular vectors
const u = { x: 1.0, y: 0.0 };
const v = { x: 0.0, y: 1.0 };

console.log(`Test: u=(${u.x}, ${u.y}), v=(${v.x}, ${v.y})`);
console.log();

// THE GENERATED CODE (exactly as we output it):
const generated_grad_u_x = dot2d(u, v) * v.y - cross2d(u, v) * v.x / Math.pow(dot2d(u, v), 2) + Math.pow(cross2d(u, v), 2);

console.log('Generated formula (as written):');
console.log('dot2d(u, v) * v.y - cross2d(u, v) * v.x / Math.pow(dot2d(u, v), 2) + Math.pow(cross2d(u, v), 2)');
console.log(`= ${dot2d(u, v)} * ${v.y} - ${cross2d(u, v)} * ${v.x} / ${Math.pow(dot2d(u, v), 2)} + ${Math.pow(cross2d(u, v), 2)}`);
console.log(`= ${generated_grad_u_x}`);
console.log();

// THE CORRECT FORMULA (with parentheses):
const cross = cross2d(u, v);
const dot = dot2d(u, v);
const denom = Math.pow(dot, 2) + Math.pow(cross, 2);
const correct_grad_u_x = (dot * v.y - cross * v.x) / denom;

console.log('Correct formula (with parentheses):');
console.log('(dot * v.y - cross * v.x) / (dot^2 + cross^2)');
console.log(`= (${dot} * ${v.y} - ${cross} * ${v.x}) / ${denom}`);
console.log(`= ${correct_grad_u_x}`);
console.log();

// Compare
console.log(`Generated value: ${generated_grad_u_x}`);
console.log(`Correct value:   ${correct_grad_u_x}`);
console.log(`Error:           ${Math.abs(generated_grad_u_x - correct_grad_u_x).toExponential(2)}`);
console.log();

if (Math.abs(generated_grad_u_x - correct_grad_u_x) < 1e-10) {
  console.log('✅ SOMEHOW IT WORKS! Maybe due to how the expression simplified?');
} else {
  console.log('❌ CONFIRMED BUG: Operator precedence issue in generated code!');
  console.log();
  console.log('The issue: division binds tighter than subtraction/addition');
  console.log('So: a - b / c + d  parses as:  a - (b/c) + d');
  console.log('But we need: (a - b) / (c + d)');
}
