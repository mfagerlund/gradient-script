#!/usr/bin/env node

import { readFileSync } from 'fs';
import { parse } from './dsl/Parser.js';
import { inferFunction } from './dsl/TypeInference.js';
import { computeFunctionGradients } from './dsl/Differentiation.js';
import { generateComplete } from './dsl/CodeGen.js';
import type { CodeGenOptions } from './dsl/CodeGen.js';
import { analyzeGuards, formatGuardWarnings } from './dsl/Guards.js';
import { ParseError, formatParseError } from './dsl/Errors.js';
import { GradientChecker, formatGradCheckResult } from './dsl/GradientChecker.js';
import { Types } from './dsl/Types.js';
import type { FunctionDef, Parameter } from './dsl/AST.js';
import type { TypeEnv } from './dsl/Types.js';

/**
 * Generate random test points for gradient verification.
 * Uses multiple test points to catch errors at different values.
 */
function generateTestPoints(func: FunctionDef, env: TypeEnv): Map<string, number | Record<string, number>>[] {
  const testPoints: Map<string, number | Record<string, number>>[] = [];

  // Generate 3 different test points with varying scales
  const scales = [1.0, 0.1, 10.0];

  for (const scale of scales) {
    const point = new Map<string, number | Record<string, number>>();

    for (const param of func.parameters) {
      const paramType = env.getOrThrow(param.name);

      if (Types.isScalar(paramType)) {
        // Random scalar in range [-scale, scale], avoid zero
        point.set(param.name, (Math.random() * 2 - 1) * scale + 0.1 * scale);
      } else {
        // Structured type - get components
        const struct: Record<string, number> = {};
        for (const comp of paramType.components) {
          struct[comp] = (Math.random() * 2 - 1) * scale + 0.1 * scale;
        }
        point.set(param.name, struct);
      }
    }

    testPoints.push(point);
  }

  return testPoints;
}

/**
 * Verify gradients for a function using numerical differentiation.
 * Returns true if all gradients pass, false otherwise.
 */
function verifyGradients(func: FunctionDef, gradients: ReturnType<typeof computeFunctionGradients>, env: TypeEnv): boolean {
  const checker = new GradientChecker(1e-5, 1e-4);
  const testPoints = generateTestPoints(func, env);

  let allPassed = true;

  for (let i = 0; i < testPoints.length; i++) {
    const result = checker.check(func, gradients, env, testPoints[i]);

    if (!result.passed) {
      if (allPassed) {
        // First failure - print header (as comment for valid output)
        console.error(`// Gradient verification FAILED for "${func.name}":`);
      }
      // Prefix each line with // so output remains valid code
      const formattedResult = formatGradCheckResult(result, func.name)
        .split('\n')
        .map(line => '// ' + line)
        .join('\n');
      console.error(`//   Test point ${i + 1}: ${formattedResult}`);
      allPassed = false;
    }
  }

  if (allPassed) {
    const result = checker.check(func, gradients, env, testPoints[0]);
    // Prefix with // so output is valid code
    console.error('// ' + formatGradCheckResult(result, func.name));
  }

  return allPassed;
}

function printUsage() {
  console.log(`
GradientScript - Symbolic Differentiation for Structured Types

Usage:
  gradient-script <file.gs> [options]

Options:
  --format <format>     Output format: typescript (default), javascript, python, csharp
  --no-simplify         Disable gradient simplification
  --no-cse              Disable common subexpression elimination
  --egraph              Use e-graph optimization instead of CSE (experimental)
  --no-comments         Omit comments in generated code
  --guards              Emit runtime guards for division by zero (experimental)
  --epsilon <value>     Epsilon value for guards (default: 1e-10)
  --csharp-float-type <type>   C# float precision: float (default) or double
  --help, -h            Show this help message

Examples:
  gradient-script angle.gs
  gradient-script angle.gs --format python
  gradient-script angle.gs --format javascript --no-comments
  gradient-script angle.gs --format csharp

Input File Format (.gs):
  function name(param1∇: {x, y}, param2∇) {
    // intermediate calculations
    local = expression
    return expression
  }

  The ∇ symbol marks parameters that need gradients computed.
  Type annotations like {x, y} specify structured types.
  All functions in the file are processed automatically.

For more information and examples:
  https://github.com/mfagerlund/gradient-script

  README (raw, LLM-friendly):
  https://raw.githubusercontent.com/mfagerlund/gradient-script/main/README.md
  `.trim());
}
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const inputFile = args[0];

  if (!inputFile.endsWith('.gs')) {
    console.error('Error: Input file must have .gs extension');
    process.exit(1);
  }

  const options: CodeGenOptions = {
    format: 'typescript',
    includeComments: true,
    simplify: true,
    cse: true
  };

  let skipVerify = false;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--format') {
      if (i + 1 >= args.length) {
        console.error('Error: Missing value for --format');
        process.exit(1);
      }
      const format = args[++i];
      if (format !== 'typescript' && format !== 'javascript' && format !== 'python' && format !== 'csharp') {
        console.error(`Error: Invalid format "${format}". Must be: typescript, javascript, python, or csharp`);
        process.exit(1);
      }
      options.format = format as 'typescript' | 'javascript' | 'python' | 'csharp';
    } else if (arg === '--no-simplify') {
      options.simplify = false;
    } else if (arg === '--no-cse') {
      options.cse = false;
    } else if (arg === '--egraph') {
      options.useEGraph = true;
    } else if (arg === '--no-comments') {
      options.includeComments = false;
    } else if (arg === '--guards') {
      options.emitGuards = true;
    } else if (arg === '--epsilon') {
      if (i + 1 >= args.length) {
        console.error('Error: Missing value for --epsilon');
        process.exit(1);
      }
      const epsilonValue = parseFloat(args[++i]);
      if (isNaN(epsilonValue) || epsilonValue <= 0) {
        console.error('Error: Invalid epsilon value. Must be a positive number.');
        process.exit(1);
      }
      options.epsilon = epsilonValue;
    } else if (arg === '--csharp-float-type') {
      if (i + 1 >= args.length) {
        console.error('Error: Missing value for --csharp-float-type');
        process.exit(1);
      }
      const floatType = args[++i];
      if (floatType !== 'float' && floatType !== 'double') {
        console.error(`Error: Invalid C# float type "${floatType}". Must be: float or double`);
        process.exit(1);
      }
      options.csharpFloatType = floatType;
    } else {
      console.error(`Error: Unknown option "${arg}"`);
      printUsage();
      process.exit(1);
    }
  }

  let input: string;
  try {
    input = readFileSync(inputFile, 'utf-8');
  } catch (err) {
    console.error(`Error: Could not read file "${inputFile}"`);
    if (err instanceof Error) {
      console.error(err.message);
    }
    process.exit(1);
  }

  try {
    const program = parse(input);

    if (program.functions.length === 0) {
      console.error('Error: No functions found in input file');
      process.exit(1);
    }

    const outputs: string[] = [];
    let hasVerificationFailure = false;

    program.functions.forEach((func, index) => {
      const env = inferFunction(func);
      const gradients = computeFunctionGradients(func, env);

      // MANDATORY gradient verification
      const verified = verifyGradients(func, gradients, env);
      if (!verified) {
        hasVerificationFailure = true;
      }

      const guardAnalysis = analyzeGuards(func);
      if (guardAnalysis.hasIssues) {
        // Format warnings as comments so output remains valid code even if stderr is captured
        console.error('// Function "' + func.name + '" may have edge cases:');
        console.error(formatGuardWarnings(guardAnalysis, true));
      }

      const perFunctionOptions: CodeGenOptions = { ...options };
      if (index > 0 && perFunctionOptions.includeComments !== false) {
        perFunctionOptions.includeComments = false;
      }

      const code = generateComplete(func, gradients, env, perFunctionOptions);
      outputs.push(code);
    });

    if (hasVerificationFailure) {
      console.error('// ERROR: Gradient verification failed. Output may contain incorrect gradients!');
      process.exit(1);
    }

    console.log(outputs.join('\n\n'));
  } catch (err) {
    if (err instanceof ParseError) {
      // Use formatted error message for parse errors (always verbose with stack trace)
      console.error(formatParseError(err, input, true));
    } else if (err instanceof Error) {
      console.error('Error: Failed to process input file');
      console.error(err.message);
      if (err.stack) {
        console.error('\nStack trace:');
        console.error(err.stack);
      }
    }
    process.exit(1);
  }
}

main();

