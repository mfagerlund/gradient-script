function signed_distance_point_line(p∇: {x, y}, a: {x, y}, b: {x, y}) {
  apx = p.x - a.x
  apy = p.y - a.y
  abx = b.x - a.x
  aby = b.y - a.y
  num = apx * aby - apy * abx
  den = sqrt(abx * abx + aby * aby)
  return num / den
}
