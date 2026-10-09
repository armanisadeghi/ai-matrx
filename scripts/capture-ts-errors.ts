import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { assertNoPublicDiagnostics, writeLocalDiagnostic } from './lib/local-diagnostics';

export interface TypeDiagnostic {
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  code: number;
}

export interface CompilerResult {
  stdout: string;
  stderr: string;
  status: number | null;
  signal: string | null;
  error?: Error;
}

export function parseTypeDiagnostics(output: string): TypeDiagnostic[] {
  const diagnostics: TypeDiagnostic[] = [];
  for (const line of stripVTControlCharacters(output).split(/\r?\n/)) {
    const match = /^(?:(.+)\((\d+),(\d+)\): )?error TS(\d+): (.*)$/.exec(line);
    if (match) {
      diagnostics.push({
        file: match[1] ?? null,
        line: match[2] ? Number(match[2]) : null,
        column: match[3] ? Number(match[3]) : null,
        code: Number(match[4]),
        message: match[5],
      });
    } else if (/^\s+\S/.test(line) && diagnostics.length) {
      diagnostics[diagnostics.length - 1].message += '\n' + line;
    }
  }
  return diagnostics;
}

export function runQueuedTypeCheck(projectRoot: string): CompilerResult {
  const result = spawnSync('bash', [
    join(projectRoot, 'scripts', 'tsc-capped.sh'),
    'tsc', '--noEmit', '-p', 'tsconfig.typecheck.json', '--pretty', 'false',
  ], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status,
    signal: result.signal, ...(result.error ? { error: result.error } : {}) };
}

export function captureTypeScriptErrors(
  projectRoot: string,
  run: (root: string) => CompilerResult = runQueuedTypeCheck,
): { path: string; exitCode: number; count: number; status: string } {
  assertNoPublicDiagnostics(projectRoot);
  let result: CompilerResult;
  try { result = run(projectRoot); }
  catch (error) {
    result = { stdout: '', stderr: '', status: null, signal: null,
      error: error instanceof Error ? error : new Error('Compiler launcher failed') };
  }
  const output = result.stdout + '\n' + result.stderr;
  const diagnostics = parseTypeDiagnostics(output);
  const unavailable = Boolean(result.error || result.signal || result.status === null ||
    /\[tsc-capped\] ERROR:/.test(output) ||
    (result.status === 0 && diagnostics.length > 0) ||
    (result.status !== 0 && (result.status > 2 || !diagnostics.length)));
  const status = unavailable ? 'unavailable' : diagnostics.length ? 'diagnostics' : 'clean';
  const exitCode = unavailable ? (result.status && result.status > 0 ? result.status : 1) : result.status ?? 1;
  const path = writeLocalDiagnostic(projectRoot, 'type_errors.json', {
    capturedAt: new Date().toISOString(), status,
    compilerExitCode: result.status, signal: result.signal,
    ...(unavailable ? { infrastructureError: result.error?.message ?? (result.stderr.trim() || 'Compiler result is incomplete') } : {}),
    diagnostics,
  });
  return { path, exitCode, count: diagnostics.length, status };
}

if (require.main === module) {
  try {
    const result = captureTypeScriptErrors(process.cwd());
    console.log(`TypeScript diagnostic capture ${result.status}: ${result.count} diagnostics in ${result.path}`);
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'TypeScript diagnostic capture failed');
    process.exitCode = 1;
  }
}
