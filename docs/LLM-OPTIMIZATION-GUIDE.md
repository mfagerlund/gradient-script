# GradientScript Optimization Guide for LLMs

This guide teaches you how to write efficient `.gs` files that produce compact, fast gradient code. GradientScript performs symbolic differentiation correctly, but **you** control the structure. Smart structuring can reduce generated code by 10x or more.

## Core Principle: Factor Before Differentiating

GradientScript differentiates exactly what you give it. If you write one giant function, you get one giant gradient. If you factor into stages, you can chain gradients manually and share intermediate results.

## Pattern 1: Negate Instead of Recompute

**Problem**: When two parameters appear as `a - b`, their gradients are always negatives of each other. Computing both wastes effort.

**Bad** - computes both gradients fully:
```gs
function residual(worldPoint∇: {x,y,z}, cameraPos∇: {x,y,z}, ...) {
  tx = worldPoint.x - cameraPos.x
  ty = worldPoint.y - cameraPos.y
  tz = worldPoint.z - cameraPos.z
  // ... rest of computation
  return value
}
// Generates: dworldPoint AND dcameraPos (both are huge, one is just -1 * the other)
```

**Good** - compute translation externally, differentiate once:
```gs
function residual(t∇: {x,y,z}, q∇: {w,x,y,z}, ...) {
  // t = worldPoint - cameraPos (computed by caller)
  // ... computation using t
  return value
}
```

Then in your application code:
```typescript
const result = residual_grad(t, q, ...);
const dworldPoint = result.dt;  // Use directly
const dcameraPos = { x: -result.dt.x, y: -result.dt.y, z: -result.dt.z };  // Just negate!
```

**Savings**: Eliminates 50% of gradient computation for position parameters.

## Pattern 2: Stage Computations at Natural Boundaries

Complex pipelines have natural stages. Differentiate each stage separately, then chain with the chain rule.

**Example: Camera reprojection pipeline**

Instead of one function that goes `worldPoint → pixel`, split into:

```gs
// Stage 1: World to camera coordinates (rotation)
function world_to_cam(t∇: {x,y,z}, q∇: {w,x,y,z}) {
  // Quaternion rotation: cam = R(q) * t
  qcx = q.y * t.z - q.z * t.y
  qcy = q.z * t.x - q.x * t.z
  qcz = q.x * t.y - q.y * t.x
  dcx = q.y * qcz - q.z * qcy
  dcy = q.z * qcx - q.x * qcz
  dcz = q.x * qcy - q.y * qcx
  camX = 2 * (q.w * qcx + dcx) + t.x
  camY = 2 * (q.w * qcy + dcy) + t.y
  camZ = 2 * (q.w * qcz + dcz) + t.z
  return camX  // Return one component, or use multiple functions
}

// Stage 2: Camera to normalized coordinates (projection)
function cam_to_norm(camX∇, camY∇, camZ∇) {
  normX = camX / camZ
  normY = camY / camZ
  return normX  // or normY
}

// Stage 3: Distortion model
function apply_distortion_y(normX∇, normY∇, k1, k2, k3, p1, p2) {
  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY
  distortedY = normY * radial + tangY
  return distortedY
}

// Stage 4: Pixel projection
function distorted_to_pixel_v(distortedY∇, fy, cy, observedV) {
  v = cy - fy * distortedY
  return v - observedV
}
```

**Chaining in application code**:
```typescript
// Forward pass (compute intermediates)
const t = { x: worldPoint.x - cameraPos.x, ... };
const cam = world_to_cam(t, q);
const norm = { x: cam.x / cam.z, y: cam.y / cam.z };
const distY = apply_distortion_y(norm.x, norm.y, k1, k2, k3, p1, p2);
const residual = distorted_to_pixel_v(distY, fy, cy, observedV);

// Backward pass (chain rule)
const d4 = distorted_to_pixel_v_grad(...);  // d_residual/d_distortedY
const d3 = apply_distortion_y_grad(...);    // d_distortedY/d_norm
const d_normX = d4.ddistortedY * d3.dnormX;
const d_normY = d4.ddistortedY * d3.dnormY;
// ... continue chaining back through stages
```

**Savings**: Each stage's gradient is small. Total code is sum of parts, not product.

## Pattern 3: Exploit Mathematical Structure

### Orthogonal matrices (rotations)

For any orthogonal matrix R (like a rotation), if `y = R * x`, then:
- `dx = R^T * dy` (transpose, not inverse computation)

If you know you're dealing with a rotation, you can:
1. Generate `R(q)` as a 3x3 matrix
2. Generate gradients w.r.t. `cam = (camX, camY, camZ)`
3. Manually compute `dt = R^T * d_cam` (just 9 multiplies + 9 adds)

### Symmetric computations

If your function has symmetry, exploit it:
```gs
// If f(a, b) = f(b, a), then df/da at (a,b) = df/db at (b,a)
// Compute one, swap inputs for the other
```

## Pattern 4: Return Scalar, Compute Vector Externally

GradientScript handles structured types, but sometimes it's cleaner to have multiple scalar functions:

```gs
// Instead of trying to return {x, y, z}, write three functions:
function compute_camX(t∇: {x,y,z}, q∇: {w,x,y,z}) { ... return camX }
function compute_camY(t∇: {x,y,z}, q∇: {w,x,y,z}) { ... return camY }
function compute_camZ(t∇: {x,y,z}, q∇: {w,x,y,z}) { ... return camZ }
```

The gradients will share structure, and the e-graph CSE will find common subexpressions if you process them together.

## Pattern 5: Identify the "Narrow Waist"

In any computation graph, find the point with the fewest intermediate values. Differentiate through that bottleneck.

**Reprojection example**:
```
worldPoint (3) ─┐
                ├─► t (3) ─► cam (3) ─► norm (2) ─► distorted (2) ─► pixel (2) ─► residual (1)
cameraPos (3) ──┘            ▲
                             │
q (4) ────────────────────────┘
```

The "narrow waist" is `cam (3)` - only 3 values flow through. Compute:
1. `d_residual/d_cam` (3 scalars) - differentiate the projection/distortion part
2. `d_cam/d_t` and `d_cam/d_q` - differentiate the rotation part
3. Chain: `d_residual/d_t = (d_residual/d_cam) · (d_cam/d_t)`

## Pattern 6: Constants Don't Need Gradients

Only mark parameters with `∇` if you actually need their gradients:

```gs
// If fx, fy, cx, cy, k1, k2, k3, p1, p2 are calibration constants:
function residual(worldPoint∇: {x,y,z}, cameraPos∇: {x,y,z}, q∇: {w,x,y,z},
                  fx, fy, cx, cy, k1, k2, k3, p1, p2, observedV) {
  // No ∇ on intrinsics = no gradient computation for them
}
```

## Example: Optimized Reprojection

Here's how to structure reprojection for minimal gradient code:

### File: `reprojection_optimized.gs`

```gs
// Gradient of residual w.r.t. camera-space point only
// This is the "narrow waist" - all parameter gradients flow through here
function reprojection_dcam(camX∇, camY∇, camZ∇, fx, fy, cx, cy, k1, k2, k3, p1, p2, observedU, observedV) {
  // Projection
  invZ = 1 / camZ
  normX = camX * invZ
  normY = camY * invZ

  // Distortion
  r2 = normX * normX + normY * normY
  r4 = r2 * r2
  r6 = r4 * r2
  radial = 1 + k1 * r2 + k2 * r4 + k3 * r6

  tangX = 2 * p1 * normX * normY + p2 * (r2 + 2 * normX * normX)
  tangY = p1 * (r2 + 2 * normY * normY) + 2 * p2 * normX * normY

  distortedX = normX * radial + tangX
  distortedY = normY * radial + tangY

  // Pixel coordinates
  u = cx + fx * distortedX
  v = cy - fy * distortedY

  // Residual (squared for optimization, or linear for Jacobian)
  residual = (u - observedU) * (u - observedU) + (v - observedV) * (v - observedV)
  return residual
}
```

### Usage in application:

```typescript
// This gives you d_residual/d_camX, d_residual/d_camY, d_residual/d_camZ
const dcam = reprojection_dcam_grad(camX, camY, camZ, ...);

// Now chain through rotation (you write this, it's tiny):
// d_residual/d_t = R(q)^T * [dcam.dcamX, dcam.dcamY, dcam.dcamZ]
// d_residual/d_worldPoint = d_residual/d_t
// d_residual/d_cameraPos = -d_residual/d_t

// For quaternion: use the Jacobian of R(q)*t w.r.t. q (a 3x4 matrix)
```

## Summary

1. **Don't differentiate what you can negate** - `dcameraPos = -dworldPoint`
2. **Stage your computation** - differentiate stages separately, chain manually
3. **Find the narrow waist** - fewest intermediates = smallest gradients
4. **Exploit structure** - rotations, symmetry, orthogonality
5. **Mark only what needs gradients** - skip constants

The LLM's job is to understand the math and structure the `.gs` file smartly. GradientScript's job is to differentiate correctly. Together, you get compact, efficient gradient code.
