# Physics Constraints: Best Practices with Structured Types

This guide demonstrates how to use gradient-script for physics simulations, particularly XPBD (Extended Position-Based Dynamics) constraints. The examples show why **structured types are the natural choice** for physics code.

## Table of Contents
- [Why Use Structured Types?](#why-use-structured-types)
- [Basic Examples](#basic-examples)
- [XPBD Constraints](#xpbd-constraints)
- [Rigid Body Dynamics](#rigid-body-dynamics)
- [Tips and Best Practices](#tips-and-best-practices)

---

## Why Use Structured Types?

### ❌ Without Structured Types (Decomposed)

```gs
function rodConstraint(pix∇, piy∇, pjx∇, pjy∇, restLength) {
  dx = pix - pjx
  dy = piy - pjy
  len = sqrt(dx * dx + dy * dy)
  return len - restLength
}
```

**Output:**
```javascript
return {
  value,
  dpix,   // Which particle does this belong to?
  dpiy,   // Not immediately clear
  dpjx,
  dpjy
}
```

**Problems:**
- 😕 Hard to tell which gradients belong to which particle
- 😕 Doesn't match mathematical notation (vectors)
- 😕 Error-prone when implementing (easy to swap dpix with dpjx)

### ✅ With Structured Types (Recommended)

```gs
function rodConstraint(pi∇: {x, y}, pj∇: {x, y}, restLength) {
  dx = pi.x - pj.x
  dy = pi.y - pj.y
  len = sqrt(dx * dx + dy * dy)
  return len - restLength
}
```

**Output:**
```javascript
return {
  value,
  dpi: { x: ..., y: ... },  // ✓ Clear: gradient for particle i
  dpj: { x: ..., y: ... }   // ✓ Clear: gradient for particle j
}
```

**Benefits:**
- ✅ **Mathematical clarity** - Matches vector notation in physics papers
- ✅ **Self-documenting** - `dpi.x` is obviously the x-gradient for particle i
- ✅ **Easier verification** - Direct mapping to implementation
- ✅ **Scalable** - Easily extends to 3D by adding `z` component

---

## Basic Examples

### 1. Distance Constraint (Rod)

The rod constraint maintains a fixed distance between two particles.

**Math:** `C(p₁, p₂) = |p₁ - p₂| - L₀`

**gradient-script:**
```gs
function rodConstraint(p1∇: {x, y}, p2∇: {x, y}, restLength) {
  dx = p1.x - p2.x
  dy = p1.y - p2.y
  len = sqrt(dx * dx + dy * dy)
  return len - restLength
}
```

**Generated gradients:**
```javascript
{
  value,
  dp1: { x: dx/len, y: dy/len },
  dp2: { x: -dx/len, y: -dy/len }
}
```

**Usage in physics engine:**
```javascript
// XPBD solver
const { value, dp1, dp2 } = rodConstraint_grad(pos[i], pos[j], restLength);
const lambda = -value / (invMass[i] + invMass[j]);
pos[i].x += lambda * invMass[i] * dp1.x;
pos[i].y += lambda * invMass[i] * dp1.y;
pos[j].x += lambda * invMass[j] * dp2.x;
pos[j].y += lambda * invMass[j] * dp2.y;
```

### 2. Angle Constraint

Maintains a specific angle between three particles (two edges).

**Math:** `C(p₁, p₂, p₃) = atan2(u × v, u · v) - θ₀`

Where:
- `u = p₁ - p₂` (first edge)
- `v = p₃ - p₂` (second edge)

**gradient-script:**
```gs
function angleConstraint(
  pi∇: {x, y},
  pj∇: {x, y},
  pk∇: {x, y},
  targetAngle
) {
  ux = pi.x - pj.x
  uy = pi.y - pj.y
  vx = pk.x - pj.x
  vy = pk.y - pj.y

  c = ux * vx + uy * vy
  s = ux * vy - uy * vx
  currentAngle = atan2(s, c)

  return currentAngle - targetAngle
}
```

**Generated gradients:**
```javascript
{
  value,
  dpi: { x: ..., y: ... },  // Gradient for first particle
  dpj: { x: ..., y: ... },  // Gradient for middle particle (hinge)
  dpk: { x: ..., y: ... }   // Gradient for third particle
}
```

**Why structured types help:**
- Three particles = six scalar gradients
- Structured: `dpi`, `dpj`, `dpk` - immediately clear
- Flat: `dpix`, `dpiy`, `dpjx`, `dpjy`, `dpkx`, `dpky` - confusing

### 3. Contact Constraint (Circle)

Keeps a particle outside a circular obstacle.

**gradient-script:**
```gs
function contactConstraintCircle(
  particle∇: {x, y},
  center: {x, y},
  circleRadius,
  particleRadius
) {
  dx = particle.x - center.x
  dy = particle.y - center.y
  dist = sqrt(dx * dx + dy * dy)
  phi = dist - circleRadius
  return phi - particleRadius
}
```

**Output:**
```javascript
{
  value,
  dparticle: { x: ..., y: ... }  // Gradient w.r.t. particle position
}
```

**Semantic clarity:** The gradient name `dparticle` makes it immediately clear what it represents, unlike `dx` and `dy` which could mean many things.

---

## XPBD Constraints

XPBD (Extended Position-Based Dynamics) uses constraint gradients to compute correction forces.

### Rod Constraint (Complete Example)

**File:** `examples/xpbd-rod-constraint.gs`

```gs
function rod_constraint(pi∇: {x, y}, pj: {x, y}, L0) {
  dx = pi.x - pj.x
  dy = pi.y - pj.y
  len = sqrt(dx * dx + dy * dy)
  return len - L0
}
```

**Generate TypeScript:**
```bash
gradient-script examples/xpbd-rod-constraint.gs
```

**Generate C# for Unity/Godot:**
```bash
gradient-script examples/xpbd-rod-constraint.gs --format csharp
```

**C# Output:**
```csharp
public struct PiStruct
{
    public float X;
    public float Y;
}

public struct PjStruct
{
    public float X;
    public float Y;
}

public static RodConstraintGradResult Rod_Constraint_Grad(
    PiStruct pi, PjStruct pj, float L0)
{
    float dx = pi.X - pj.X;
    float dy = pi.Y - pj.Y;
    float len = MathF.Sqrt(dx * dx + dy * dy);
    float value = len - L0;

    float dpi_x = dx / len;
    float dpi_y = dy / len;

    return new RodConstraintGradResult
    {
        Value = value,
        Dpi = new PiGrad { X = dpi_x, Y = dpi_y },
        Dpj = new PjGrad { X = -dpi_x, Y = -dpi_y }
    };
}
```

### Angle Constraint (Complete Example)

**File:** `examples/xpbd-angle-constraint.gs`

```gs
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
```

**Generate and verify:**
```bash
gradient-script examples/xpbd-angle-constraint.gs --format typescript
```

**Usage pattern:**
```typescript
// In your physics solver
const constraint = angle_constraint_grad(
  positions[i],
  positions[j],
  positions[k],
  targetAngle
);

// Apply corrections using gradients
const w = 1 / (invMass[i] + invMass[j] + invMass[k]);
const lambda = -constraint.value * w;

positions[i].x += lambda * invMass[i] * constraint.dpi.x;
positions[i].y += lambda * invMass[i] * constraint.dpi.y;
positions[j].x += lambda * invMass[j] * constraint.dpj.x;
positions[j].y += lambda * invMass[j] * constraint.dpj.y;
positions[k].x += lambda * invMass[k] * constraint.dpk.x;
positions[k].y += lambda * invMass[k] * constraint.dpk.y;
```

---

## Rigid Body Dynamics

### Contact Velocity Constraint

**gradient-script:**
```gs
function contactVelocityConstraint(
  vel∇: {x, y},
  omega∇,
  r: {x, y},
  n: {x, y}
) {
  contactVel_x = vel.x - omega * r.y
  contactVel_y = vel.y + omega * r.x
  normalVel = contactVel_x * n.x + contactVel_y * n.y
  return normalVel
}
```

**Generated Jacobian structure:**
```javascript
{
  value,           // Normal velocity
  dvel: {          // Jacobian w.r.t. linear velocity
    x: n.x,
    y: n.y
  },
  domega: -r.x * n.y + r.y * n.x  // Jacobian w.r.t. angular velocity
}
```

This directly gives you the Jacobian needed for impulse-based collision resolution!

### Spring Energy

**gradient-script:**
```gs
function springEnergy(pos∇: {x, y}, anchor: {x, y}, stiffness) {
  dx = pos.x - anchor.x
  dy = pos.y - anchor.y
  distSq = dx * dx + dy * dy
  return 0.5 * stiffness * distSq
}
```

**Generated force (negative gradient):**
```javascript
{
  value,      // Energy
  dpos: {     // Force = -∇E
    x: stiffness * dx,
    y: stiffness * dy
  }
}
```

---

## Tips and Best Practices

### 1. Name Parameters Semantically

✅ **Good:**
```gs
function spring(particle∇: {x, y}, anchor: {x, y}, k) {
  // Clear: particle is the dynamic object, anchor is fixed
}
```

❌ **Bad:**
```gs
function spring(p1∇: {x, y}, p2: {x, y}, k) {
  // Unclear: which is the particle, which is the anchor?
}
```

### 2. Use Consistent Component Names

For 2D physics, always use `{x, y}`:
```gs
function constraint2D(pos∇: {x, y}) { ... }
```

For 3D physics, always use `{x, y, z}`:
```gs
function constraint3D(pos∇: {x, y, z}) { ... }
```

### 3. Match Your Implementation's Memory Layout

**Array-of-Structures (AoS):**
```gs
// If your engine stores: particles[i].x, particles[i].y
function constraint(p∇: {x, y}) { ... }
```

**Structure-of-Arrays (SoA):**
```gs
// If your engine stores: posX[i], posY[i]
// You can still use structured types! Just extract:
// pos = { x: posX[i], y: posY[i] }
function constraint(p∇: {x, y}) { ... }
```

The structured gradient makes the math clear even if you store data separately.

### 4. Verification Workflow

1. **Write constraint in gradient-script:**
   ```gs
   function myConstraint(p1∇: {x, y}, p2∇: {x, y}) { ... }
   ```

2. **Generate gradients:**
   ```bash
   gradient-script my_constraint.gs --format typescript
   ```

3. **Compare to your implementation:**
   ```typescript
   // Your hand-written gradient
   const my_dp1x = ...;
   const my_dp1y = ...;

   // Generated gradient
   const { dp1 } = myConstraint_grad(p1, p2);

   // Should match!
   console.assert(Math.abs(my_dp1x - dp1.x) < 1e-6);
   console.assert(Math.abs(my_dp1y - dp1.y) < 1e-6);
   ```

4. **Use edge case warnings:**
   ```bash
   gradient-script my_constraint.gs --guards --epsilon 1e-10
   ```

### 5. Handle Edge Cases

gradient-script warns about potential edge cases:

```bash
gradient-script rod.gs
```

Output:
```
⚠️  EDGE CASE WARNINGS:
  • Line 4: len = sqrt(dx * dx + dy * dy)
    Square root of negative: sqrt of sum of squares (safe, but can be zero)
    💡 Fix: Add epsilon for numerical stability
```

**Fix in your implementation:**
```javascript
const len = Math.sqrt(Math.max(dx*dx + dy*dy, 1e-12));
```

Or use `--guards` to auto-generate guards:
```bash
gradient-script rod.gs --guards --epsilon 1e-10
```

---

## Common Physics Patterns

### Pattern 1: Particle-Particle Constraints
```gs
function constraint(pi∇: {x, y}, pj∇: {x, y}, params...) {
  // Gradients: dpi, dpj
}
```

### Pattern 2: Particle-World Constraints
```gs
function constraint(particle∇: {x, y}, worldParams...) {
  // Gradient: dparticle
}
```

### Pattern 3: Multi-Particle Constraints
```gs
function constraint(
  p1∇: {x, y},
  p2∇: {x, y},
  p3∇: {x, y},
  p4∇: {x, y},
  params...
) {
  // Gradients: dp1, dp2, dp3, dp4
}
```

### Pattern 4: Rigid Body Constraints
```gs
function constraint(
  body∇: {x, y, angle},
  params...
) {
  // Gradient: dbody = {x, y, angle}
}
```

---

## Examples Directory

See `examples/` for more complete examples:

- `xpbd-rod-constraint.gs` - Distance constraint
- `xpbd-angle-constraint.gs` - Angle constraint
- `distance.gs` - Simple distance function
- `triangle-area.gs` - Area constraint
- `point-segment-distance.gs` - Point-to-line-segment distance

**Try them:**
```bash
# TypeScript output
gradient-script examples/xpbd-rod-constraint.gs

# C# output for game engines
gradient-script examples/xpbd-rod-constraint.gs --format csharp

# Python output for research
gradient-script examples/xpbd-rod-constraint.gs --format python
```

---

## Further Reading

- [XPBD Paper](https://matthias-research.github.io/pages/publications/XPBD.pdf) - Extended Position-Based Dynamics
- [PBD Paper](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) - Original Position-Based Dynamics
- [Small Steps in Physics Simulation](https://www.gdcvault.com/play/1027429/) - Erin Catto's GDC talk on constraints

---

**Pro Tip:** When in doubt, use structured types. Your future self (and your teammates) will thank you when debugging constraint violations at 2 AM.
