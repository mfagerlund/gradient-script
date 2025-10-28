# GradientScript

[![npm version](https://badge.fury.io/js/gradient-script.svg)](https://www.npmjs.com/package/gradient-script)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub release](https://img.shields.io/github/v/release/mfagerlund/gradient-script)](https://github.com/mfagerlund/gradient-script/releases)
[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)

> **For LLMs:** This README is available in raw format at:
> `https://raw.githubusercontent.com/mfagerlund/gradient-script/main/README.md`

**Symbolic automatic differentiation for structured types**

GradientScript is a source-to-source compiler that automatically generates gradient functions from your mathematical code. Unlike numerical AD frameworks (JAX, PyTorch), it produces clean, human-readable gradient formulas you can inspect, optimize, and integrate directly into your codebase.

## Why GradientScript?

- **From real code to gradients**: Write natural math code, get symbolic derivatives
- **Verified correctness**: Every gradient automatically checked against numerical differentiation
- **Structured types**: Work with vectors `{x, y}` and custom structures, not just scalars
- **Zero runtime overhead**: No tape, no graph - just pure gradient functions
- **Multiple output languages**: TypeScript, JavaScript, Python, or C#
- **Readable output**: Human-reviewable formulas with automatic optimization

## Installation

```bash
npm install -g gradient-script
```

## Quick Example

You have TypeScript code computing 2D vector distance:

```typescript
// Your original TypeScript code
function distance(u: Vec2, v: Vec2): number {
  const dx = u.x - v.x;
  const dy = u.y - v.y;
  return Math.sqrt(dx * dx + dy * dy);
}
```

Convert it to GradientScript by marking what you need gradients for:

```typescript
// distance.gs
function distance(u∇: {x, y}, v∇: {x, y}) {
  dx = u.x - v.x
  dy = u.y - v.y
  return sqrt(dx * dx + dy * dy)
}
```

Generate gradients:

```bash
gradient-script distance.gs
```

Get complete forward and gradient functions:

```typescript
// Forward function
function distance(u, v) {
  const dx = u.x - v.x;
  const dy = u.y - v.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Gradient function - returns { value, du, dv }
function distance_grad(u, v) {
  const dx = u.x - v.x;
  const dy = u.y - v.y;
  const value = Math.sqrt(dx * dx + dy * dy);

  const _tmp0 = 2 * Math.sqrt(dx * dx + dy * dy);

  const du = {
    x: (2 * dx) / _tmp0,
    y: (2 * dy) / _tmp0,
  };
  const dv = {
    x: (2 * (-dx)) / _tmp0,
    y: (2 * (-dy)) / _tmp0,
  };

  return { value, du, dv };
}
```

Now use it in your optimizer, physics engine, or neural network!

## More Examples

### From C++ Physics Code

**Original C++ spring force calculation:**
```cpp
float spring_energy(Vec2 p1, Vec2 p2, float rest_length, float k) {
    float dx = p2.x - p1.x;
    float dy = p2.y - p1.y;
    float dist = sqrt(dx*dx + dy*dy);
    float stretch = dist - rest_length;
    return 0.5f * k * stretch * stretch;
}
```

**GradientScript version:**
```typescript
function spring_energy(p1∇: {x, y}, p2∇: {x, y}, rest_length, k) {
  dx = p2.x - p1.x
  dy = p2.y - p1.y
  dist = sqrt(dx * dx + dy * dy)
  stretch = dist - rest_length
  return 0.5 * k * stretch^2
}
```

**Generated gradient (for physics simulation):**
```typescript
function spring_energy_grad(p1, p2, rest_length, k) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const stretch = dist - rest_length;
  const value = 0.5 * k * stretch * stretch;

  const _tmp0 = 2 * Math.sqrt(dx * dx + dy * dy);

  const dp1 = {
    x: k * stretch * (-(2 * dx) / _tmp0),
    y: k * stretch * (-(2 * dy) / _tmp0),
  };
  const dp2 = {
    x: k * stretch * (2 * dx) / _tmp0,
    y: k * stretch * (2 * dy) / _tmp0,
  };

  return { value, dp1, dp2 };
}
```

Use `dp1` and `dp2` as forces in your physics simulation!

### From C# Graphics Code

**Original C# normalized dot product:**
```csharp
float NormalizedDotProduct(Vector2 u, Vector2 v) {
    float dot = u.X * v.X + u.Y * v.Y;
    float u_mag = (float)Math.Sqrt(u.X * u.X + u.Y * u.Y);
    float v_mag = (float)Math.Sqrt(v.X * v.X + v.Y * v.Y);
    return dot / (u_mag * v_mag);
}
```

**GradientScript version:**
```typescript
function normalized_dot(u∇: {x, y}, v∇: {x, y}) {
  dot = u.x * v.x + u.y * v.y
  u_mag = sqrt(u.x * u.x + u.y * u.y)
  v_mag = sqrt(v.x * v.x + v.y * v.y)
  return dot / (u_mag * v_mag)
}
```

**Generated gradient:**
```typescript
function normalized_dot_grad(u, v) {
  const dot = u.x * v.x + u.y * v.y;
  const u_mag = Math.sqrt(u.x * u.x + u.y * u.y);
  const v_mag = Math.sqrt(v.x * v.x + v.y * v.y);
  const value = dot / (u_mag * v_mag);

  const _tmp0 = u_mag * v_mag;
  const _tmp1 = 2 * u_mag;
  const _tmp2 = 2 * v_mag;
  const _tmp3 = _tmp0 * _tmp0;

  const du = {
    x: (v.x * _tmp0 - dot * u.x / _tmp1 * v_mag) / _tmp3,
    y: (v.y * _tmp0 - dot * u.y / _tmp1 * v_mag) / _tmp3,
  };
  const dv = {
    x: (u.x * _tmp0 - dot * u_mag * v.x / _tmp2) / _tmp3,
    y: (u.y * _tmp0 - dot * u_mag * v.y / _tmp2) / _tmp3,
  };

  return { value, du, dv };
}
```

### From JavaScript Robotics

**Original JavaScript angle between vectors:**
```javascript
function angleBetween(u, v) {
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  return Math.atan2(cross, dot);
}
```

**GradientScript version:**
```typescript
function angle_between(u∇: {x, y}, v∇: {x, y}) {
  cross = u.x * v.y - u.y * v.x
  dot = u.x * v.x + u.y * v.y
  return atan2(cross, dot)
}
```

**Generated gradient:**
```typescript
function angle_between_grad(u, v) {
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  const value = Math.atan2(cross, dot);

  const _tmp0 = dot * dot + cross * cross;

  const du = {
    x: (dot * v.y - cross * v.x) / _tmp0,
    y: (dot * (-v.x) - cross * v.y) / _tmp0,
  };
  const dv = {
    x: (dot * (-u.y) - cross * u.x) / _tmp0,
    y: (dot * u.x - cross * u.y) / _tmp0,
  };

  return { value, du, dv };
}
```

## Command Line Options

```bash
gradient-script <file.gs> [options]

Options:
  --format <format>              typescript (default), javascript, python, csharp
  --no-simplify                  Disable gradient simplification
  --no-cse                       Disable common subexpression elimination
  --no-comments                  Omit comments in generated code
  --guards                       Emit runtime guards for potential singularities
  --epsilon <value>              Epsilon value for guards (default: 1e-10)
  --csharp-float-type <type>     C# float precision: float (default) or double
  --help, -h                     Show help message
```

GradientScript automatically generates gradient functions for all functions in your `.gs` file.

**Examples:**
```bash
# Generate TypeScript (default)
gradient-script spring.gs

# Generate Python
gradient-script spring.gs --format python

# Generate JavaScript without CSE optimization
gradient-script spring.gs --format javascript --no-cse

# Generate C# for Unity/Godot (float precision)
gradient-script spring.gs --format csharp

# Generate C# with double precision
gradient-script spring.gs --format csharp --csharp-float-type double
```

## Language Syntax

### Function Declaration

```typescript
function name(param1∇: {x, y}, param2∇, param3) {
  local1 = expression
  local2 = expression
  return expression
}
```

- The `∇` symbol marks parameters that need gradients
- Type annotations `{x, y}` specify structured types
- Parameters without `∇` are treated as constants
- Use `=` for assignments, not `const` or `let`

### Structured Types

```typescript
// 2D vectors
u∇: {x, y}

// 3D vectors
v∇: {x, y, z}

// Scalars (no annotation)
param∇
```

### Built-in Functions

**Vector operations:**
- `dot2d(u, v)` - dot product (expands to `u.x*v.x + u.y*v.y`)
- `cross2d(u, v)` - 2D cross product (expands to `u.x*v.y - u.y*v.x`)
- `magnitude2d(v)` - vector length (expands to `sqrt(v.x*v.x + v.y*v.y)`)
- `normalize2d(v)` - unit vector

**Math functions:**
- `sqrt(x)`, `sin(x)`, `cos(x)`, `tan(x)`
- `asin(x)`, `acos(x)`, `atan(x)`
- `atan2(y, x)` - two-argument arctangent
- `exp(x)`, `log(x)`, `abs(x)`

**Non-smooth functions (with subgradients):**
- `min(a, b)` - minimum of two values
- `max(a, b)` - maximum of two values
- `clamp(x, lo, hi)` - clamp x to range [lo, hi]

**Operators:**
- Arithmetic: `+`, `-`, `*`, `/`
- Power: `x^2` (converts to `x * x` for better performance)
- Negation: `-x`

### Output Formats

**TypeScript (default):**
```typescript
const du = { x: expr1, y: expr2 };
```

**JavaScript:**
```javascript
const du = { x: expr1, y: expr2 };
```

**Python:**
```python
du = { "x": expr1, "y": expr2 }
```

## How It Works

GradientScript uses **symbolic differentiation** with the chain rule:

1. **Parse** your function into an expression tree
2. **Type inference** determines scalar vs structured gradients
3. **Symbolic differentiation** applies calculus rules (product rule, chain rule, etc.)
4. **Simplification** reduces complex expressions
5. **CSE optimization** eliminates redundant subexpressions
6. **Code generation** emits clean TypeScript/JavaScript/Python

### Common Subexpression Elimination (CSE)

GradientScript automatically factors out repeated expressions:

**Before CSE:**
```typescript
const du_x = v.x / sqrt(u.x*u.x + u.y*u.y) - dot * u.x / (2 * sqrt(u.x*u.x + u.y*u.y));
const du_y = v.y / sqrt(u.x*u.x + u.y*u.y) - dot * u.y / (2 * sqrt(u.x*u.x + u.y*u.y));
```

**After CSE:**
```typescript
const _tmp0 = Math.sqrt(u.x * u.x + u.y * u.y);
const _tmp1 = 2 * _tmp0;
const du = {
  x: v.x / _tmp0 - dot * u.x / _tmp1,
  y: v.y / _tmp0 - dot * u.y / _tmp1,
};
```

This improves both performance and readability.

### Non-Smooth Functions & Subgradients

GradientScript supports **non-smooth functions** (`min`, `max`, `clamp`) using **subgradient** differentiation. These are essential for constrained optimization, robust losses, and geometric queries.

**Example: Point-to-Segment Distance**
```typescript
function distance_point_segment(p∇: {x, y}, a: {x, y}, b: {x, y}) {
  vx = b.x - a.x
  vy = b.y - a.y
  wx = p.x - a.x
  wy = p.y - a.y
  t = (wx * vx + wy * vy) / (vx * vx + vy * vy)
  t_clamped = clamp(t, 0, 1)  // Project onto segment
  qx = a.x + t_clamped * vx
  qy = a.y + t_clamped * vy
  dx = p.x - qx
  dy = p.y - qy
  return sqrt(dx * dx + dy * dy)
}
```

Generated code correctly handles the non-smooth boundaries at segment endpoints:
```typescript
const t_clamped = Math.max(0, Math.min(1, t));  // clamp expansion
```

**How subgradients work:**
- At smooth points: standard gradient
- At non-smooth points (e.g., `min(a,b)` when `a=b`): any valid subgradient
- Converges for convex functions in optimization
- Common in L1 regularization, SVM, robust losses

**Use cases:**
- Constrained optimization (clamp parameters to valid ranges)
- Robust losses (Huber-like functions with min/max)
- Geometric queries (distance to segments, boxes, polytopes)
- Activation functions (ReLU = `max(0, x)`)

## Use Cases

- **Physics simulations** - Get force gradients for constraint solvers
- **Robotics** - Compute Jacobians for inverse kinematics
- **Machine learning** - Custom loss functions with analytical gradients
- **Computer graphics** - Optimize shader parameters
- **Game engines** - Procedural animation with gradient-based optimization
- **Scientific computing** - Sensitivity analysis and optimization

## Edge Case Detection

GradientScript analyzes your functions and warns about potential issues:

```
⚠️  EDGE CASE WARNINGS:

  • Division by zero (1 occurrence)
    Division by zero if denominator becomes zero
    💡 Add check: if (denominator === 0) return { value: 0, gradients: {...} };

  • Square root of negative (2 occurrences)
    magnitude of vector (uses sqrt internally)
    💡 Ensure vector components are valid
```

You can then add appropriate guards in your code that uses the generated functions.

## Architecture

GradientScript uses a **source-to-source compilation** approach with the following pipeline:

```
Input (.gs file)
  ↓
Lexer & Parser → AST
  ↓
Type Inference → Scalar vs Structured types
  ↓
Built-in Expansion → dot2d(), magnitude(), etc.
  ↓
Symbolic Differentiation → Product rule, chain rule, quotient rule
  ↓
Algebraic Simplification → 0.5*(a+a) → a, etc.
  ↓
CSE Optimization → Extract common subexpressions
  ↓
Code Generation → TypeScript/JavaScript/Python
  ↓
Output (gradient functions)
```

All gradient computations are verified against numerical differentiation to ensure correctness.

## Testing & Correctness

**Every gradient is automatically verified against numerical differentiation.**

GradientScript includes a comprehensive test suite that validates all generated gradients using finite differences. This means you can trust that the symbolic derivatives are mathematically correct.

```bash
npm test
```

Current status: **78 tests passing**

Test suite includes:

### Gradient Verification Tests
- **Numerical gradient checking**: All symbolic gradients compared against finite differences
- Basic scalar differentiation (power, product, chain rules)
- Structured type gradients (2D/3D vectors)
- Built-in function derivatives (sin, cos, atan2, sqrt, etc.)
- Complex compositions and chain rule applications

### Property-Based Tests
- **Singularity handling**: Near-zero denominators, parallel vectors, origin points
- **Rotation invariance**: Rotating inputs rotates gradients consistently
- **Scale invariance**: Functions like cosine similarity maintain invariance properties
- **Symmetry**: Distance function has symmetric gradients
- **Translation invariance**: Relative functions have zero gradient sum
- **SE(2) transformations**: Zero gradients at exact match, proper gradient direction
- **Reprojection invariants**: Uniform scaling maintains structure
- **Bearing properties**: Rotation shifts angle, gradient perpendicular to input

### Code Generation Tests
- CSE optimization correctness
- Operator precedence preservation
- Power optimization (x*x vs Math.pow)
- Multiple output formats (TypeScript, JavaScript, Python, C#)
- Algebraic simplification correctness

**Key guarantee**: If a test passes, the generated gradient is correct to within numerical precision (~10 decimal places).

## Comparison with Other Tools

| Feature | GradientScript | JAX/PyTorch | SymPy | Manual Math |
|---------|----------------|-------------|-------|-------------|
| **Output** | Clean source code | Tape/Graph | Symbolic expr | Pen & paper |
| **Runtime** | Zero overhead | Tape overhead | Symbolic eval | Zero |
| **Readability** | High | Low | Medium | High |
| **Structured types** | Native | Tensors only | Limited | Natural |
| **Integration** | Copy/paste code | Framework required | Eval strings | Type by hand |
| **Speed** | Native JS/TS/Py | JIT optimized | Slow | Native |
| **Debugging** | Standard debugger | Special tools | Hard | Standard |

## Contributing

GradientScript is under active development. Contributions welcome!

**Roadmap:**
- Property-based tests for mathematical invariants
- Additional output formats (C, Rust, GLSL)
- Web playground for live gradient generation
- Benchmarking suite

## Examples

See the `examples/` directory for complete examples:

- **Physics Constraints**: [`examples/PHYSICS_EXAMPLES.md`](examples/PHYSICS_EXAMPLES.md) - Comprehensive guide to using structured types for XPBD constraints, rigid body dynamics, and more
  - Raw (LLM-friendly): `https://raw.githubusercontent.com/mfagerlund/gradient-script/main/examples/PHYSICS_EXAMPLES.md`
- **XPBD Constraints**: `xpbd-rod-constraint.gs`, `xpbd-angle-constraint.gs`
- **Distance Functions**: `distance.gs`, `point-segment-distance.gs`
- **Geometry**: `triangle-area.gs`, `bearing.gs`, `circle-fit.gs`

**Try them:**
```bash
# View physics examples guide
cat examples/PHYSICS_EXAMPLES.md

# Generate TypeScript from XPBD rod constraint
gradient-script examples/xpbd-rod-constraint.gs

# Generate C# for Unity/Godot
gradient-script examples/xpbd-angle-constraint.gs --format csharp
```

## License

MIT

## Credits

Inspired by symbolic differentiation in SymPy, the ergonomics of JAX, and the practicality of writing math code by hand.
