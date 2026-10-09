/** Internal development reports never belong in Next.js public assets. */
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DIAGNOSTIC_NAMES = ['type_errors.json', 'test-directories.json'] as const;
export type DiagnosticName = typeof DIAGNOSTIC_NAMES[number];

export function assertNoPublicDiagnostics(projectRoot: string): void {
  const exposed = DIAGNOSTIC_NAMES.filter(name => existsSync(join(projectRoot, 'public', name)));
  if (exposed.length) {
    throw new Error(`Internal diagnostic artifacts cannot be published: ${exposed.join(', ')}`);
  }
}

export function writeLocalDiagnostic(projectRoot: string, name: DiagnosticName, value: unknown): string {
  assertNoPublicDiagnostics(projectRoot);
  const directory = join(projectRoot, '.matrx', 'diagnostics');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, name);
  const pending = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(pending, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
    assertNoPublicDiagnostics(projectRoot);
    renameSync(pending, target);
  } finally {
    rmSync(pending, { force: true });
  }
  return target;
}
