function circle_fit_energy(c∇: {x, y}, R∇, p: {x, y}) {
  dx = p.x - c.x
  dy = p.y - c.y
  d = sqrt(dx * dx + dy * dy)
  e = d - R
  return 0.5 * e * e
}
