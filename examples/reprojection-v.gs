function reprojection_v(
  worldPoint∇: {x, y, z},
  cameraPos∇: {x, y, z},
  q∇: {w, x, y, z},
  fx, fy, cx, cy, k1, k2, k3, p1, p2,
  observedV
) {
  tx = worldPoint.x - cameraPos.x
  ty = worldPoint.y - cameraPos.y
  tz = worldPoint.z - cameraPos.z

  qcx = q.y * tz - q.z * ty
  qcy = q.z * tx - q.x * tz
  qcz = q.x * ty - q.y * tx

  dcx = q.y * qcz - q.z * qcy
  dcy = q.z * qcx - q.x * qcz
  dcz = q.x * qcy - q.y * qcx

  camX = tx + 2 * q.w * qcx + 2 * dcx
  camY = ty + 2 * q.w * qcy + 2 * dcy
  camZ = tz + 2 * q.w * qcz + 2 * dcz

  normX = camX / camZ
  normY = camY / camZ

  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY

  distortedY = normY * radial + tangY

  v = cy - fy * distortedY

  return v - observedV
}
