/**
 * Symbolic differentiation engine.
 * Applies differentiation rules to AST and generates symbolic gradient expressions.
 * @internal
 */

import {
  ASTNode,
  ASTVisitor,
  NumberNode,
  VariableNode,
  BinaryOpNode,
  UnaryOpNode,
  FunctionCallNode,
  VectorAccessNode,
  VectorConstructorNode,
  Program,
  Assignment
} from './AST';

/**
 * Differentiate an AST node with respect to a variable
 */
export class DifferentiationVisitor implements ASTVisitor<ASTNode> {
  constructor(private wrt: string) {}

  visitNumber(node: NumberNode): ASTNode {
    // d/dx(c) = 0
    return new NumberNode(0);
  }

  visitVariable(node: VariableNode): ASTNode {
    // d/dx(x) = 1, d/dx(y) = 0
    return new NumberNode(node.name === this.wrt ? 1 : 0);
  }

  visitUnaryOp(node: UnaryOpNode): ASTNode {
    const inner = differentiate(node.operand, this.wrt);

    if (node.op === '-') {
      // d/dx(-f) = -df/dx
      return new UnaryOpNode('-', inner);
    } else {
      // d/dx(+f) = df/dx
      return inner;
    }
  }

  visitBinaryOp(node: BinaryOpNode): ASTNode {
    const u = node.left;
    const v = node.right;
    const du = differentiate(u, this.wrt);
    const dv = differentiate(v, this.wrt);

    switch (node.op) {
      case '+':
        // d/dx(u + v) = du/dx + dv/dx
        return new BinaryOpNode('+', du, dv);

      case '-':
        // d/dx(u - v) = du/dx - dv/dx
        return new BinaryOpNode('-', du, dv);

      case '*':
        // d/dx(u * v) = u * dv/dx + v * du/dx  (product rule)
        return new BinaryOpNode(
          '+',
          new BinaryOpNode('*', u, dv),
          new BinaryOpNode('*', v, du)
        );

      case '/':
        // d/dx(u / v) = (v * du/dx - u * dv/dx) / v^2  (quotient rule)
        return new BinaryOpNode(
          '/',
          new BinaryOpNode(
            '-',
            new BinaryOpNode('*', v, du),
            new BinaryOpNode('*', u, dv)
          ),
          new BinaryOpNode('**', v, new NumberNode(2))
        );

      case '**':
      case 'pow': {
        // d/dx(u^v) requires checking if v is constant or depends on x
        const vIsConstant = !dependsOn(v, this.wrt);
        const uIsConstant = !dependsOn(u, this.wrt);

        if (vIsConstant && uIsConstant) {
          // Both constant
          return new NumberNode(0);
        } else if (vIsConstant) {
          // d/dx(u^c) = c * u^(c-1) * du/dx  (power rule)
          return new BinaryOpNode(
            '*',
            new BinaryOpNode(
              '*',
              v,
              new BinaryOpNode('**', u, new BinaryOpNode('-', v, new NumberNode(1)))
            ),
            du
          );
        } else if (uIsConstant) {
          // d/dx(c^v) = c^v * ln(c) * dv/dx
          return new BinaryOpNode(
            '*',
            new BinaryOpNode(
              '*',
              new BinaryOpNode('**', u, v),
              new FunctionCallNode('log', [u])
            ),
            dv
          );
        } else {
          // d/dx(u^v) = u^v * (v' * ln(u) + v * u'/u)  (general power rule)
          return new BinaryOpNode(
            '*',
            new BinaryOpNode('**', u, v),
            new BinaryOpNode(
              '+',
              new BinaryOpNode('*', dv, new FunctionCallNode('log', [u])),
              new BinaryOpNode(
                '*',
                v,
                new BinaryOpNode('/', du, u)
              )
            )
          );
        }
      }

      default:
        throw new Error(`Unknown binary operator: ${node.op}`);
    }
  }

  visitFunctionCall(node: FunctionCallNode): ASTNode {
    // For single-argument functions, apply chain rule
    if (node.args.length === 1) {
      const arg = node.args[0];
      const darg = differentiate(arg, this.wrt);

      let derivative: ASTNode;

      switch (node.name) {
        case 'sin':
          // d/dx(sin(u)) = cos(u) * du/dx
          derivative = new FunctionCallNode('cos', [arg]);
          break;

        case 'cos':
          // d/dx(cos(u)) = -sin(u) * du/dx
          derivative = new UnaryOpNode('-', new FunctionCallNode('sin', [arg]));
          break;

        case 'tan':
          // d/dx(tan(u)) = sec^2(u) * du/dx = 1/cos^2(u) * du/dx
          derivative = new BinaryOpNode(
            '/',
            new NumberNode(1),
            new BinaryOpNode('**', new FunctionCallNode('cos', [arg]), new NumberNode(2))
          );
          break;

        case 'exp':
          // d/dx(exp(u)) = exp(u) * du/dx
          derivative = new FunctionCallNode('exp', [arg]);
          break;

        case 'log':
        case 'ln':
          // d/dx(ln(u)) = 1/u * du/dx
          derivative = new BinaryOpNode('/', new NumberNode(1), arg);
          break;

        case 'sqrt':
          // d/dx(sqrt(u)) = 1/(2*sqrt(u)) * du/dx
          derivative = new BinaryOpNode(
            '/',
            new NumberNode(1),
            new BinaryOpNode('*', new NumberNode(2), new FunctionCallNode('sqrt', [arg]))
          );
          break;

        case 'abs':
          // d/dx(|u|) = u/|u| * du/dx = sign(u) * du/dx
          derivative = new FunctionCallNode('sign', [arg]);
          break;

        case 'asin':
          // d/dx(asin(u)) = 1/sqrt(1 - u^2) * du/dx
          derivative = new BinaryOpNode(
            '/',
            new NumberNode(1),
            new FunctionCallNode('sqrt', [
              new BinaryOpNode('-', new NumberNode(1), new BinaryOpNode('**', arg, new NumberNode(2)))
            ])
          );
          break;

        case 'acos':
          // d/dx(acos(u)) = -1/sqrt(1 - u^2) * du/dx
          derivative = new UnaryOpNode(
            '-',
            new BinaryOpNode(
              '/',
              new NumberNode(1),
              new FunctionCallNode('sqrt', [
                new BinaryOpNode('-', new NumberNode(1), new BinaryOpNode('**', arg, new NumberNode(2)))
              ])
            )
          );
          break;

        case 'atan':
          // d/dx(atan(u)) = 1/(1 + u^2) * du/dx
          derivative = new BinaryOpNode(
            '/',
            new NumberNode(1),
            new BinaryOpNode('+', new NumberNode(1), new BinaryOpNode('**', arg, new NumberNode(2)))
          );
          break;

        case 'sinh':
          // d/dx(sinh(u)) = cosh(u) * du/dx
          derivative = new FunctionCallNode('cosh', [arg]);
          break;

        case 'cosh':
          // d/dx(cosh(u)) = sinh(u) * du/dx
          derivative = new FunctionCallNode('sinh', [arg]);
          break;

        case 'tanh':
          // d/dx(tanh(u)) = 1 - tanh^2(u) * du/dx
          derivative = new BinaryOpNode(
            '-',
            new NumberNode(1),
            new BinaryOpNode('**', new FunctionCallNode('tanh', [arg]), new NumberNode(2))
          );
          break;

        case 'sigmoid':
          // d/dx(sigmoid(u)) = sigmoid(u) * (1 - sigmoid(u)) * du/dx
          derivative = new BinaryOpNode(
            '*',
            new FunctionCallNode('sigmoid', [arg]),
            new BinaryOpNode('-', new NumberNode(1), new FunctionCallNode('sigmoid', [arg]))
          );
          break;

        case 'relu':
          // d/dx(relu(u)) = (u > 0 ? 1 : 0) * du/dx
          // For symbolic, we'll use a heaviside-like representation
          derivative = new FunctionCallNode('heaviside', [arg]);
          break;

        case 'sign':
          // d/dx(sign(u)) = 0 (almost everywhere)
          return new NumberNode(0);

        case 'floor':
        case 'ceil':
        case 'round':
          // d/dx(floor(u)) = 0 (almost everywhere)
          return new NumberNode(0);

        case 'magnitude': {
          // For Vec2/Vec3 magnitude: d/dx(|v|) = v.x/|v| * dv.x/dx + v.y/|v| * dv.y/dx + ...
          // arg is the vector
          if (arg.type === 'Variable') {
            const varName = (arg as VariableNode).name;
            // Assume 2D for now (can extend)
            const vx = new VectorAccessNode(arg, 'x');
            const vy = new VectorAccessNode(arg, 'y');
            const mag = new FunctionCallNode('magnitude', [arg]);

            // Check if differentiating w.r.t. x or y components
            if (this.wrt === `${varName}.x`) {
              return new BinaryOpNode('/', vx, mag);
            } else if (this.wrt === `${varName}.y`) {
              return new BinaryOpNode('/', vy, mag);
            }
          }
          throw new Error('magnitude differentiation requires vector variable');
        }

        case 'sqrMagnitude': {
          // d/dx(|v|^2) = 2*v.x * dv.x/dx + 2*v.y * dv.y/dx
          if (arg.type === 'Variable') {
            const varName = (arg as VariableNode).name;
            const vx = new VectorAccessNode(arg, 'x');

            if (this.wrt === `${varName}.x`) {
              return new BinaryOpNode('*', new NumberNode(2), vx);
            } else if (this.wrt === `${varName}.y`) {
              const vy = new VectorAccessNode(arg, 'y');
              return new BinaryOpNode('*', new NumberNode(2), vy);
            }
          }
          throw new Error('sqrMagnitude differentiation requires vector variable');
        }

        default:
          throw new Error(`Unknown function: ${node.name}`);
      }

      // Apply chain rule: f'(u) * u'
      return new BinaryOpNode('*', derivative, darg);
    }

    // Multi-argument functions
    if (node.args.length === 2) {
      const [arg1, arg2] = node.args;
      const darg1 = differentiate(arg1, this.wrt);
      const darg2 = differentiate(arg2, this.wrt);

      switch (node.name) {
        case 'pow':
          // Same as ** operator
          return differentiate(new BinaryOpNode('**', arg1, arg2), this.wrt);

        case 'min':
        case 'max':
          // Derivative is discontinuous at boundary - for symbolic we'll note it
          // d/dx(min(u,v)) = du/dx if u < v, dv/dx if v < u
          // For now, return a placeholder
          return new FunctionCallNode(`d_${node.name}`, [arg1, arg2, darg1, darg2]);

        case 'atan2': {
          // atan2(y, x): angle from positive x-axis to point (x, y)
          // ∂/∂y(atan2(y, x)) = x/(x² + y²)
          // ∂/∂x(atan2(y, x)) = -y/(x² + y²)
          const y = arg1;
          const x = arg2;
          const dy = darg1;
          const dx = darg2;

          // denominator: x² + y²
          const denom = new BinaryOpNode(
            '+',
            new BinaryOpNode('**', x, new NumberNode(2)),
            new BinaryOpNode('**', y, new NumberNode(2))
          );

          // Chain rule: (∂atan2/∂y) * dy + (∂atan2/∂x) * dx
          const term1 = new BinaryOpNode('*',
            new BinaryOpNode('/', x, denom),
            dy
          );
          const term2 = new BinaryOpNode('*',
            new UnaryOpNode('-', new BinaryOpNode('/', y, denom)),
            dx
          );

          return new BinaryOpNode('+', term1, term2);
        }

        case 'dot': {
          // dot product: u.x * v.x + u.y * v.y
          // d/dx(u.v) = du/dx . v + u . dv/dx
          return new BinaryOpNode(
            '+',
            new FunctionCallNode('dot', [darg1, arg2]),
            new FunctionCallNode('dot', [arg1, darg2])
          );
        }

        default:
          throw new Error(`Unknown 2-arg function: ${node.name}`);
      }
    }

    throw new Error(`Unsupported function arity: ${node.name} with ${node.args.length} args`);
  }

  visitVectorAccess(node: VectorAccessNode): ASTNode {
    // d/dx(v.y) = d(v.y)/dx
    // This depends on whether we're differentiating w.r.t. the vector component
    if (node.vector.type === 'Variable') {
      const varName = (node.vector as VariableNode).name;
      const fullName = `${varName}.${node.component}`;

      if (fullName === this.wrt) {
        return new NumberNode(1);
      } else {
        return new NumberNode(0);
      }
    }

    // For computed vectors, we'd need to differentiate the computation
    throw new Error('VectorAccess differentiation only supported for variable vectors');
  }

  visitVectorConstructor(node: VectorConstructorNode): ASTNode {
    // d/dx(Vec2(u, v)) = Vec2(du/dx, dv/dx)
    const diffComponents = node.components.map(c => differentiate(c, this.wrt));
    return new VectorConstructorNode(node.vectorType, diffComponents);
  }
}

/**
 * Check if an expression depends on a variable
 */
function dependsOn(node: ASTNode, varName: string): boolean {
  if (node.type === 'Number') {
    return false;
  }

  if (node.type === 'Variable') {
    return (node as VariableNode).name === varName;
  }

  if (node.type === 'UnaryOp') {
    return dependsOn((node as UnaryOpNode).operand, varName);
  }

  if (node.type === 'BinaryOp') {
    const binOp = node as BinaryOpNode;
    return dependsOn(binOp.left, varName) || dependsOn(binOp.right, varName);
  }

  if (node.type === 'FunctionCall') {
    return (node as FunctionCallNode).args.some(arg => dependsOn(arg, varName));
  }

  if (node.type === 'VectorAccess') {
    return dependsOn((node as VectorAccessNode).vector, varName);
  }

  if (node.type === 'VectorConstructor') {
    return (node as VectorConstructorNode).components.some(c => dependsOn(c, varName));
  }

  return false;
}

/**
 * Differentiate an AST node with respect to a variable
 */
export function differentiate(node: ASTNode, wrt: string): ASTNode {
  const visitor = new DifferentiationVisitor(wrt);
  return node.accept(visitor);
}

/**
 * Compute all gradients for a program
 */
export interface GradientResult {
  variable: string;
  gradient: ASTNode;
}

/**
 * Compute gradients of output w.r.t. all parameters
 */
export function computeGradients(program: Program, parameters: string[]): Map<string, ASTNode> {
  // Build a map of variable definitions
  const variableMap = new Map<string, ASTNode>();
  for (const assignment of program.assignments) {
    variableMap.set(assignment.variable, assignment.expression);
  }

  // Get the output expression
  const outputExpr = variableMap.get(program.output);
  if (!outputExpr) {
    throw new Error(`Output variable '${program.output}' not found`);
  }

  // Compute gradients using reverse-mode autodiff
  // Start with d(output)/d(output) = 1
  const gradients = new Map<string, ASTNode>();
  gradients.set(program.output, new NumberNode(1));

  // Reverse topological order
  const variables = program.assignments.map(a => a.variable).reverse();

  for (const variable of variables) {
    const expr = variableMap.get(variable)!;
    const grad = gradients.get(variable);

    if (!grad) continue; // No gradient flows to this variable

    // For each parameter that this expression depends on
    for (const param of parameters) {
      if (dependsOn(expr, param)) {
        const localGrad = differentiate(expr, param);

        // Chain rule: accumulate gradient
        const chainedGrad = new BinaryOpNode('*', grad, localGrad);

        const existing = gradients.get(param);
        if (existing) {
          gradients.set(param, new BinaryOpNode('+', existing, chainedGrad));
        } else {
          gradients.set(param, chainedGrad);
        }
      }
    }
  }

  return gradients;
}
