import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const scripts = new URL('.', import.meta.url).pathname;
const repo = new URL('..', new URL('.', import.meta.url)).pathname;
const helper = join(scripts, 'release-async-gates.mjs');
const gateRunner = join(scripts, 'run-release-gates.sh');
const helperSource = readFileSync(helper, 'utf8');
const runnerSource = readFileSync(gateRunner, 'utf8');

function fixture(delay = '0.15') {
  const root = mkdtempSync(join(tmpdir(), 'release-async-gates-'));
  const state = join(root, 'state');
  const runner = join(root, 'runner.sh');
  writeFileSync(runner, `#!/usr/bin/env bash\nset -eu\nreport=''\nwhile [[ $# -gt 0 ]]; do\n  if [[ $1 == --list ]]; then printf 'pass|fixture | cat || :\\nfail|fixture | cat || :\\npass-two|fixture | cat || :\\n'; exit 0; fi\n  [[ $1 == --report-file ]] && { report=$2; shift 2; } || shift\ndone\nif ! mkdir "$RUNNER_ACTIVE_DIR" 2>/dev/null; then echo 'OVERLAP'; exit 9; fi\ntrap 'rmdir "$RUNNER_ACTIVE_DIR"' EXIT\npwd > "$report.cwd"\nsleep "\${ASYNC_TEST_DELAY:-0}"\nmkdir -p "$report.outputs"; for n in 1 2 3; do : > "$report.outputs/$n.log"; done\nprintf '{"step":1,"label":"pass","command":"fixture | cat || :","result":"ok","elapsedSeconds":0,"outputFile":"%s.outputs/1.log"}\\n' "$report" > "$report"\nprintf '{"step":2,"label":"fail","command":"fixture | cat || :","result":"fail","elapsedSeconds":0,"outputFile":"%s.outputs/2.log"}\\n' "$report" >> "$report"\nprintf '{"step":3,"label":"pass-two","command":"fixture | cat || :","result":"ok","elapsedSeconds":0,"outputFile":"%s.outputs/3.log"}\\n' "$report" >> "$report"\nprintf 'fixture full output\\n'\n`, { mode: 0o700 });
  return { root, state, runner, env: { ...process.env, RELEASE_ASYNC_GATES_TEST_MODE: '1', RELEASE_ASYNC_GATES_STATE_ROOT: state, RELEASE_ASYNC_GATES_TEST_RUNNER: runner, ASYNC_TEST_DELAY: delay, RUNNER_ACTIVE_DIR: join(root, 'active') } };
}
function call(fx, command) { return execFileSync(process.execPath, [helper, command], { cwd: repo, env: fx.env, encoding: 'utf8' }); }
async function waitFor(fx, expectedCompleted) {
  for (let i = 0; i < 80; i += 1) {
    const value = JSON.parse(call(fx, 'status'));
    if (value.counts.completed === expectedCompleted) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed_out_waiting_for_detached_worker');
}

test('async helper invokes the sole canonical gate runner; its manifest is not copied', () => {
  assert.match(helperSource, /\[runnerPath, '--advisory', '--report-file', files\.report\]/);
  assert.doesNotMatch(helperSource, /pnpm check:|Every TypeScript file parses/);
  assert.match(runnerSource, /declare -a GATES=/);
  assert.match(runnerSource, /record_gate_result/);
  const advisoryStart = runnerSource.indexOf('declare -a GATES=(', runnerSource.indexOf('else', runnerSource.indexOf('declare -a GATES=(')));
  const advisoryEnd = runnerSource.indexOf('\n    )', advisoryStart);
  assert.notEqual(advisoryStart, -1);
  assert.equal((runnerSource.slice(advisoryStart, advisoryEnd).match(/^        "/gm) ?? []).length, 86);
});

test('canonical bash runner writes newline-delimited, per-check receipts for a safe selected gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-gate-report-'));
  const report = join(root, 'gates.jsonl');
  try {
    execFileSync('bash', [gateRunner, '--advisory', '--only', 'Every TypeScript file parses', '--only', 'Untracked-import breakage', '--report-file', report], { cwd: repo, stdio: 'pipe', timeout: 120_000 });
    const rows = readFileSync(report, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, 'Every TypeScript file parses');
    assert.equal(rows[1].label, 'Untracked-import breakage');
    assert.equal(rows[0].outputFile, `${report}.outputs/1.log`);
    assert.ok(readFileSync(rows[0].outputFile, 'utf8') !== undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('detached worker survives enqueue process exit, serializes jobs, and retains advisory findings', async () => {
  const fx = fixture();
  try {
    const first = JSON.parse(call(fx, 'enqueue'));
    const second = JSON.parse(call(fx, 'enqueue'));
    assert.notEqual(first.id, second.id);
    const result = await waitFor(fx, 2);
    assert.equal(result.counts.completed, 2);
    assert.equal(result.counts.running, 0);
    for (const job of result.latest) {
      assert.equal(job.outcome, 'advisory_findings');
      assert.equal(job.expectedChecks, 3);
      assert.equal(job.resultSummary.checksRecorded, 3);
      assert.equal(job.resultSummary.counts.fail, 1);
      assert.match(readFileSync(job.log, 'utf8'), /fixture full output/);
      assert.match(readFileSync(job.report, 'utf8'), /"result":"fail"/);
    }
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test('status converts a dead running worker to interrupted and never reports it green', () => {
  const fx = fixture();
  try {
    const id = 'stale-job'; const dir = join(fx.state, 'jobs', id); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.json'), JSON.stringify({ id, state: 'running', outcome: 'unmeasured', enqueuedAt: new Date().toISOString(), workerPid: 99999999 }) + '\n');
    const result = JSON.parse(call(fx, 'status'));
    assert.equal(result.counts.interrupted, 1);
    assert.equal(result.latest[0].outcome, 'unmeasured');
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});

test('a killed worker cannot overlap its orphaned aggregate and queued kernel-lock waiters drain the successor', async () => {
  const fx = fixture('1');
  try {
    JSON.parse(call(fx, 'enqueue'));
    let running;
    for (let i = 0; i < 40; i += 1) {
      const current = JSON.parse(call(fx, 'status'));
      running = current.latest.find((job) => job.state === 'running');
      if (running?.startedAt) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(running?.startedAt);
    JSON.parse(call(fx, 'enqueue'));
    process.kill(readFileSync(join(fx.state, 'jobs', running.id, 'status.json'), 'utf8').match(/"workerPid": (\d+)/)[1], 'SIGKILL');
    const result = await waitFor(fx, 1);
    assert.equal(result.counts.interrupted, 1);
    assert.equal(result.counts.completed, 1);
    for (const job of result.latest) assert.doesNotMatch(readFileSync(job.log, 'utf8'), /OVERLAP/);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
});
