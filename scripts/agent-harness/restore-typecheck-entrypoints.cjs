'use strict';
// pnpm loads .pnpmfile.cjs before relinking node_modules, and can skip root
// lifecycle scripts with --ignore-scripts. Register this before the install
// gate so completion repairs .bin while the gate's install lock is still held.

const { execFileSync } = require('node:child_process');
const { join, resolve } = require('node:path');
const { mutatingCommand } = require('./install-gate.cjs');

const REPO_ROOT = resolve(__dirname, '../..');

function register(root = REPO_ROOT) {
  if (!mutatingCommand()) return;

  process.on('exit', (code) => {
    try {
      execFileSync(process.execPath, [join(root, 'scripts/install-typecheck-entrypoints.mjs')], {
        cwd: root,
        stdio: 'inherit',
      });
    } catch (error) {
      const detail = error?.message || String(error);
      process.stderr.write(`[typecheck-entrypoints] RESTORE FAILED after pnpm mutation: ${detail}\n`);
      // Preserve pnpm's own failure status: it is the actionable result even
      // when an interrupted relink also prevents a best-effort repair.
      if (code !== 0) return;
      // `exit` has already begun, so set the result rather than calling
      // process.exit() and bypassing other registered cleanup handlers.
      process.exitCode = 70;
    }
  });
}

module.exports = { register, REPO_ROOT };
