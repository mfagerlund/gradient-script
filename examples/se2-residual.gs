function se2_residual(theta∇, t∇: {x, y}, p: {x, y}, target: {x, y}) {
  c = cos(theta)
  s = sin(theta)
  x = c * p.x - s * p.y + t.x
  y = s * p.x + c * p.y + t.y
  dx = x - target.x
  dy = y - target.y
  return 0.5 * (dx * dx + dy * dy)
}
