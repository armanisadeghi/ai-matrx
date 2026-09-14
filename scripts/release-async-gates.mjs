#!/usr/bin/env node
/** Durable opt-in post-push advisory gate queue. The manifest remains in run-release-gates.sh. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync, openSync, closeSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const repo = resolve(process.cwd());
const testMode = process.env.RELEASE_ASYNC_GATES_TEST_MODE === '1';
const common = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: repo, encoding: 'utf8' });
if (common.status !== 0) throw new Error('release_async_gates_requires_git_repository');
const stateRoot = testMode && process.env.RELEASE_ASYNC_GATES_STATE_ROOT ? resolve(process.env.RELEASE_ASYNC_GATES_STATE_ROOT) : resolve(repo, common.stdout.trim(), 'release-async-gates');
const jobsRoot = join(stateRoot, 'jobs');
const kernelLock = join(stateRoot, 'worker.lock');
const lockFd = Number(process.env.RELEASE_ASYNC_GATES_LOCK_FD);
const canonicalRunner = join(repo, 'scripts/run-release-gates.sh');
const runner = testMode && process.env.RELEASE_ASYNC_GATES_TEST_RUNNER ? resolve(process.env.RELEASE_ASYNC_GATES_TEST_RUNNER) : canonicalRunner;
mkdirSync(jobsRoot, { recursive: true, mode: 0o700 });

const now = () => new Date().toISOString();
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, file);
}
function git(args) { const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' }); return result.status === 0 ? result.stdout.trim() : null; }
function identity(worktree = repo) {
  const run = (args) => { const result = spawnSync('git', args, { cwd: worktree, encoding: 'utf8' }); return result.status === 0 ? result.stdout.trim() : null; };
  const diff = spawnSync('git', ['diff', '--binary', 'HEAD'], { cwd: worktree, encoding: 'buffer', maxBuffer: 1024 * 1024 });
  const trackedDiffSha256 = diff.status === 0 ? createHash('sha256').update(diff.stdout).digest('hex') : null;
  const untracked = run(['ls-files', '--others', '--exclude-standard'])?.split('\n').filter(Boolean) ?? [];
  const untrackedSha256 = untracked.slice(0, 128).map((path) => {
    try {
      const full = join(worktree, path); const stat = lstatSync(full);
      if (!stat.isFile() || stat.size > 1024 * 1024) return { path, sha256: null, bounded: true };
      return { path, sha256: createHash('sha256').update(readFileSync(full)).digest('hex') };
    } catch { return { path, sha256: null, bounded: true }; }
  });
  return { head: run(['rev-parse', 'HEAD']), branch: run(['branch', '--show-current']), worktreeStatus: run(['status', '--porcelain']), trackedDiffSha256, untrackedSha256, untrackedTruncated: untracked.length > 128 };
}
function jobFiles(id) { const dir = join(jobsRoot, id); return { dir, status: join(dir, 'status.json'), report: join(dir, 'gates.jsonl'), log: join(dir, 'runner.log') }; }
function pidAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function groupAlive(pgid) { try { process.kill(-pgid, 0); return true; } catch { return false; } }
function reconcile(file) {
  const state = readJson(file);
  if (state.state === 'running' && (!state.workerPid || !pidAlive(state.workerPid))) {
    // A worker can die while its detached aggregate process group is still
    // running. It owns the one-common-repo lane until it exits; do not overlap it.
    if (state.runnerPgid && groupAlive(state.runnerPgid)) return { ...state, reason: 'worker_dead_runner_still_active' };
    atomicJson(file, { ...state, state: 'interrupted', outcome: 'unmeasured', endedAt: now(), reason: 'worker_or_runner_not_alive' });
    return readJson(file);
  }
  return state;
}
function jobs() {
  if (!existsSync(jobsRoot)) return [];
  return readdirSync(jobsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => jobFiles(entry.name)).filter(({ status }) => existsSync(status));
}
function startDetachedWorker() {
  const python = spawnSync('python3', ['-c', 'import fcntl'], { encoding: 'utf8' });
  if (python.status !== 0) throw new Error('release_async_gates_python_fcntl_unavailable');
  const child = spawn('python3', [join(repo, 'scripts/release-async-gates-lock.py'), kernelLock, process.execPath, new URL(import.meta.url).pathname, 'worker'], { cwd: repo, detached: true, stdio: 'ignore', env: process.env });
  child.unref();
}
function pendingFiles() { return jobs().map(({ status }) => ({ status, value: reconcile(status) })).filter(({ value }) => value.state === 'queued').sort((a, b) => a.value.enqueuedAt.localeCompare(b.value.enqueuedAt)); }
function resultSummary(report, expected) {
  if (!existsSync(report)) return null;
  let rows;
  try { rows = readFileSync(report, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch { return null; }
  if (!rows.length) return null;
  const counts = { ok: 0, warn: 0, fail: 0 }; for (const row of rows) if (Object.hasOwn(counts, row.result)) counts[row.result] += 1;
  const valid = rows.length === expected.length && rows.every((row, index) => row.step === index + 1 && row.label === expected[index].label && row.command === expected[index].command && Object.hasOwn(counts, row.result) && typeof row.elapsedSeconds === 'number' && row.elapsedSeconds >= 0 && typeof row.outputFile === 'string' && existsSync(row.outputFile));
  return { checksRecorded: rows.length, counts, valid };
}
function expectedManifest(worktree, runnerPath) {
  const listed = spawnSync('bash', [runnerPath, '--advisory', '--list'], { cwd: worktree, encoding: 'utf8' });
  if (listed.status !== 0) return null;
  const rows = listed.stdout.split('\n').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('|');
    return separator < 1 ? { label: '', command: '' } : { label: entry.slice(0, separator), command: entry.slice(separator + 1) };
  });
  return rows.length && rows.every((row) => row.label && row.command) ? rows : null;
}
let activeRunner = null;
let activeStatus = null;
let stopping = false;
async function terminateWorker(signal) {
  if (stopping) return;
  stopping = true;
  if (activeRunner?.pid) { try { process.kill(-activeRunner.pid, 'SIGTERM'); } catch {} }
  if (activeStatus && existsSync(activeStatus)) {
    const state = readJson(activeStatus);
    atomicJson(activeStatus, { ...state, state: 'interrupted', outcome: 'unmeasured', endedAt: now(), reason: `worker_${signal.toLowerCase()}` });
  }
  // The inherited kernel lock remains held by the detached process group until
  // every descendant exits; queued launcher waiters then drain safely.
  process.exit(signal === 'SIGTERM' ? 143 : 130);
}
process.on('SIGTERM', () => { void terminateWorker('SIGTERM'); });
process.on('SIGINT', () => { void terminateWorker('SIGINT'); });
async function worker() {
  if (!Number.isInteger(lockFd) || lockFd < 0) throw new Error('release_async_gates_kernel_lock_missing');
  try {
    while (true) {
      const next = pendingFiles()[0]; if (!next) break;
      const files = jobFiles(next.value.id);
      const worktree = next.value.executionWorktree;
      const runnerPath = next.value.runnerPath;
      if (!worktree || !runnerPath || !existsSync(runnerPath)) {
        atomicJson(next.status, { ...next.value, state: 'interrupted', outcome: 'unmeasured', endedAt: now(), reason: 'recorded_worktree_or_runner_missing' });
        continue;
      }
      const manifest = expectedManifest(worktree, runnerPath);
      if (!manifest) {
        atomicJson(next.status, { ...next.value, state: 'interrupted', outcome: 'unmeasured', endedAt: now(), reason: 'canonical_manifest_unmeasurable' });
        continue;
      }
      const expectedChecks = manifest.length;
      const running = { ...next.value, state: 'running', outcome: 'unmeasured', workerPid: process.pid, expectedChecks, startedAt: now(), startedSourceIdentity: identity(worktree) };
      atomicJson(next.status, running);
      const logFd = openSync(files.log, 'a', 0o600);
      const child = spawn('bash', [runnerPath, '--advisory', '--report-file', files.report], { cwd: worktree, detached: true, stdio: ['ignore', logFd, logFd, lockFd] });
      atomicJson(next.status, { ...running, runnerPid: child.pid, runnerPgid: child.pid });
      activeRunner = child; activeStatus = next.status;
      const code = await new Promise((done) => child.once('exit', (exitCode, signal) => done({ exitCode, signal })));
      // bash can exit while a descendant still owns the inherited kernel lock.
      // Do not start another aggregate until the entire process group is gone.
      let grace = 50;
      let intervened = false;
      while (groupAlive(child.pid) && grace-- > 0) await new Promise((done) => setTimeout(done, 100));
      if (groupAlive(child.pid)) {
        intervened = true;
        try { process.kill(-child.pid, 'SIGTERM'); } catch {}
        await new Promise((done) => setTimeout(done, 500));
        if (groupAlive(child.pid)) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
      }
      const groupStillAlive = groupAlive(child.pid);
      closeSync(logFd);
      activeRunner = null; activeStatus = null;
      const summary = resultSummary(files.report, manifest);
      const measured = code.exitCode === 0 && code.signal === null && summary?.valid === true && !intervened && !groupStillAlive;
      atomicJson(next.status, { ...running, runnerPid: child.pid, runnerPgid: child.pid, state: measured ? 'completed' : 'interrupted', outcome: measured && !summary.counts.fail && !summary.counts.warn ? 'all_clear' : measured ? 'advisory_findings' : 'unmeasured', endedAt: now(), runnerExitCode: code.exitCode, signal: code.signal, reason: intervened ? (groupStillAlive ? 'runner_group_survived_kill' : 'runner_group_required_intervention') : undefined, resultSummary: summary, endedSourceIdentity: identity(worktree), log: files.log, report: files.report, sourceIdentityNote: 'Candidate identity was captured at enqueue. Diagnostics ran in the recorded worktree and are not exact-candidate certification.' });
      if (groupStillAlive) break;
    }
  } finally {
    const rescan = pendingFiles().length > 0;
    try { closeSync(lockFd); } catch {}
    if (rescan) startDetachedWorker();
  }
}
function enqueue() {
  const source = identity(); if (!source.head) throw new Error('release_async_gates_missing_head');
  const id = `${Date.now()}-${process.pid}-${source.head.slice(0, 12)}`;
  const files = jobFiles(id); mkdirSync(files.dir, { recursive: false, mode: 0o700 });
  atomicJson(files.status, { id, state: 'queued', outcome: 'unmeasured', enqueuedAt: now(), candidateSha: source.head, enqueueSourceIdentity: source, executionWorktree: repo, runnerPath: runner, report: files.report, log: files.log, sourceIdentityNote: 'Candidate identity was captured at enqueue. Diagnostics later run in this recorded worktree and are not exact-candidate certification.' });
  startDetachedWorker(); process.stdout.write(JSON.stringify({ id, state: 'queued', status: files.status, log: files.log, report: files.report }) + '\n');
}
function status() {
  const items = jobs().map(({ status }) => reconcile(status)).sort((a, b) => b.enqueuedAt.localeCompare(a.enqueuedAt));
  const counts = Object.fromEntries(['queued', 'running', 'completed', 'interrupted'].map((state) => [state, items.filter((item) => item.state === state).length]));
  const latest = items.slice(0, 12).map(({ id, state, outcome, candidateSha, expectedChecks, enqueuedAt, startedAt, endedAt, executionWorktree, enqueueSourceIdentity, startedSourceIdentity, endedSourceIdentity, log, report, reason, resultSummary }) => ({ id, state, outcome, candidateSha, expectedChecks, enqueuedAt, startedAt, endedAt, executionWorktree, enqueueSourceIdentity, startedSourceIdentity, endedSourceIdentity, log, report, reason, resultSummary }));
  process.stdout.write(JSON.stringify({ stateRoot, counts, latest, truncated: items.length > latest.length, queuedRecovery: `node ${new URL(import.meta.url).pathname} resume` }, null, 2) + '\n');
}
function help() {
  process.stdout.write(`Usage: node scripts/release-async-gates.mjs <command>\n\n` +
    `enqueue  Create one durable job and launch a detached worker.\n` +
    `status   Read the bounded job summary and retained receipt paths; never wakes work.\n` +
    `resume   Launch a kernel-locked detached drain for queued jobs.\n` +
    `worker   Internal: requires the inherited kernel lock descriptor.\n\n` +
    `Interrupted jobs are evidence, never retry candidates. Inspect their log/report,\n` +
    `repair the cause, then use a new release enqueue; resume only drains queued jobs.\n`);
}
const command = process.argv[2];
if (command === 'enqueue') enqueue(); else if (command === 'resume') startDetachedWorker(); else if (command === 'worker') await worker(); else if (command === 'status') status(); else if (command === 'help' || command === '--help' || command === '-h') help(); else { console.error('Usage: release-async-gates.mjs enqueue|resume|worker|status'); process.exit(2); }
