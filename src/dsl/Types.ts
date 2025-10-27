/**
 * Type system for GradientScript DSL
 * Handles scalar vs structured types and type inference
 */

/**
 * Represents a type in the DSL
 */
export type Type = ScalarType | StructType;

/**
 * Scalar type (numbers)
 */
export interface ScalarType {
  kind: 'scalar';
}

/**
 * Structured type with named components
 * e.g., {x, y} or {x, y, z}
 */
export interface StructType {
  kind: 'struct';
  components: string[]; // e.g., ['x', 'y'] or ['x', 'y', 'z']
}

/**
 * Type utilities
 */
export const Types = {
  scalar(): ScalarType {
    return { kind: 'scalar' };
  },

  struct(components: string[]): StructType {
    return { kind: 'struct', components };
  },

  vec2(): StructType {
    return { kind: 'struct', components: ['x', 'y'] };
  },

  vec3(): StructType {
    return { kind: 'struct', components: ['x', 'y', 'z'] };
  },

  isScalar(type: Type): type is ScalarType {
    return type.kind === 'scalar';
  },

  isStruct(type: Type): type is StructType {
    return type.kind === 'struct';
  },

  equals(a: Type, b: Type): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'scalar') return true;

    const aStruct = a as StructType;
    const bStruct = b as StructType;

    if (aStruct.components.length !== bStruct.components.length) return false;

    return aStruct.components.every((comp, i) => comp === bStruct.components[i]);
  },

  toString(type: Type): string {
    if (type.kind === 'scalar') return 'scalar';
    return `{${type.components.join(', ')}}`;
  },

  /**
   * Check if two types are compatible for binary operations
   */
  compatible(a: Type, b: Type): boolean {
    // scalar + scalar = ok
    if (a.kind === 'scalar' && b.kind === 'scalar') return true;

    // struct + struct = ok if same structure
    if (a.kind === 'struct' && b.kind === 'struct') {
      return Types.equals(a, b);
    }

    // scalar + struct = ok (broadcasting)
    if (a.kind === 'scalar' || b.kind === 'scalar') return true;

    return false;
  },

  /**
   * Result type of binary operation
   */
  binaryResultType(a: Type, b: Type, op: string): Type {
    // scalar op scalar = scalar
    if (a.kind === 'scalar' && b.kind === 'scalar') {
      return Types.scalar();
    }

    // struct op struct = struct (element-wise)
    if (a.kind === 'struct' && b.kind === 'struct') {
      if (!Types.equals(a, b)) {
        throw new Error(`Type mismatch: cannot perform ${op} on ${Types.toString(a)} and ${Types.toString(b)}`);
      }
      return a;
    }

    // scalar op struct = struct (broadcasting)
    if (a.kind === 'scalar' && b.kind === 'struct') return b;
    if (a.kind === 'struct' && b.kind === 'scalar') return a;

    throw new Error(`Invalid types for ${op}: ${Types.toString(a)} and ${Types.toString(b)}`);
  },

  /**
   * Result type of unary operation
   */
  unaryResultType(type: Type, op: string): Type {
    return type; // Unary ops preserve type
  }
};

/**
 * Type environment for tracking variable types
 */
export class TypeEnv {
  private types: Map<string, Type> = new Map();

  set(name: string, type: Type): void {
    this.types.set(name, type);
  }

  get(name: string): Type | undefined {
    return this.types.get(name);
  }

  has(name: string): boolean {
    return this.types.has(name);
  }

  clone(): TypeEnv {
    const env = new TypeEnv();
    env.types = new Map(this.types);
    return env;
  }

  getOrThrow(name: string): Type {
    const type = this.get(name);
    if (!type) {
      throw new Error(`Variable '${name}' is not defined`);
    }
    return type;
  }
}
