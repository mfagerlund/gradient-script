// Verify test_with_normx gradient - UPDATED for 0.3.1

function test_with_normx_grad(camX, camY, camZ, fy, cy, k1, p1, p2) {
  const _fwd0 = 1 / camZ;
  const normX = camX * _fwd0;
  const normY = camY * _fwd0;
  const r2 = normX * normX + normY * normY;
  const radial = 1 + k1 * r2;
  const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;
  const distortedY = normY * radial + tangY;
  const v = cy - fy * distortedY;
  const value = v;

  // Gradients
  const _tmp0 = 1 / camZ;
  const _tmp1 = normY * k1;
  const _tmp2 = 2 * p2;
  const _tmp3 = _tmp0 * normY;
  const _tmp4 = _tmp2 * normX + radial;
  const _tmp12 = 1 / (camZ * camZ);
  const _tmp13 = camY * _tmp12;
  const _tmp9 = _tmp13 * normY;
  const _tmp14 = camX * _tmp12;
  const _tmp10 = _tmp14 * normX;

  const dcamX = fy * (-(2 * _tmp0 * normX * (_tmp1 + p1)) - _tmp2 * _tmp3);
  const dcamY = fy * (-(2 * _tmp3 * _tmp1 + _tmp0 * _tmp4 + 2 * p1 * _tmp0 * (normY + 2 * normY)));
  const dcamZ = fy * (_tmp13 * _tmp4 - (p1 * 2 * (_tmp9 * -3 - _tmp10) + normY * (2 * k1 * (-_tmp10 - _tmp9) - 2 * _tmp14 * p2)));

  return { value, dcamX, dcamY, dcamZ };
}

// Test with no distortion
const camX = 0, camY = 1, camZ = 2;
const fy = 500, cy = 0;
const k1 = 0, p1 = 0, p2 = 0;

const result = test_with_normx_grad(camX, camY, camZ, fy, cy, k1, p1, p2);

console.log("Generated dcamY:", result.dcamY);
console.log("Expected -fy/camZ:", -fy/camZ);

// Numerical verification
const eps = 1e-6;
function computeV(camY) {
  const normX = camX / camZ;
  const normY = camY / camZ;
  const r2 = normX * normX + normY * normY;
  const radial = 1 + k1 * r2;
  const tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY;
  const distortedY = normY * radial + tangY;
  return cy - fy * distortedY;
}

const numerical = (computeV(camY + eps) - computeV(camY - eps)) / (2 * eps);
console.log("Numerical gradient:", numerical);
console.log("Match analytical:", Math.abs(result.dcamY - numerical) < 0.001 ? "YES ✓" : "NO ✗");
console.log("Match expected:", Math.abs(result.dcamY - (-fy/camZ)) < 0.001 ? "YES ✓" : "NO ✗");
