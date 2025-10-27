function distance_squared(u∇: {x, y}, v: {x, y}) {
  diff = u - v
  return diff.x^2 + diff.y^2
}
