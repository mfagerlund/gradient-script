function distance_point_segment(p∇: {x, y}, a: {x, y}, b: {x, y}) {
  vx = b.x - a.x
  vy = b.y - a.y
  wx = p.x - a.x
  wy = p.y - a.y
  t = (wx * vx + wy * vy) / (vx * vx + vy * vy)
  t_clamped = clamp(t, 0, 1)
  qx = a.x + t_clamped * vx
  qy = a.y + t_clamped * vy
  dx = p.x - qx
  dy = p.y - qy
  return sqrt(dx * dx + dy * dy)
}
