/**
 * Expression parser for symbolic gradient generation.
 * Parses operator-overloaded mathematical expressions into AST.
 * @internal
 */

import {
  ASTNode,
  NumberNode,
  VariableNode,
  BinaryOpNode,
  UnaryOpNode,
  FunctionCallNode,
  VectorAccessNode,
  VectorConstructorNode,
  Assignment,
  Program
} from './AST';

/**
 * Token types for lexical analysis
 */
enum TokenType {
  NUMBER,
  IDENTIFIER,
  PLUS,
  MINUS,
  MULTIPLY,
  DIVIDE,
  POWER,
  LPAREN,
  RPAREN,
  DOT,
  COMMA,
  EQUALS,
  SEMICOLON,
  NEWLINE,
  EOF
}

interface Token {
  type: TokenType;
  value: string | number;
  pos: number;
}

/**
 * Lexer: converts text into tokens
 */
class Lexer {
  private pos = 0;
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  private peek(offset = 0): string {
    const pos = this.pos + offset;
    return pos < this.text.length ? this.text[pos] : '\0';
  }

  private advance(): string {
    const ch = this.peek();
    this.pos++;
    return ch;
  }

  private skipWhitespace(): void {
    while (this.peek() === ' ' || this.peek() === '\t' || this.peek() === '\r') {
      this.advance();
    }
  }

  private readNumber(): Token {
    const start = this.pos;
    let numStr = '';

    while (/[0-9.]/.test(this.peek())) {
      numStr += this.advance();
    }

    return { type: TokenType.NUMBER, value: parseFloat(numStr), pos: start };
  }

  private readIdentifier(): Token {
    const start = this.pos;
    let id = '';

    while (/[a-zA-Z0-9_]/.test(this.peek())) {
      id += this.advance();
    }

    return { type: TokenType.IDENTIFIER, value: id, pos: start };
  }

  nextToken(): Token {
    this.skipWhitespace();

    const ch = this.peek();
    const pos = this.pos;

    if (ch === '\0') {
      return { type: TokenType.EOF, value: '', pos };
    }

    if (ch === '\n') {
      this.advance();
      return { type: TokenType.NEWLINE, value: '\n', pos };
    }

    if (/[0-9]/.test(ch)) {
      return this.readNumber();
    }

    if (/[a-zA-Z_]/.test(ch)) {
      return this.readIdentifier();
    }

    // Single-character tokens
    this.advance();
    switch (ch) {
      case '+': return { type: TokenType.PLUS, value: '+', pos };
      case '-': return { type: TokenType.MINUS, value: '-', pos };
      case '*':
        // Check for **
        if (this.peek() === '*') {
          this.advance();
          return { type: TokenType.POWER, value: '**', pos };
        }
        return { type: TokenType.MULTIPLY, value: '*', pos };
      case '/': return { type: TokenType.DIVIDE, value: '/', pos };
      case '(': return { type: TokenType.LPAREN, value: '(', pos };
      case ')': return { type: TokenType.RPAREN, value: ')', pos };
      case '.': return { type: TokenType.DOT, value: '.', pos };
      case ',': return { type: TokenType.COMMA, value: ',', pos };
      case '=': return { type: TokenType.EQUALS, value: '=', pos };
      case ';': return { type: TokenType.SEMICOLON, value: ';', pos };
      default:
        throw new Error(`Unexpected character '${ch}' at position ${pos}`);
    }
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;

    do {
      token = this.nextToken();
      // Skip newlines and semicolons (treat as statement separators)
      if (token.type !== TokenType.NEWLINE && token.type !== TokenType.SEMICOLON) {
        tokens.push(token);
      }
    } while (token.type !== TokenType.EOF);

    return tokens;
  }
}

/**
 * Parser: converts tokens into AST
 * Grammar (precedence from lowest to highest):
 *   assignment   → IDENTIFIER '=' expression
 *   expression   → term (('+' | '-') term)*
 *   term         → factor (('*' | '/') factor)*
 *   factor       → power
 *   power        → postfix ('**' postfix)*
 *   postfix      → primary ('.' IDENTIFIER)*
 *   primary      → NUMBER | IDENTIFIER | function_call | vector_constructor | '(' expression ')' | ('+' | '-') primary
 *   function_call → IDENTIFIER '(' arg_list? ')'
 *   vector_constructor → ('Vec2' | 'Vec3') '(' arg_list ')'
 *   arg_list     → expression (',' expression)*
 */
export class Parser {
  private tokens: Token[];
  private current = 0;

  constructor(text: string) {
    const lexer = new Lexer(text);
    this.tokens = lexer.tokenize();
  }

  private peek(offset = 0): Token {
    const idx = this.current + offset;
    return idx < this.tokens.length ? this.tokens[idx] : this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== TokenType.EOF) {
      this.current++;
    }
    return token;
  }

  private expect(type: TokenType, message?: string): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(message || `Expected token type ${TokenType[type]}, got ${TokenType[token.type]} at position ${token.pos}`);
    }
    return this.advance();
  }

  /**
   * Parse a complete program
   */
  parseProgram(): Program {
    const assignments: Assignment[] = [];
    let outputVar = '';

    while (this.peek().type !== TokenType.EOF) {
      // Check if this is an assignment
      if (this.peek().type === TokenType.IDENTIFIER && this.peek(1).type === TokenType.EQUALS) {
        const varName = this.peek().value as string;
        this.advance(); // identifier
        this.advance(); // equals

        const expression = this.parseExpression();
        assignments.push({ variable: varName, expression });

        // Track the last assigned variable as potential output
        outputVar = varName;
      } else {
        // Standalone expression - treat as output
        const expression = this.parseExpression();
        // Generate a temporary output variable
        const tempVar = `_output${assignments.length}`;
        assignments.push({ variable: tempVar, expression });
        outputVar = tempVar;
      }
    }

    // Look for explicit "output" variable
    const outputAssignment = assignments.find(a => a.variable === 'output');
    if (outputAssignment) {
      outputVar = 'output';
    }

    return { assignments, output: outputVar };
  }

  /**
   * Parse an expression
   */
  private parseExpression(): ASTNode {
    return this.parseTerm();
  }

  /**
   * Parse term (addition/subtraction)
   */
  private parseTerm(): ASTNode {
    let left = this.parseFactor();

    while (this.peek().type === TokenType.PLUS || this.peek().type === TokenType.MINUS) {
      const op = this.advance().value as '+' | '-';
      const right = this.parseFactor();
      left = new BinaryOpNode(op, left, right);
    }

    return left;
  }

  /**
   * Parse factor (multiplication/division)
   */
  private parseFactor(): ASTNode {
    let left = this.parsePower();

    while (this.peek().type === TokenType.MULTIPLY || this.peek().type === TokenType.DIVIDE) {
      const op = this.advance().value as '*' | '/';
      const right = this.parsePower();
      left = new BinaryOpNode(op, left, right);
    }

    return left;
  }

  /**
   * Parse power (exponentiation)
   */
  private parsePower(): ASTNode {
    let left = this.parsePostfix();

    // Right-associative: 2**3**2 = 2**(3**2) = 512
    if (this.peek().type === TokenType.POWER) {
      this.advance();
      const right = this.parsePower(); // Recursive for right-associativity
      left = new BinaryOpNode('**', left, right);
    }

    return left;
  }

  /**
   * Parse postfix (member access like v.x)
   */
  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();

    while (this.peek().type === TokenType.DOT) {
      this.advance(); // consume '.'

      const member = this.expect(TokenType.IDENTIFIER, 'Expected component name after "."');
      const memberName = member.value as string;

      // Check if it's a vector component or method
      if (memberName === 'x' || memberName === 'y' || memberName === 'z') {
        node = new VectorAccessNode(node, memberName as 'x' | 'y' | 'z');
      } else if (memberName === 'magnitude' || memberName === 'sqrMagnitude' || memberName === 'normalized') {
        // These are property accesses that look like functions
        node = new FunctionCallNode(memberName, [node]);
      } else {
        // Method call (e.g., v.dot(u))
        this.expect(TokenType.LPAREN);
        const args = [node]; // First arg is the object itself
        args.push(...this.parseArgList());
        this.expect(TokenType.RPAREN);
        node = new FunctionCallNode(memberName, args);
      }
    }

    return node;
  }

  /**
   * Parse primary expression
   */
  private parsePrimary(): ASTNode {
    const token = this.peek();

    // Number literal
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return new NumberNode(token.value as number);
    }

    // Unary + or -
    if (token.type === TokenType.PLUS || token.type === TokenType.MINUS) {
      const op = this.advance().value as '+' | '-';
      const operand = this.parsePrimary();
      return new UnaryOpNode(op, operand);
    }

    // Parenthesized expression
    if (token.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN, 'Expected closing parenthesis');
      return expr;
    }

    // Identifier (variable, function call, or vector constructor)
    if (token.type === TokenType.IDENTIFIER) {
      const name = token.value as string;
      this.advance();

      // Check for function call or vector constructor
      if (this.peek().type === TokenType.LPAREN) {
        this.advance(); // consume '('
        const args = this.parseArgList();
        this.expect(TokenType.RPAREN, 'Expected closing parenthesis in function call');

        // Vector constructor
        if (name === 'Vec2' || name === 'Vec3') {
          return new VectorConstructorNode(name, args);
        }

        // Function call
        return new FunctionCallNode(name, args);
      }

      // Just a variable reference
      return new VariableNode(name);
    }

    throw new Error(`Unexpected token ${TokenType[token.type]} at position ${token.pos}`);
  }

  /**
   * Parse function argument list
   */
  private parseArgList(): ASTNode[] {
    const args: ASTNode[] = [];

    if (this.peek().type === TokenType.RPAREN) {
      return args; // Empty arg list
    }

    args.push(this.parseExpression());

    while (this.peek().type === TokenType.COMMA) {
      this.advance(); // consume comma
      args.push(this.parseExpression());
    }

    return args;
  }
}

/**
 * Parse a mathematical expression string into an AST
 */
export function parse(text: string): Program {
  const parser = new Parser(text);
  return parser.parseProgram();
}
