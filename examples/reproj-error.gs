function reproj_error(P∇: {x, y, z}, fx, fy, cx, cy, u_obs: {x, y}) {
  X = P.x
  Y = P.y
  Z = P.z
  u = fx * (X / Z) + cx
  v = fy * (Y / Z) + cy
  du = u - u_obs.x
  dv = v - u_obs.y
  return 0.5 * (du * du + dv * dv)
}
