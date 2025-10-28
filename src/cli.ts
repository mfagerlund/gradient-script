#!/usr/bin/env node

import { readFileSync } from 'fs';
import { parse } from './dsl/Parser.js';
import { inferFunction } from './dsl/TypeInference.js';
import { computeFunctionGradients } from './dsl/Differentiation.js';
import { generateComplete } from './dsl/CodeGen.js';
import type { CodeGenOptions } from './dsl/CodeGen.js';
import { analyzeGuards, formatGuardWarnings } from './dsl/Guards.js';

function printUsage() {
  console.log(`
GradientScript - Symbolic Differentiation for Structured Types

Usage:
  gradient-script <file.gs> [options]

Options:
  --format <format>     Output format: typescript (default), javascript, python
  --no-simplify         Disable gradient simplification
  --no-cse              Disable common subexpression elimination
  --no-comments         Omit comments in generated code
  --guards              Emit runtime guards for division by zero (experimental)
  --epsilon <value>     Epsilon value for guards (default: 1e-10)
  --help, -h            Show this help message

Examples:
  gradient-script angle.gs
  gradient-script angle.gs --format python
  gradient-script angle.gs --format javascript --no-comments

Input File Format (.gs):
  function name(param1∇: {x, y}, param2∇) {
    // intermediate calculations
    local = expression
    return expression
  }

  The ∇ symbol marks parameters that need gradients computed.
  Type annotations like {x, y} specify structured types.
  All functions in the file are processed automatically.
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

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--format') {
      if (i + 1 >= args.length) {
        console.error('Error: Missing value for --format');
        process.exit(1);
      }
      const format = args[++i];
      if (format !== 'typescript' && format !== 'javascript' && format !== 'python') {
        console.error(`Error: Invalid format "${format}". Must be: typescript, javascript, or python`);
        process.exit(1);
      }
      options.format = format;
    } else if (arg === '--no-simplify') {
      options.simplify = false;
    } else if (arg === '--no-cse') {
      options.cse = false;
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

    program.functions.forEach((func, index) => {
      const env = inferFunction(func);
      const gradients = computeFunctionGradients(func, env);

      const guardAnalysis = analyzeGuards(func);
      if (guardAnalysis.hasIssues) {
        console.error('Function "' + func.name + '" may have edge cases:');
        console.error(formatGuardWarnings(guardAnalysis));
      }

      const perFunctionOptions: CodeGenOptions = { ...options };
      if (index > 0 && perFunctionOptions.includeComments !== false) {
        perFunctionOptions.includeComments = false;
      }

      const code = generateComplete(func, gradients, env, perFunctionOptions);
      outputs.push(code);
    });

    console.log(outputs.join('\n\n'));
  } catch (err) {
    console.error('Error: Failed to process input file');
    if (err instanceof Error) {
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

