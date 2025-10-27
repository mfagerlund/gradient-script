function angle_constraint(pi∇: {x, y}, pj∇: {x, y}, pk∇: {x, y}, theta0) {
  ux = pi.x - pj.x
  uy = pi.y - pj.y
  vx = pk.x - pj.x
  vy = pk.y - pj.y
  cross = ux * vy - uy * vx
  dot = ux * vx + uy * vy
  theta = atan2(cross, dot)
  return theta - theta0
}
