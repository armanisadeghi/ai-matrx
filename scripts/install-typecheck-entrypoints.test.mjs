import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, lstatSync, realpathSync, copyFileSync } from 'node:fs';
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

test('Windows leaves existing compiler launchers intact because the queue is POSIX-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue entrypoints windows '));
  try {
    mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    const launcher = join(root, 'node_modules/.bin/tsc');
    writeFileSync(launcher, 'ORIGINAL WINDOWS LAUNCHER');
    install(root, { platform: 'win32' });
    assert.equal(readFileSync(launcher, 'utf8'), 'ORIGINAL WINDOWS LAUNCHER');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function writePackage(dir, packageJson, files = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson));
  for (const [file, contents] of Object.entries(files)) {
    const target = join(dir, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, contents, { mode: 0o755 });
  }
}

function runPnpm(root, args) {
  // pnpm 10 accepts these flags for install/add but rejects them for remove;
  // the npm config form has the same effect for the remove CLI path.
  const remove = args.includes('remove');
  const result = spawnSync('pnpm', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MATRX_INSTALL_GATE_DISABLE: '1',
      ...(remove ? { npm_config_ignore_scripts: 'true', npm_config_offline: 'true' } : {}),
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

test('pnpm mutations with --ignore-scripts restore queued compiler entrypoints after install, add, and remove', () => {
  const root = mkdtempSync(join(tmpdir(), 'queue pnpm lifecycle '));
  try {
    mkdirSync(join(root, 'scripts/agent-harness'), { recursive: true });
    copyFileSync(join(process.cwd(), 'scripts/agent-harness/install-gate.cjs'), join(root, 'scripts/agent-harness/install-gate.cjs'));
    copyFileSync(join(process.cwd(), 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'), join(root, 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'));
    copyFileSync(join(process.cwd(), 'scripts/install-typecheck-entrypoints.mjs'), join(root, 'scripts/install-typecheck-entrypoints.mjs'));
    writeFileSync(join(root, 'scripts/tsc-capped.sh'), '#!/bin/bash\nprintf "%s\\n" "$PWD" "$@"\nexit 23\n', { mode: 0o755 });

    writePackage(join(root, 'packages/typescript'), {
      name: 'typescript', version: '1.0.0', bin: { tsc6: 'bin/tsc6.js' },
    }, { 'bin/tsc6.js': '#!/usr/bin/env node\nconsole.log("RAW TSC6")\n' });
    writePackage(join(root, 'packages/native'), {
      name: '@typescript/native', version: '1.0.0', bin: { tsc: 'bin/tsc.js' },
    }, { 'bin/tsc.js': '#!/usr/bin/env node\nconsole.log("RAW TSC")\n' });
    writePackage(join(root, 'packages/added'), {
      name: 'added-fixture', version: '1.0.0', bin: { unrelated: 'bin/unrelated.js' },
    }, { 'bin/unrelated.js': '#!/usr/bin/env node\nconsole.log("UNRELATED")\n' });
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'queue-lifecycle-fixture', private: true,
      dependencies: { typescript: 'file:packages/typescript', '@typescript/native': 'file:packages/native' },
    }));

    const rawCompilerBytes = readFileSync(join(root, 'packages/typescript/bin/tsc6.js'), 'utf8');
    // This is the red proof for the lifecycle bypass: without the .pnpmfile
    // exit hook, --ignore-scripts leaves pnpm's raw launcher in place.
    writeFileSync(join(root, '.pnpmfile.cjs'), 'module.exports = { hooks: {} };\n');
    runPnpm(root, ['--offline', '--ignore-scripts', 'install']);
    const raw = spawnSync(join(root, 'node_modules/.bin/tsc'), [], { cwd: root, encoding: 'utf8' });
    assert.equal(raw.status, 0);
    assert.equal(raw.stdout, 'RAW TSC\n');

    copyFileSync(join(process.cwd(), '.pnpmfile.cjs'), join(root, '.pnpmfile.cjs'));
    for (const args of [
      ['--offline', '--ignore-scripts', 'install'],
      ['--offline', '--frozen-lockfile', '--ignore-scripts', 'install'],
      ['--offline', '--ignore-scripts', 'add', './packages/added'],
      ['remove', 'added-fixture'],
    ]) {
      runPnpm(root, args);
      for (const compiler of ['tsc', 'tsc6']) {
        const bin = join(root, 'node_modules/.bin', compiler);
        assert.match(readFileSync(bin, 'utf8'), /Managed by scripts\/install-typecheck-entrypoints/);
        const result = spawnSync(process.execPath, [bin, '--noEmit', 'argument with spaces.ts'], { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 23, result.stderr);
        assert.equal(result.stdout, `${realpathSync(root)}\n${compiler}\n--noEmit\nargument with spaces.ts\n`);
      }
      assert.equal(readFileSync(join(root, 'packages/typescript/bin/tsc6.js'), 'utf8'), rawCompilerBytes);
      if (args.includes('add')) {
        const unrelated = spawnSync(join(root, 'node_modules/.bin/unrelated'), [], { cwd: root, encoding: 'utf8' });
        assert.equal(unrelated.status, 0, unrelated.stderr);
        assert.equal(unrelated.stdout, 'UNRELATED\n');
      }
    }
    assert.throws(() => lstatSync(join(root, 'node_modules/.bin/unrelated')));

    // An unsuccessful pnpm mutation may still have relinked .bin. Repair it,
    // but retain pnpm's original failure status so callers see the real cause.
    writeFileSync(join(root, 'node_modules/.bin/tsc'), '#!/usr/bin/env node\nconsole.log("RAW")\n', { mode: 0o755 });
    const failed = spawnSync(process.execPath, ['-e', `
      process.argv.push('fixture', 'install');
      require(${JSON.stringify(join(root, 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'))}).register(process.cwd());
      process.exitCode = 41;
    `], { cwd: root, encoding: 'utf8' });
    assert.equal(failed.status, 41, failed.stderr);
    assert.match(readFileSync(join(root, 'node_modules/.bin/tsc'), 'utf8'), /Managed by scripts\/install-typecheck-entrypoints/);

    // If pnpm itself succeeded, an unavailable required compiler is loud and
    // changes the otherwise-successful result to the restoration failure.
    const missingRoot = mkdtempSync(join(tmpdir(), 'queue missing compiler '));
    try {
      mkdirSync(join(missingRoot, 'scripts/agent-harness'), { recursive: true });
      copyFileSync(join(root, 'scripts/agent-harness/install-gate.cjs'), join(missingRoot, 'scripts/agent-harness/install-gate.cjs'));
      copyFileSync(join(root, 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'), join(missingRoot, 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'));
      copyFileSync(join(root, 'scripts/install-typecheck-entrypoints.mjs'), join(missingRoot, 'scripts/install-typecheck-entrypoints.mjs'));
      writeFileSync(join(missingRoot, 'package.json'), '{"name":"missing-compiler"}');
      const restoreFailure = spawnSync(process.execPath, ['-e', `
        process.argv.push('fixture', 'install');
        require(${JSON.stringify(join(missingRoot, 'scripts/agent-harness/restore-typecheck-entrypoints.cjs'))}).register(process.cwd());
      `], { cwd: missingRoot, encoding: 'utf8' });
      assert.equal(restoreFailure.status, 70, restoreFailure.stderr);
      assert.match(restoreFailure.stderr, /RESTORE FAILED/);
      assert.match(restoreFailure.stderr, /required compiler package "typescript" is missing/);
    } finally { rmSync(missingRoot, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
