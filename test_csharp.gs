function rodConstraint(pi∇: {x, y}, pj∇: {x, y}, restLength) {
  dx = pi.x - pj.x
  dy = pi.y - pj.y
  len = sqrt(dx * dx + dy * dy)
  return len - restLength
}
