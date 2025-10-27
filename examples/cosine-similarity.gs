function cosine_similarity(u∇: {x, y}, v∇: {x, y}) {
  dot = dot2d(u, v)
  u_mag = magnitude2d(u)
  v_mag = magnitude2d(v)
  return dot / (u_mag * v_mag)
}
