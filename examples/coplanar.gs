// Coplanar residual: measures how far 4 points are from being coplanar
// Uses scalar triple product normalized by edge lengths
function coplanar_residual(p0∇: {x, y, z}, p1∇: {x, y, z}, p2∇: {x, y, z}, p3∇: {x, y, z}) {
  // Edge vectors from p0
  v1x = p1.x - p0.x
  v1y = p1.y - p0.y
  v1z = p1.z - p0.z

  v2x = p2.x - p0.x
  v2y = p2.y - p0.y
  v2z = p2.z - p0.z

  v3x = p3.x - p0.x
  v3y = p3.y - p0.y
  v3z = p3.z - p0.z

  // Cross product v2 × v3
  cx = v2y * v3z - v2z * v3y
  cy = v2z * v3x - v2x * v3z
  cz = v2x * v3y - v2y * v3x

  // Scalar triple product: v1 · (v2 × v3)
  scalarTriple = v1x * cx + v1y * cy + v1z * cz

  // Edge lengths for normalization
  len1 = sqrt(v1x * v1x + v1y * v1y + v1z * v1z)
  len2 = sqrt(v2x * v2x + v2y * v2y + v2z * v2z)
  len3 = sqrt(v3x * v3x + v3y * v3y + v3z * v3z)

  // Normalized residual (with epsilon to avoid division by zero)
  epsilon = 0.000001
  normFactor = len1 * len2 * len3 + epsilon

  return scalarTriple / normFactor
}
