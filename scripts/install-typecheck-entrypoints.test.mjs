import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { install } from './install-typecheck-entrypoints.mjs';

test('reinstallation replaces launchers without following symlinks and preserves arguments, cwd, output and failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue entrypoints '));
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    for (const [name, compiler] of [['typescript', 'tsc6'], ['@typescript/native', 'tsc']]) {
      const dir = join(root, 'node_modules', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ bin: { [compiler]: './original' } }));
      writeFileSync(join(dir, 'original'), 'ORIGINAL COMPILER BYTES');
      symlinkSync(join(dir, 'original'), join(root, 'node_modules/.bin', compiler));
    }
    writeFileSync(join(root, 'scripts/tsc-capped.sh'), '#!/bin/bash\nprintf "%s\\n" "$PWD" "$@"\nprintf "queue stderr\\n" >&2\nexit 23\n');
    install(root);
    install(root);
    for (const compiler of ['tsc', 'tsc6']) {
      const bin = join(root, 'node_modules/.bin', compiler);
      assert.equal(lstatSync(bin).isSymbolicLink(), false);
      for (const invocation of [[bin], [process.execPath, bin]]) {
        const result = spawnSync(invocation[0], [...invocation.slice(1), '--noEmit', 'path with spaces.ts'], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 23, result.stderr);
        assert.equal(result.stdout, `${realpathSync(root)}\n${compiler}\n--noEmit\npath with spaces.ts\n`);
        assert.equal(result.stderr, 'queue stderr\n');
      }
    }
    for (const name of ['typescript', '@typescript/native']) assert.equal(readFileSync(join(root, 'node_modules', name, 'original'), 'utf8'), 'ORIGINAL COMPILER BYTES');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
