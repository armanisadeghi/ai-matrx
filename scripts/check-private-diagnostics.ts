import { assertNoPublicDiagnostics } from './lib/local-diagnostics';

try {
  assertNoPublicDiagnostics(process.cwd());
  console.log('Internal diagnostics are excluded from public assets.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Public diagnostic check failed');
  process.exitCode = 1;
}
