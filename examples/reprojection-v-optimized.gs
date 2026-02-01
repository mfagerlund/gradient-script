// Optimized reprojection using "narrow waist" pattern
// Only differentiates w.r.t. camera-space point (camX, camY, camZ)
//
// Usage in application:
//   1. Compute t = worldPoint - cameraPos externally
//   2. Compute cam = R(q) * t externally (quaternion rotation)
//   3. Call this function to get d_residual/d_cam
//   4. Chain: d_residual/d_t = R(q)^T * d_cam
//   5. d_residual/d_worldPoint = d_residual/d_t
//   6. d_residual/d_cameraPos = -d_residual/d_t
//   7. d_residual/d_q requires manual Jacobian of R(q)*t w.r.t. q

function reprojection_v_dcam(
  camX∇, camY∇, camZ∇,
  fy, cy, k1, k2, k3, p1, p2,
  observedV
) {
  // Projection
  normX = camX / camZ
  normY = camY / camZ

  // Distortion
  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY

  distortedY = normY * radial + tangY

  // Pixel coordinate
  v = cy - fy * distortedY

  return v - observedV
}
