import { describe, it, expect } from 'vitest';
import {
  ParseError,
  TypeError,
  DifferentiationError,
  CodeGenError,
  formatParseError
} from '../../src/dsl/Errors';

describe('Error Classes', () => {
  describe('ParseError', () => {
    it('should create parse error with correct message', () => {
      const error = new ParseError('unexpected token', 5, 10, ';');
      expect(error.message).toBe('Parse error at 5:10: unexpected token');
      expect(error.line).toBe(5);
      expect(error.column).toBe(10);
      expect(error.token).toBe(';');
      expect(error.name).toBe('ParseError');
    });

    it('should handle parse error without token', () => {
      const error = new ParseError('syntax error', 1, 1);
      expect(error.message).toBe('Parse error at 1:1: syntax error');
      expect(error.token).toBeUndefined();
    });

    it('should include source context when provided', () => {
      const error = new ParseError('error', 3, 5, 'bad', 'some context');
      expect(error.sourceContext).toBe('some context');
    });
  });

  describe('TypeError', () => {
    it('should create type error with basic message', () => {
      const error = new TypeError('incompatible types', 'x + y');
      expect(error.message).toBe("Type error in 'x + y': incompatible types");
      expect(error.expression).toBe('x + y');
      expect(error.name).toBe('TypeError');
    });

    it('should include expected and actual types', () => {
      const error = new TypeError(
        'type mismatch',
        'a * b',
        'scalar',
        '{x, y}'
      );
      expect(error.message).toBe(
        "Type error in 'a * b': type mismatch (expected scalar, got {x, y})"
      );
      expect(error.expectedType).toBe('scalar');
      expect(error.actualType).toBe('{x, y}');
    });

    it('should handle missing expected/actual types', () => {
      const error = new TypeError('error', 'expr', 'scalar', undefined);
      expect(error.message).toBe("Type error in 'expr': error");
    });
  });

  describe('DifferentiationError', () => {
    it('should create differentiation error with basic message', () => {
      const error = new DifferentiationError('cannot differentiate', 'complex_op');
      expect(error.message).toBe("Differentiation error for 'complex_op': cannot differentiate");
      expect(error.operation).toBe('complex_op');
      expect(error.name).toBe('DifferentiationError');
    });

    it('should include reason when provided', () => {
      const error = new DifferentiationError(
        'not supported',
        'normalize2d',
        'Vector normalization requires special handling'
      );
      expect(error.message).toBe(
        "Differentiation error for 'normalize2d': not supported - Vector normalization requires special handling"
      );
      expect(error.reason).toBe('Vector normalization requires special handling');
    });

    it('should handle missing reason', () => {
      const error = new DifferentiationError('error', 'op');
      expect(error.reason).toBeUndefined();
    });
  });

  describe('CodeGenError', () => {
    it('should create code gen error with basic message', () => {
      const error = new CodeGenError('invalid node', 'ExprNode');
      expect(error.message).toBe("Code generation error for 'ExprNode': invalid node");
      expect(error.node).toBe('ExprNode');
      expect(error.name).toBe('CodeGenError');
    });

    it('should include format when provided', () => {
      const error = new CodeGenError('unsupported', 'ComplexExpr', 'python');
      expect(error.message).toBe(
        "Code generation error for 'ComplexExpr': unsupported (format: python)"
      );
      expect(error.format).toBe('python');
    });

    it('should handle missing format', () => {
      const error = new CodeGenError('error', 'node');
      expect(error.format).toBeUndefined();
    });
  });
});

describe('Error Formatting', () => {
  describe('formatParseError', () => {
    it('should format error with source context', () => {
      const sourceCode = `function test(a∇) {
  return a * 2;
}`;
      const error = new ParseError('unexpected semicolon', 2, 16, ';');
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Error: unexpected semicolon');
      expect(formatted).toContain('return a * 2;');
      expect(formatted).toContain('^');
    });

    it('should position caret correctly', () => {
      const sourceCode = 'function test(x) { }';
      const error = new ParseError('error', 1, 15);
      const formatted = formatParseError(error, sourceCode);

      // Caret should be at position 14 (column 15 - 1)
      const lines = formatted.split('\n');
      const caretLine = lines.find(line => line.includes('^'));
      expect(caretLine).toBeDefined();
      // Count spaces before caret
      const spacesBeforeCaret = caretLine!.match(/^\s*/)?.[0].length || 0;
      expect(spacesBeforeCaret).toBe(14 + 2); // +2 for the "  " prefix
    });

    it('should provide guidance for semicolon errors', () => {
      const sourceCode = 'return a;';
      const error = new ParseError('unexpected token', 1, 9, ';');
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Semicolons are not part of gradient-script syntax');
      expect(formatted).toContain('newline-delimited statements');
    });

    it('should provide guidance for missing colon errors', () => {
      const sourceCode = 'function f(x∇ {y}) {}';
      const error = new ParseError("expected ':'", 1, 14);
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Type annotations require a colon');
      expect(formatted).toContain('point∇: {x, y}');
    });

    it('should provide general guidance for parameter errors', () => {
      const sourceCode = 'function f(!!!) {}';
      const error = new ParseError('expected parameter name', 1, 12);
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Make sure all parameters are properly formatted');
      expect(formatted).toContain('marked with ∇');
    });

    it('should not include stack trace by default', () => {
      const sourceCode = 'test code';
      const error = new ParseError('error', 1, 1);
      const formatted = formatParseError(error, sourceCode, false);

      expect(formatted).not.toContain('Stack trace:');
    });

    it('should include stack trace in verbose mode', () => {
      const sourceCode = 'test code';
      const error = new ParseError('error', 1, 1);
      // Ensure error has a stack
      Error.captureStackTrace(error, ParseError);
      const formatted = formatParseError(error, sourceCode, true);

      expect(formatted).toContain('Stack trace:');
    });

    it('should handle missing error line gracefully', () => {
      const sourceCode = 'line 1\nline 2';
      const error = new ParseError('error', 10, 5); // Line 10 doesn't exist
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Error: error');
      // Should not crash
    });

    it('should handle column position at start of line', () => {
      const sourceCode = 'return x';
      const error = new ParseError('error', 1, 1);
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('return x');
      expect(formatted).toContain('^');
      // Caret should be at the beginning (after the "  " prefix)
    });

    it('should strip "Parse error at" prefix from message', () => {
      const sourceCode = 'test';
      const error = new ParseError('bad token', 1, 1);
      const formatted = formatParseError(error, sourceCode);

      expect(formatted).toContain('Error: bad token');
      expect(formatted).not.toMatch(/Error: Parse error at \d+:\d+:/);
    });
  });
});
