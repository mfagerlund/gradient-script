function triangle_area(a∇: {x, y}, b∇: {x, y}, c∇: {x, y}) {
  abx = b.x - a.x
  aby = b.y - a.y
  acx = c.x - a.x
  acy = c.y - a.y
  return 0.5 * (abx * acy - aby * acx)
}
