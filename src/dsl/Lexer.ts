/**
 * Lexer for GradientScript DSL
 * Tokenizes input with support for ∇, ^, **, and structured types
 */

export enum TokenType {
  // Literals
  NUMBER = 'NUMBER',
  IDENTIFIER = 'IDENTIFIER',

  // Keywords
  FUNCTION = 'FUNCTION',
  RETURN = 'RETURN',

  // Operators
  PLUS = 'PLUS',           // +
  MINUS = 'MINUS',         // -
  MULTIPLY = 'MULTIPLY',   // *
  DIVIDE = 'DIVIDE',       // /
  POWER = 'POWER',         // ^
  POWER_ALT = 'POWER_ALT', // **
  NABLA = 'NABLA',         // ∇

  // Delimiters
  LPAREN = 'LPAREN',       // (
  RPAREN = 'RPAREN',       // )
  LBRACE = 'LBRACE',       // {
  RBRACE = 'RBRACE',       // }
  COMMA = 'COMMA',         // ,
  COLON = 'COLON',         // :
  DOT = 'DOT',             // .
  EQUALS = 'EQUALS',       // =

  // Special
  NEWLINE = 'NEWLINE',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class Lexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(input: string) {
    this.input = input;
  }

  /**
   * Get all tokens
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token = this.nextToken();

    while (token.type !== TokenType.EOF) {
      if (token.type !== TokenType.NEWLINE) {
        // Skip newlines for now (treat as whitespace)
        tokens.push(token);
      }
      token = this.nextToken();
    }

    tokens.push(token); // EOF token
    return tokens;
  }

  /**
   * Get next token
   */
  nextToken(): Token {
    this.skipWhitespace();

    if (this.isAtEnd()) {
      return this.makeToken(TokenType.EOF, '');
    }

    const char = this.peek();
    const line = this.line;
    const column = this.column;

    // Numbers
    if (this.isDigit(char)) {
      return this.number();
    }

    // Identifiers and keywords
    if (this.isAlpha(char)) {
      return this.identifier();
    }

    // Single character tokens
    switch (char) {
      case '+':
        this.advance();
        return { type: TokenType.PLUS, value: '+', line, column };
      case '-':
        this.advance();
        return { type: TokenType.MINUS, value: '-', line, column };
      case '/':
        this.advance();
        return { type: TokenType.DIVIDE, value: '/', line, column };
      case '(':
        this.advance();
        return { type: TokenType.LPAREN, value: '(', line, column };
      case ')':
        this.advance();
        return { type: TokenType.RPAREN, value: ')', line, column };
      case '{':
        this.advance();
        return { type: TokenType.LBRACE, value: '{', line, column };
      case '}':
        this.advance();
        return { type: TokenType.RBRACE, value: '}', line, column };
      case ',':
        this.advance();
        return { type: TokenType.COMMA, value: ',', line, column };
      case ':':
        this.advance();
        return { type: TokenType.COLON, value: ':', line, column };
      case '.':
        this.advance();
        return { type: TokenType.DOT, value: '.', line, column };
      case '=':
        this.advance();
        return { type: TokenType.EQUALS, value: '=', line, column };
      case '^':
        this.advance();
        return { type: TokenType.POWER, value: '^', line, column };
      case '∇':
        this.advance();
        return { type: TokenType.NABLA, value: '∇', line, column };
      case '*':
        this.advance();
        if (this.peek() === '*') {
          this.advance();
          return { type: TokenType.POWER_ALT, value: '**', line, column };
        }
        return { type: TokenType.MULTIPLY, value: '*', line, column };
      case '\n':
        this.advance();
        return { type: TokenType.NEWLINE, value: '\n', line, column };
    }

    throw new Error(`Unexpected character '${char}' at line ${line}, column ${column}`);
  }

  private number(): Token {
    const line = this.line;
    const column = this.column;
    let value = '';

    while (this.isDigit(this.peek())) {
      value += this.advance();
    }

    // Handle decimal point
    if (this.peek() === '.' && this.isDigit(this.peekNext())) {
      value += this.advance(); // consume '.'

      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Handle scientific notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      value += this.advance(); // consume 'e'

      if (this.peek() === '+' || this.peek() === '-') {
        value += this.advance();
      }

      while (this.isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return { type: TokenType.NUMBER, value, line, column };
  }

  private identifier(): Token {
    const line = this.line;
    const column = this.column;
    let value = '';

    while (this.isAlphaNumeric(this.peek())) {
      value += this.advance();
    }

    // Check for keywords
    let type = TokenType.IDENTIFIER;
    if (value === 'function') {
      type = TokenType.FUNCTION;
    } else if (value === 'return') {
      type = TokenType.RETURN;
    }

    return { type, value, line, column };
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (char === ' ' || char === '\r' || char === '\t') {
        this.advance();
      } else if (char === '/' && this.peekNext() === '/') {
        // Skip single-line comment
        while (this.peek() !== '\n' && !this.isAtEnd()) {
          this.advance();
        }
      } else if (char === '\n') {
        // Don't skip newlines here - they're tokens
        break;
      } else {
        break;
      }
    }
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0';
    return this.input[this.position];
  }

  private peekNext(): string {
    if (this.position + 1 >= this.input.length) return '\0';
    return this.input[this.position + 1];
  }

  private advance(): string {
    const char = this.input[this.position++];
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private isAtEnd(): boolean {
    return this.position >= this.input.length;
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlpha(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char === '_';
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }

  private makeToken(type: TokenType, value: string): Token {
    return {
      type,
      value,
      line: this.line,
      column: this.column
    };
  }
}

/**
 * Convenience function to tokenize input
 */
export function tokenize(input: string): Token[] {
  const lexer = new Lexer(input);
  return lexer.tokenize();
}
