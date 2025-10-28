export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public column: number,
    public token?: string,
    public sourceContext?: string
  ) {
    super(`Parse error at ${line}:${column}: ${message}`);
    this.name = 'ParseError';
  }
}

/**
 * Format a user-friendly error message with source context
 */
export function formatParseError(
  error: ParseError,
  sourceCode: string,
  verbose: boolean = false
): string {
  const lines = sourceCode.split('\n');
  const errorLine = lines[error.line - 1];

  let output = `Error: ${error.message.replace(/^Parse error at \d+:\d+: /, '')}\n`;

  // Show the source line with the error
  if (errorLine) {
    output += `\n  ${errorLine}\n`;

    // Add caret pointing to error position
    const caretPos = Math.max(0, error.column - 1);
    output += `  ${' '.repeat(caretPos)}^\n`;
  }

  // Add helpful tips based on the error
  output += formatErrorGuidance(error);

  // Only show stack trace in verbose mode
  if (verbose && error.stack) {
    output += '\n\nStack trace:\n' + error.stack;
  }

  return output;
}

/**
 * Provide contextual guidance based on error patterns
 */
function formatErrorGuidance(error: ParseError): string {
  const msg = error.message.toLowerCase();
  const token = error.token;

  // Semicolon error
  if (token === ';') {
    return `
Semicolons are not part of gradient-script syntax.
Each statement should be on its own line.

Correct syntax:
  function example(x∇, y∇) {
    result = x + y
    return result
  }

💡 Tip: gradient-script uses newline-delimited statements (like Python),
        not semicolons (like JavaScript/C#).
`;
  }

  // Missing colon in type annotation
  if (msg.includes("expected ':'")) {
    return `
Type annotations require a colon before the type.

Correct syntax:
  function distance(point∇: {x, y}) {
                          ^

💡 Tip: Parameters marked with ∇ need type annotations to specify structure.
`;
  }

  // Missing gradient marker suggestion
  if (msg.includes('expected parameter name') || msg.includes('unexpected')) {
    return `
💡 Tip: Make sure all parameters are properly formatted.
        Variables that need gradients must be marked with ∇.

        Example: function f(a∇: {x, y}, b) { ... }
`;
  }

  return '';
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
