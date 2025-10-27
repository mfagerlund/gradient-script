function bearing_of(p∇: {x, y}) {
  mx = p.x
  my = p.y
  mag = sqrt(mx * mx + my * my)
  nx = mx / mag
  ny = my / mag
  return atan2(ny, nx)
}
