// Test with normX included (like full reprojection)
function test_with_normx(camX∇, camY∇, camZ∇, fy, cy, k1, p1, p2) {
  normX = camX / camZ
  normY = camY / camZ
  r2 = normX * normX + normY * normY
  radial = 1 + k1 * r2
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY
  distortedY = normY * radial + tangY
  v = cy - fy * distortedY
  return v
}
