#!/usr/bin/env node
/** Route package-manager compiler entrypoints through the shared queue.
 * Write fresh files then rename: never follow a .bin symlink into pnpm's store.
 * Reapplied by postinstall because package managers regenerate .bin launchers.
 */
import { createRequire } from 'node:module';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';

export function install(root, { platform = process.platform } = {}) {
  // The queue is a POSIX bash/fcntl implementation. Do not replace a Windows
  // package-manager launcher with a wrapper that cannot execute there.
  if (platform === 'win32') {
    console.warn('[tsc-capped] Skipped compiler entrypoint routing on Windows: the shared queue is POSIX-only.');
    return;
  }
  const require = createRequire(join(root, 'package.json'));
  const binDir = join(root, 'node_modules/.bin');
  mkdirSync(binDir, { recursive: true });
  for (const [compiler, packageName] of [['tsc6', 'typescript'], ['tsc', '@typescript/native']]) {
    let manifest;
    try {
      manifest = require(packageName + '/package.json');
    } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND') {
        throw new Error(`[tsc-capped] Cannot restore ${compiler}: required compiler package ${JSON.stringify(packageName)} is missing. Restore dependencies before retrying.`, { cause: error });
      }
      throw error;
    }
    if (!manifest.bin?.[compiler]) throw new Error(`${packageName} no longer provides ${compiler}`);
    const target = join(binDir, compiler);
    const temporary = `${target}.queue-${process.pid}`;
    const source = `#!/usr/bin/env node
// Managed by scripts/install-typecheck-entrypoints.mjs; do not bypass the queue.
const { spawn } = require('node:child_process');
const child = spawn('bash', [${JSON.stringify(join(root, 'scripts/tsc-capped.sh'))}, ${JSON.stringify(compiler)}, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', error => { console.error('[tsc-capped] Cannot start queue:', error.message); process.exitCode = 70; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 70); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
`;
    try {
      writeFileSync(temporary, source, { mode: 0o755 });
      renameSync(temporary, target);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  install(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  console.log('[tsc-capped] Local tsc and tsc6 entrypoints now use the shared queue.');
}
