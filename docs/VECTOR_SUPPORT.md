# Vector Support in Symbolic Gradients

## Overview

The symbolic gradient system supports **component-wise differentiation** of vector operations. This means you express vectors as individual scalar components and differentiate with respect to each component separately.

## What Works ✓

### 1. Component-Wise Representation

```typescript
// Define vectors as separate components
const input = `
  output = vx * vx + vy * vy
`;

const gradients = computeGradients(program, ['vx', 'vy']);
// Result: ∂f/∂vx = 2*vx, ∂f/∂vy = 2*vy
```

### 2. Vec2/Vec3 Parsing

The parser recognizes Vec2/Vec3 constructors and component access:

```typescript
parse('v = Vec2(x, y)');           // ✓ Parses as VectorConstructor
parse('v = Vec3(x, y, z)');        // ✓ Parses as VectorConstructor
parse('a = v.x');                  // ✓ Parses as VectorAccess
parse('b = v.y');                  // ✓ Parses as VectorAccess
```

### 3. Standard Vector Operations (Expanded Form)

#### Magnitude
```typescript
// |v|² = vx² + vy²
const input = 'output = vx * vx + vy * vy';
// Gradients: ∂|v|²/∂vx = 2*vx, ∂|v|²/∂vy = 2*vy
```

```typescript
// |v| = √(vx² + vy²)
const input = 'output = sqrt(vx * vx + vy * vy)';
// Gradients: ∂|v|/∂vx = vx/|v|, ∂|v|/∂vy = vy/|v|
```

#### Dot Product
```typescript
// u·v = ux*vx + uy*vy
const input = 'output = ux * vx + uy * vy';
// Gradients w.r.t. u: [vx, vy]
// Gradients w.r.t. v: [ux, uy]
```

#### Cross Product (2D - scalar result)
```typescript
// u×v = ux*vy - uy*vx
const input = 'output = ux * vy - uy * vx';
// Gradients w.r.t. u: [vy, -vx]
// Gradients w.r.t. v: [-uy, ux]
```

#### Distance Between Points
```typescript
// dist(p1, p2) = √((x2-x1)² + (y2-y1)²)
const input = 'output = sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))';
// Gradients: ∂dist/∂x1 = -(x2-x1)/dist, ∂dist/∂y1 = -(y2-y1)/dist
```

#### Angle Between Vectors (atan2)
```typescript
// θ = atan2(u×v, u·v)
const input = 'output = atan2(ux * vy - uy * vx, ux * vx + uy * vy)';
// Gradients available for all four components: [ux, uy, vx, vy]
```

## Current Limitations ⚠️

### 1. Native Vector Method Calls

```typescript
// ❌ NOT YET SUPPORTED
parse('output = v.magnitude');      // Parses but differentiation incomplete
parse('output = u.dot(v)');         // Parses but differentiation incomplete

// ✓ WORKAROUND: Use expanded form
parse('output = sqrt(vx * vx + vy * vy)');          // Magnitude
parse('output = ux * vx + uy * vy');                // Dot product
```

### 2. Vector Variables in Differentiation

The differentiation system works best when you:
- Use separate scalar variables: `vx`, `vy`, `vz`
- NOT vector variables: `v.x`, `v.y`, `v.z`

```typescript
// ✓ RECOMMENDED
const params = ['vx', 'vy'];  // Scalar parameters

// ⚠️ LIMITED SUPPORT
const params = ['v.x', 'v.y'];  // Component notation works for simple cases
```

### 3. Intermediate Variables

```typescript
// ❌ NOT YET SUPPORTED
const input = `
  mag = sqrt(vx * vx + vy * vy)
  output = 1 / mag
`;
// computeGradients doesn't chain through 'mag'

// ✓ WORKAROUND: Inline the expression
const input = 'output = 1 / sqrt(vx * vx + vy * vy)';
```

## Design Philosophy

The symbolic gradient system treats vectors as **collections of scalar components**, consistent with:

1. **Jacobian matrices**: ∂f/∂v is naturally represented as [∂f/∂vx, ∂f/∂vy, ∂f/∂vz]
2. **Component-wise gradients**: Each component's gradient is computed independently
3. **Mathematical clarity**: Explicit component notation makes chain rule applications clear

## Example: Complete Workflow

```typescript
import { parse, computeGradients, simplify, generateGradientCode } from 'scalar-autograd';

// 1. Define operation with component notation
const input = `
  output = sqrt(vx * vx + vy * vy)
`;

// 2. Parse and compute gradients
const program = parse(input);
const gradients = computeGradients(program, ['vx', 'vy']);

// 3. Simplify
const simplified = new Map();
for (const [param, expr] of gradients.entries()) {
  simplified.set(param, simplify(expr));
}

// 4. Generate code
const code = generateGradientCode(program, simplified);

/* Output:
// ∂|v|/∂vx = vx/√(vx² + vy²)
const grad_vx = vx / Math.sqrt(vx * vx + vy * vy);

// ∂|v|/∂vy = vy/√(vx² + vy²)
const grad_vy = vy / Math.sqrt(vx * vx + vy * vy);
*/
```

## Future Enhancements

Planned additions for better vector support:

1. **Native vector method differentiation**
   - `v.magnitude` → automatic component expansion
   - `u.dot(v)` → built-in dot product gradients
   - `u.cross(v)` → built-in cross product gradients (3D)

2. **Vector variable chains**
   - Support `v.x` notation in parameter lists
   - Automatic gathering of component gradients into vector form

3. **Jacobian matrix generation**
   - Automatic assembly of component gradients into matrix form
   - Pretty-printing for vector → vector mappings

4. **Vector-valued functions**
   - Support for functions returning Vec2/Vec3
   - Chain rule through vector-valued intermediate results

## Comparison: Symbolic vs Runtime Autodiff

| Feature | Symbolic | Runtime (Value class) |
|---------|----------|----------------------|
| **Vec2/Vec3 support** | Component-wise | Native Vec2/Vec3 classes |
| **Syntax** | Expanded components | v.dot(u), v.magnitude |
| **Output** | Individual gradients | Accumulated .grad fields |
| **Use case** | Code generation | Numerical optimization |

Both approaches are valid and complementary!
