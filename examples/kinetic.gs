function kinetic_energy(v∇: {x, y}, mass) {
  speed_squared = v.x^2 + v.y^2
  return 0.5 * mass * speed_squared
}
