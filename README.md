# GradientScript

**Symbolic differentiation for structured types with a simple DSL**

Generate analytical gradient formulas from mathematical expressions, preserving your object structure (Vec2, Vec3, custom types) throughout.

## Philosophy

- ✅ **Structured types**: Work with `{x, y}` not individual scalars
- ✅ **User-defined functions**: Define operations once, reuse everywhere
- ✅ **LLM-friendly**: Translate your code → DSL → gradients → back to your code
- ✅ **Symbolic output**: Get formulas, not just numbers
- ✅ **Multiple targets**: Generate JS, Python, C++, GLSL, LaTeX

## Quick Example

```typescript
# Define vector operations
function dot(u: {x, y}, v: {x, y}) {
  return u.x * v.x + u.y * v.y
}

function cross2d(u: {x, y}, v: {x, y}) {
  return u.x * v.y - u.y * v.x
}

function angle_between(u: {x, y}, v: {x, y}) {
  return atan2(cross2d(u, v), dot(u, v))
}

# Compute something
output = angle_between(u, v)
```

**Generate gradients:**
```typescript
import { GradientScript } from 'gradient-script';

const gs = new GradientScript();
const result = gs.differentiate(code, ['u', 'v']);

console.log(result.gradients);
// {
//   u: { x: "...", y: "..." },  // Structured!
//   v: { x: "...", y: "..." }
// }
```

## Why Not Just Component-Wise?

**Before (tedious):**
```typescript
// Have to manually decompose
const input = `output = ux * vx + uy * vy`;
const grads = differentiate(input, ['ux', 'uy', 'vx', 'vy']);
// Now manually recompose into vectors...
```

**After (natural):**
```typescript
const input = `
  function dot(u: {x, y}, v: {x, y}) = u.x * v.x + u.y * v.y
  output = dot(u, v)
`;
const grads = differentiate(input, ['u', 'v']);
// Returns: { u: {x, y}, v: {x, y} } - structure preserved!
```

## Language Features

```typescript
# Comments
const PI = 3.14159  # Constants

# Types
type Vec2 = {x, y}
type Vec3 = {x, y, z}

# Functions
function square(x) = x * x

function magnitude(v: {x, y}) = sqrt(v.x * v.x + v.y * v.y)

# Multi-statement functions
function normalize(v: {x, y}) {
  let mag = magnitude(v)
  return {x: v.x / mag, y: v.y / mag}
}

# Built-in math
sin, cos, tan, exp, log, sqrt, abs, atan2, pow, min, max
```

## Use Cases

### 1. Robotics - Inverse Kinematics
```typescript
function forward_kinematics(theta1, theta2, l1, l2) {
  let x = l1 * cos(theta1) + l2 * cos(theta1 + theta2)
  let y = l1 * sin(theta1) + l2 * sin(theta1 + theta2)
  return {x, y}
}
```

### 2. Computer Graphics - Shader Optimization
```typescript
function pbr_lighting(normal: {x, y, z}, light: {x, y, z}) {
  let ndotl = max(dot(normal, light), 0)
  return pow(ndotl, 2.2)  # Gamma correction
}
```

### 3. Physics - Energy Gradients
```typescript
function kinetic_energy(v: {x, y}) {
  let speed_sq = v.x * v.x + v.y * v.y
  return 0.5 * mass * speed_sq
}
```

### 4. Machine Learning - Custom Loss Functions
```typescript
function custom_loss(pred: {x, y}, target: {x, y}) {
  let diff = {x: pred.x - target.x, y: pred.y - target.y}
  return magnitude(diff) + 0.1 * angle_penalty(pred, target)
}
```

## Workflow with LLMs

1. **You**: Paste your existing code (C++, Python, Unity, etc.)
2. **LLM**: Converts to GradientScript DSL
3. **GradientScript**: Returns structured gradients
4. **LLM**: Converts back to your original language/framework
5. **You**: Copy-paste gradient code, done!

## Output Formats

```typescript
gs.differentiate(code, params, {
  format: 'typescript',  // or 'python', 'cpp', 'glsl', 'latex'
  simplify: true,        // Algebraic simplification
  comments: 'math'       // Include ∂f/∂x annotations
});
```

**TypeScript output:**
```typescript
const grad_u = {
  x: (ux * vx + uy * vy) / denominator * vy,
  y: (ux * vx + uy * vy) / denominator * -vx
};
```

**Python output:**
```python
grad_u = {
    'x': (ux * vx + uy * vy) / denominator * vy,
    'y': (ux * vx + uy * vy) / denominator * -vx
}
```

**LaTeX output:**
```latex
\frac{\partial \theta}{\partial u_x} = \frac{(u \cdot v)}{|u|^2 + |v|^2} v_y
```

## Installation

```bash
npm install gradient-script
```

## Status

🚧 **In Active Development** 🚧

Currently porting from ScalarAutograd's symbolic differentiation system and redesigning around structured types.

- ✅ Parser (basic operators, functions)
- ✅ Symbolic differentiation engine
- ✅ Expression simplification
- ✅ JavaScript/TypeScript codegen
- 🚧 Structured type support
- 🚧 User-defined functions
- 📋 Python codegen
- 📋 C++ codegen
- 📋 GLSL codegen
- 📋 LaTeX output

## Prior Art

- **SymPy** (Python): Symbolic math but no structured types
- **Mathematica**: Powerful but proprietary, not code-focused
- **JAX/PyTorch Autograd**: Numerical, not symbolic
- **Enzyme (LLVM)**: Compiler-level AD, different use case

**GradientScript** focuses on: human-readable symbolic output + structured types + multi-language codegen.

## Architecture

```
src/
├── parser/          # Lexer + Parser → AST
├── types/           # Type system for {x,y} structs
├── functions/       # Function resolution & inlining
├── differentiation/ # Symbolic diff + chain rule
├── simplify/        # Algebraic simplification
└── codegen/         # Multi-target code generation
```

## Contributing

This is a new project! Design discussions welcome. See issues for current work.

## License

MIT

---

**Note**: Extracted from [ScalarAutograd](https://github.com/username/scalar-autograd) to be a focused, standalone tool for symbolic differentiation with structured types.
