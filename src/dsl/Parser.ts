/**
 * Parser for GradientScript DSL
 * Parses function definitions with structured types
 */

import {
  Program,
  FunctionDef,
  Parameter,
  Statement,
  Assignment,
  Expression,
  NumberLiteral,
  Variable,
  BinaryOp,
  UnaryOp,
  FunctionCall,
  ComponentAccess,
  StructTypeAnnotation
} from './AST.js';
import { Token, TokenType, Lexer } from './Lexer.js';
import { ParseError } from './Errors.js';

export class Parser {
  private tokens: Token[];
  private current: number = 0;

  constructor(input: string) {
    const lexer = new Lexer(input);
    this.tokens = lexer.tokenize();
  }

  /**
   * Parse the entire program
   */
  parse(): Program {
    const functions: FunctionDef[] = [];

    while (!this.isAtEnd()) {
      functions.push(this.functionDef());
    }

    if (functions.length === 0) {
      const token = this.peek();
      throw new ParseError('Expected at least one function definition', token.line, token.column);
    }

    return {
      kind: 'program',
      functions
    };
  }

  /**
   * Parse function definition
   * function name(param1∇: {x, y}, param2) { ... }
   */
  private functionDef(): FunctionDef {
    this.consume(TokenType.FUNCTION, "Expected 'function'");

    const name = this.consume(TokenType.IDENTIFIER, 'Expected function name').value;

    this.consume(TokenType.LPAREN, "Expected '(' after function name");

    const parameters = this.parameterList();

    this.consume(TokenType.RPAREN, "Expected ')' after parameters");
    this.consume(TokenType.LBRACE, "Expected '{' before function body");

    const { body, returnExpr } = this.functionBody();

    this.consume(TokenType.RBRACE, "Expected '}' after function body");

    return {
      kind: 'function',
      name,
      parameters,
      body,
      returnExpr
    };
  }

  /**
   * Parse parameter list
   * param1∇: {x, y}, param2, param3∇
   */
  private parameterList(): Parameter[] {
    const params: Parameter[] = [];

    if (this.check(TokenType.RPAREN)) {
      return params; // Empty parameter list
    }

    do {
      params.push(this.parameter());
    } while (this.match(TokenType.COMMA));

    return params;
  }

  /**
   * Parse single parameter
   * name∇: {x, y} or name or name∇
   */
  private parameter(): Parameter {
    const nameToken = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
    const name = nameToken.value;

    // Check for ∇ (gradient annotation)
    const requiresGrad = this.match(TokenType.NABLA);

    // Check for type annotation : {x, y}
    let paramType: StructTypeAnnotation | undefined;
    if (this.match(TokenType.COLON)) {
      paramType = this.structTypeAnnotation();
    }

    return {
      name,
      requiresGrad,
      paramType
    };
  }

  /**
   * Parse struct type annotation
   * {x, y} or {x, y, z}
   */
  private structTypeAnnotation(): StructTypeAnnotation {
    this.consume(TokenType.LBRACE, "Expected '{'");

    const components: string[] = [];

    do {
      const comp = this.consume(TokenType.IDENTIFIER, 'Expected component name');
      components.push(comp.value);
    } while (this.match(TokenType.COMMA));

    this.consume(TokenType.RBRACE, "Expected '}'");

    return { components };
  }

  /**
   * Parse function body
   * sequence of assignments followed by return
   */
  private functionBody(): { body: Statement[]; returnExpr: Expression } {
    const body: Statement[] = [];

    // Parse statements until we hit return
    while (!this.check(TokenType.RETURN) && !this.check(TokenType.RBRACE)) {
      body.push(this.statement());
    }

    // Parse return statement
    this.consume(TokenType.RETURN, "Expected 'return' statement");
    const returnExpr = this.expression();

    return { body, returnExpr };
  }

  /**
   * Parse statement (currently only assignment)
   */
  private statement(): Statement {
    return this.assignment();
  }

  /**
   * Parse assignment
   * variable = expression
   */
  private assignment(): Assignment {
    const varToken = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
    const variable = varToken.value;
    this.consume(TokenType.EQUALS, "Expected '=' in assignment");
    const expression = this.expression();

    return {
      kind: 'assignment',
      variable,
      expression,
      loc: { line: varToken.line, column: varToken.column }
    };
  }

  /**
   * Parse expression
   */
  private expression(): Expression {
    return this.additive();
  }

  /**
   * Parse additive expression (+ and -)
   */
  private additive(): Expression {
    let expr = this.multiplicative();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.previous().value as '+' | '-';
      const right = this.multiplicative();
      expr = {
        kind: 'binary',
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  /**
   * Parse multiplicative expression (* and /)
   */
  private multiplicative(): Expression {
    let expr = this.power();

    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE)) {
      const opToken = this.previous();
      const operator = opToken.value as '*' | '/';
      const right = this.power();
      expr = {
        kind: 'binary',
        operator,
        left: expr,
        right,
        loc: { line: opToken.line, column: opToken.column }
      };
    }

    return expr;
  }

  /**
   * Parse power expression (^ and **)
   */
  private power(): Expression {
    let expr = this.unary();

    // Right-associative
    if (this.match(TokenType.POWER, TokenType.POWER_ALT)) {
      const operator = this.previous().type === TokenType.POWER ? '^' : '**';
      const right = this.power(); // Right-associative recursion
      expr = {
        kind: 'binary',
        operator,
        left: expr,
        right
      };
    }

    return expr;
  }

  /**
   * Parse unary expression (- and +)
   */
  private unary(): Expression {
    if (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous().value as '-' | '+';
      const operand = this.unary();
      return {
        kind: 'unary',
        operator,
        operand
      };
    }

    return this.postfix();
  }

  /**
   * Parse postfix expression (function calls and component access)
   */
  private postfix(): Expression {
    let expr = this.primary();

    while (true) {
      if (this.match(TokenType.LPAREN)) {
        // Function call
        const startLoc = expr.loc || { line: this.previous().line, column: this.previous().column };
        const args = this.argumentList();
        this.consume(TokenType.RPAREN, "Expected ')' after arguments");

        if (expr.kind !== 'variable') {
          const token = this.previous();
          throw new ParseError('Only simple function names are supported', token.line, token.column);
        }

        expr = {
          kind: 'call',
          name: expr.name,
          args,
          loc: startLoc
        };
      } else if (this.match(TokenType.DOT)) {
        // Component access
        const component = this.consume(TokenType.IDENTIFIER, 'Expected component name after "."').value;
        expr = {
          kind: 'component',
          object: expr,
          component
        };
      } else {
        break;
      }
    }

    return expr;
  }

  /**
   * Parse argument list for function call
   */
  private argumentList(): Expression[] {
    const args: Expression[] = [];

    if (this.check(TokenType.RPAREN)) {
      return args; // Empty argument list
    }

    do {
      args.push(this.expression());
    } while (this.match(TokenType.COMMA));

    return args;
  }

  /**
   * Parse primary expression
   */
  private primary(): Expression {
    // Number
    if (this.match(TokenType.NUMBER)) {
      const value = parseFloat(this.previous().value);
      return {
        kind: 'number',
        value
      };
    }

    // Variable
    if (this.match(TokenType.IDENTIFIER)) {
      const name = this.previous().value;
      return {
        kind: 'variable',
        name
      };
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      const expr = this.expression();
      this.consume(TokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    throw this.error(this.peek(), 'Expected expression');
  }

  // Helper methods

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance();
    throw this.error(this.peek(), message);
  }

  private error(token: Token, message: string): ParseError {
    return new ParseError(message, token.line, token.column, token.value);
  }
}

/**
 * Convenience function to parse input
 */
export function parse(input: string): Program {
  const parser = new Parser(input);
  return parser.parse();
}
