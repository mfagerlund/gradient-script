function rod_constraint(pi∇: {x, y}, pj: {x, y}, L0) {
  dx = pi.x - pj.x
  dy = pi.y - pj.y
  len = sqrt(dx * dx + dy * dy)
  return len - L0
}
