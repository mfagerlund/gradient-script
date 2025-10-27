export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public token?: string
  ) {
    super(`Parse error at ${line}:${column}: ${message}`);
    this.name = 'ParseError';
  }
}

export class TypeError extends Error {
  constructor(
    message: string,
    public expression: string,
    public expectedType?: string,
    public actualType?: string
  ) {
    const typeInfo = expectedType && actualType
      ? ` (expected ${expectedType}, got ${actualType})`
      : '';
    super(`Type error in '${expression}': ${message}${typeInfo}`);
    this.name = 'TypeError';
  }
}

export class DifferentiationError extends Error {
  constructor(
    message: string,
    public operation: string,
    public reason?: string
  ) {
    const reasonInfo = reason ? ` - ${reason}` : '';
    super(`Differentiation error for '${operation}': ${message}${reasonInfo}`);
    this.name = 'DifferentiationError';
  }
}

export class CodeGenError extends Error {
  constructor(
    message: string,
    public node: string,
    public format?: string
  ) {
    const formatInfo = format ? ` (format: ${format})` : '';
    super(`Code generation error for '${node}': ${message}${formatInfo}`);
    this.name = 'CodeGenError';
  }
}
