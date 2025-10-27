/**
 * Built-in functions for GradientScript DSL
 * Defines dot2d, cross2d, magnitude2d, etc.
 */

import { Type, Types } from './Types.js';

/**
 * Information about function discontinuities
 */
export interface DiscontinuityInfo {
  description: string;
  condition: string; // Human-readable condition where discontinuity occurs
}

/**
 * Signature of a built-in function
 */
export interface BuiltInSignature {
  name: string;
  params: Type[];
  returnType: Type;
  implementation?: (args: any[]) => any; // For runtime evaluation
  discontinuities?: DiscontinuityInfo[]; // Known discontinuities
}

/**
 * Registry of all built-in functions
 */
export class BuiltInRegistry {
  private functions: Map<string, BuiltInSignature[]> = new Map();

  constructor() {
    this.registerAll();
  }

  /**
   * Register all built-in functions
   */
  private registerAll(): void {
    // 2D operations
    this.register({
      name: 'dot2d',
      params: [Types.vec2(), Types.vec2()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'cross2d',
      params: [Types.vec2(), Types.vec2()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'magnitude2d',
      params: [Types.vec2()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'normalize2d',
      params: [Types.vec2()],
      returnType: Types.vec2()
    });

    this.register({
      name: 'distance2d',
      params: [Types.vec2(), Types.vec2()],
      returnType: Types.scalar()
    });

    // 3D operations
    this.register({
      name: 'dot3d',
      params: [Types.vec3(), Types.vec3()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'cross3d',
      params: [Types.vec3(), Types.vec3()],
      returnType: Types.vec3()
    });

    this.register({
      name: 'magnitude3d',
      params: [Types.vec3()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'normalize3d',
      params: [Types.vec3()],
      returnType: Types.vec3()
    });

    // Math functions (scalar only)
    const scalarMath = [
      'sin', 'cos', 'tan',
      'asin', 'acos', 'atan',
      'exp', 'log', 'sqrt',
      'abs'
    ];

    for (const name of scalarMath) {
      this.register({
        name,
        params: [Types.scalar()],
        returnType: Types.scalar()
      });
    }

    // Binary math functions
    this.register({
      name: 'atan2',
      params: [Types.scalar(), Types.scalar()],
      returnType: Types.scalar(),
      discontinuities: [{
        description: 'Branch cut discontinuity',
        condition: 'x < 0 and y ≈ 0 (near ±180°)'
      }]
    });

    this.register({
      name: 'pow',
      params: [Types.scalar(), Types.scalar()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'min',
      params: [Types.scalar(), Types.scalar()],
      returnType: Types.scalar()
    });

    this.register({
      name: 'max',
      params: [Types.scalar(), Types.scalar()],
      returnType: Types.scalar(),
      discontinuities: [{
        description: 'Non-smooth at equality',
        condition: 'a = b'
      }]
    });

    this.register({
      name: 'clamp',
      params: [Types.scalar(), Types.scalar(), Types.scalar()],
      returnType: Types.scalar(),
      discontinuities: [{
        description: 'Non-smooth at boundaries',
        condition: 'x = min or x = max'
      }]
    });
  }

  /**
   * Register a built-in function
   */
  register(sig: BuiltInSignature): void {
    if (!this.functions.has(sig.name)) {
      this.functions.set(sig.name, []);
    }
    this.functions.get(sig.name)!.push(sig);
  }

  /**
   * Look up a built-in function by name and argument types
   */
  lookup(name: string, argTypes: Type[]): BuiltInSignature | undefined {
    const overloads = this.functions.get(name);
    if (!overloads) return undefined;

    // Find matching overload
    for (const sig of overloads) {
      if (this.matchesSignature(argTypes, sig.params)) {
        return sig;
      }
    }

    return undefined;
  }

  /**
   * Check if argument types match parameter types
   */
  private matchesSignature(argTypes: Type[], paramTypes: Type[]): boolean {
    if (argTypes.length !== paramTypes.length) return false;

    return argTypes.every((argType, i) => {
      return Types.equals(argType, paramTypes[i]);
    });
  }

  /**
   * Check if a function is built-in
   */
  isBuiltIn(name: string): boolean {
    return this.functions.has(name);
  }

  /**
   * Get all overloads for a function name
   */
  getOverloads(name: string): BuiltInSignature[] {
    return this.functions.get(name) || [];
  }

  /**
   * Get discontinuity information for a function
   */
  getDiscontinuities(name: string): DiscontinuityInfo[] {
    const overloads = this.functions.get(name);
    if (!overloads) return [];

    const discontinuities: DiscontinuityInfo[] = [];
    for (const sig of overloads) {
      if (sig.discontinuities) {
        discontinuities.push(...sig.discontinuities);
      }
    }
    return discontinuities;
  }
}

// Global built-in registry instance
export const builtIns = new BuiltInRegistry();
