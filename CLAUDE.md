# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GradientScript is a source-to-source compiler that generates gradient functions from mathematical code. It performs symbolic automatic differentiation, producing clean TypeScript/JavaScript/Python/C# output rather than using runtime tape-based autodiff like JAX/PyTorch.

Key features:
- Structured types support (vectors like `{x, y}`)
- The `∇` symbol marks parameters needing gradients
- All generated gradients are verified against numerical differentiation
- Non-smooth functions (min, max, clamp) use subgradient differentiation

## Commands

```bash
# Build
npm run build

# Run all tests
npm test

# Run tests in watch mode
npx vitest

# Run a single test file
npx vitest test/dsl/parser.spec.ts

# Run tests matching a pattern
npx vitest -t "pattern"

# CLI usage (after build)
node dist/cli.js examples/distance.gs
node dist/cli.js examples/distance.gs --format python
node dist/cli.js examples/distance.gs --format csharp
```

## Architecture

### Compilation Pipeline

```
.gs file → Lexer → Parser → AST
    → Type Inference (scalar vs structured)
    → Built-in Expansion (dot2d, magnitude2d, etc.)
    → Symbolic Differentiation (chain/product/quotient rules)
    → Algebraic Simplification
    → CSE Optimization (common subexpression elimination)
    → Code Generation → output
```

### Core Modules (src/dsl/)

- **Lexer.ts/Parser.ts**: Parse `.gs` files into AST
- **AST.ts**: Node types - `FunctionDef`, `Expression`, `BinaryOp`, `FunctionCall`, etc.
- **Types.ts/TypeInference.ts**: Type system distinguishing scalars from structured types (`{x, y}`)
- **Differentiation.ts**: Core symbolic differentiation engine with `Differentiator` class
- **Expander.ts/BuiltIns.ts**: Expand vector operations (dot2d, magnitude2d) before differentiation
- **Inliner.ts**: Inline intermediate variables for differentiation
- **Simplify.ts**: Algebraic simplification (0+x→x, 1*x→x, etc.)
- **CSE.ts**: Extract repeated subexpressions into temporary variables
- **CodeGen.ts**: Emit TypeScript/JavaScript/Python/C# code
- **GradientChecker.ts**: Verify gradients against numerical finite differences

### Key Patterns

**Differentiation with structured types**: Parameters marked with `∇` and type annotation `{x, y}` get component-wise gradients. The `Differentiator` class handles `param.x`, `param.y` as separate variables.

**Built-in expansion**: Functions like `dot2d(u, v)` expand to `u.x*v.x + u.y*v.y` before differentiation, allowing the chain rule to apply naturally.

**Gradient verification**: Every gradient is checked against numerical differentiation at multiple test points with varying scales. The CLI exits with error if verification fails.

## GradientScript DSL Syntax

```typescript
function name(param1∇: {x, y}, param2∇, constant_param) {
  local = expression
  return expression
}
```

- `∇` marks parameters needing gradients
- `{x, y}` specifies structured types
- Operators: `+`, `-`, `*`, `/`, `^` (power)
- Built-ins: `sqrt`, `sin`, `cos`, `tan`, `atan2`, `exp`, `log`, `abs`, `min`, `max`, `clamp`
- Vector helpers: `dot2d`, `cross2d`, `magnitude2d`, `normalize2d`
