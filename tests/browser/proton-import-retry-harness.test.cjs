const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { atomicJson, cleanupPlan, cookieSession, historicalReceiptIsClosed, runHarnessLifecycle } = require('./proton-import-retry-acceptance.cjs');

const reviewSha = '9f9cc2958a145d18be3c10e757c4bd408448e8ab9a2d7758dbc6727731b79e7f';
const querySha = 'c266ad75a3ab55833d18f79027d90d0f957e695f9e085c7dcc1422ea04d0fce6';
const session = (token = 'x'.repeat(32)) => `base64-${Buffer.from(JSON.stringify({ access_token: token })).toString('base64url')}`;
const cookie = (name, value = session()) => ({ name, value, domain: '.aimatrx.com', path: '/', secure: true });

function harness({ failAt, state = {}, persistFails = false, persist } = {}) {
  const trace = [];
  const cleanup = { authStarted: false, lastVerifiedSession: false, finalSessionCertain: true, logoutStatus: undefined, attempts: false, receipts: undefined, ownedIdsEmpty: true, ownedIdsCount: 0, softDeletedCount: 0, ownedActiveCount: 0, baselineUnchanged: true, ...state };
  const stage = (name) => async () => {
    trace.push(name);
    if (failAt === name) throw new Error(`${name}_failed`);
  };
  return {
    trace,
    run: () => runHarnessLifecycle({
      persistArtifactPreflight: stage('preflight'),
      historicalGate: stage('historical-gate'),
      login: async () => {
        if (state.authStartedOnLogin) cleanup.authStarted = true;
        await stage('login')();
        if (state.verifiedOnLogin) cleanup.lastVerifiedSession = true;
      },
      workspace: stage('workspace'),
      work: stage('work'),
      onStageError: async () => trace.push('stage-error'),
      captureFinally: async () => {
        trace.push('capture-finally');
        if (failAt === 'capture-finally' || state.captureFails) throw new Error('capture-finally_failed');
      },
      hasLastVerifiedSession: () => cleanup.lastVerifiedSession,
      cleanupReceipts: async () => {
        trace.push('cleanup-receipts');
        if (failAt === 'cleanup-receipts') throw new Error('cleanup-receipts_failed');
      },
      logout: async () => {
        trace.push('logout');
        if (failAt === 'logout') throw new Error('logout_failed');
        cleanup.logoutStatus = 204;
      },
      closeBrowser: async () => {
        trace.push('close-browser');
        if (failAt === 'close-browser') throw new Error('close-browser_failed');
        return true;
      },
      getCleanupState: () => cleanup,
      removeFixture: async () => { trace.push('remove-fixture'); return failAt !== 'remove-fixture'; },
      removeProfile: async () => { trace.push('remove-profile'); return failAt !== 'remove-profile'; },
      removeLedger: async () => { trace.push('remove-ledger'); return failAt !== 'remove-ledger'; },
      persistFinalProof: async (result) => {
        trace.push('persist-final-proof');
        assert.equal(result.profileRetainedForRecovery, !result.profileRemoved);
        if (persist) return persist(result);
        if (persistFails) throw new Error('proof_write_failed');
      },
    }),
  };
}

test('workspace failure runs the whole cleanup lifecycle before final proof', async () => {
  const subject = harness({ failAt: 'workspace', state: { authStartedOnLogin: true, verifiedOnLogin: true } });
  const result = await subject.run();
  assert.match(result.stageError.message, /workspace_failed/);
  assert.equal(result.ok, false);
  assert.deepEqual(subject.trace, ['preflight', 'historical-gate', 'login', 'workspace', 'stage-error', 'capture-finally', 'cleanup-receipts', 'logout', 'close-browser', 'remove-fixture', 'remove-profile', 'remove-ledger', 'persist-final-proof']);
});

test('never-verified login failure retains the profile and persists refusal', async () => {
  const subject = harness({ failAt: 'login', state: { authStartedOnLogin: true, captureFails: true } });
  const result = await subject.run();
  assert.equal(result.profileRemoved, false);
  assert.equal(result.profileRetainedForRecovery, true);
  assert.equal(result.reconciliationRequired, true);
  assert.deepEqual(subject.trace, ['preflight', 'historical-gate', 'login', 'stage-error', 'capture-finally', 'close-browser', 'persist-final-proof']);
});

test('receipt cleanup failure still logs out and keeps recovery material', async () => {
  const subject = harness({ failAt: 'cleanup-receipts', state: { authStarted: true, lastVerifiedSession: true } });
  const result = await subject.run();
  assert.equal(result.cleanupError, true);
  assert.equal(result.profileRetainedForRecovery, true);
  assert.deepEqual(subject.trace.slice(5), ['capture-finally', 'cleanup-receipts', 'logout', 'close-browser', 'persist-final-proof']);
});

test('an attempted mutation without receipts retains fixture and profile', async () => {
  const subject = harness({ state: { authStarted: true, lastVerifiedSession: true, attempts: true, receipts: false, ownedIdsEmpty: false, ownedIdsCount: 1 } });
  const result = await subject.run();
  assert.equal(result.fixtureRemoved, false);
  assert.equal(result.profileRemoved, false);
  assert.equal(result.reconciliationRequired, true);
  assert.deepEqual(subject.trace, ['preflight', 'historical-gate', 'login', 'workspace', 'work', 'capture-finally', 'cleanup-receipts', 'logout', 'close-browser', 'persist-final-proof']);
});

test('failed final capture uses the known session for receipt cleanup and logout', async () => {
  const subject = harness({ failAt: 'capture-finally', state: { authStarted: true, lastVerifiedSession: true } });
  const result = await subject.run();
  assert.equal(result.finalCaptureError, true);
  assert.equal(result.profileRetainedForRecovery, true);
  assert.deepEqual(subject.trace.slice(5), ['capture-finally', 'cleanup-receipts', 'logout', 'close-browser', 'persist-final-proof']);
});

test('browser close failure prevents both local removals', async () => {
  const subject = harness({ failAt: 'close-browser', state: { authStarted: true, lastVerifiedSession: true } });
  const result = await subject.run();
  assert.equal(result.browserClosed, false);
  assert.equal(result.profileRetainedForRecovery, true);
  assert.deepEqual(subject.trace.slice(-2), ['close-browser', 'persist-final-proof']);
});

test('successful cleanup closes before removing fixture and profile', async () => {
  const subject = harness({ state: { authStarted: true, lastVerifiedSession: true } });
  const result = await subject.run();
  assert.equal(result.ok, true);
  assert.equal(result.profileRetainedForRecovery, false);
  assert.ok(subject.trace.indexOf('close-browser') < subject.trace.indexOf('remove-fixture'));
  assert.ok(subject.trace.indexOf('remove-fixture') < subject.trace.indexOf('remove-profile'));
  assert.deepEqual(subject.trace.slice(-4), ['remove-fixture', 'remove-profile', 'remove-ledger', 'persist-final-proof']);
});

test('preflight refusal persists a harmless not-started proof', async () => {
  const subject = harness({ failAt: 'preflight' });
  const result = await subject.run();
  assert.match(result.stageError.message, /preflight_failed/);
  assert.equal(result.reconciliationRequired, false);
  assert.equal(result.profileRetainedForRecovery, false);
  assert.deepEqual(subject.trace, ['preflight', 'stage-error', 'capture-finally', 'close-browser', 'remove-fixture', 'remove-profile', 'remove-ledger', 'persist-final-proof']);
});

test('a persistent final proof failure retries once and forbids PASS', async () => {
  const subject = harness({ state: { authStarted: true, lastVerifiedSession: true }, persistFails: true });
  const result = await subject.run();
  assert.equal(result.finalProofPersistenceError, true);
  assert.equal(result.finalProofRewriteError, true);
  assert.equal(result.ok, false);
  assert.equal(subject.trace.filter((event) => event === 'persist-final-proof').length, 2);
});

test('a post-rename directory sync failure rewrites the proof as refusal', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'proton-retry-proof-'));
  const proofPath = path.join(temp, 'proof.json');
  let fsyncCalls = 0;
  try {
    const subject = harness({
      state: { authStarted: true, lastVerifiedSession: true },
      persist: (result) => atomicJson(proofPath, {
        ok: result.ok,
        finalProofPersistenceError: Boolean(result.finalProofPersistenceError),
      }, {
        fsync(fd) {
          fsyncCalls += 1;
          if (fsyncCalls === 2) throw new Error('post_rename_directory_fsync_failed');
          syncFs.fsyncSync(fd);
        },
      }),
    });
    const result = await subject.run();
    const persisted = JSON.parse(await fs.readFile(proofPath, 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.finalProofPersistenceError, true);
    assert.deepEqual(persisted, { ok: false, finalProofPersistenceError: true });
    assert.equal(subject.trace.filter((event) => event === 'persist-final-proof').length, 2);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('historical receipt gate requires exact top-level and nested keys', () => {
  const receipt = { historicalRunId: '47e54df6-25fc-4240-b6ae-250a56722e1a', originalProofSha256: '7fcacdbc5976e6d62f83e4e2f240caf625204e188e72508cd8bb7db0a67a7dbf', correctedQuerySha256: querySha, correctedQueryResult: { headlessCftSessions: 0, allAdminSessionsInWindow: 3, canaryReceiptBackedItems: 0 }, mutationDisposition: 'no_attempts_and_no_receipts', fixtureRemoved: true, profileRemoved: true, authDisposition: 'unattributed_possible_session', safeToRetry: true, reviewerEvidenceSha256: reviewSha, limitation: 'unattributed' };
  assert.equal(historicalReceiptIsClosed(receipt, querySha), true);
  assert.equal(historicalReceiptIsClosed({ ...receipt, extra: true }, querySha), false);
  assert.equal(historicalReceiptIsClosed({ ...receipt, correctedQueryResult: { ...receipt.correctedQueryResult, extra: true } }, querySha), false);
});

test('cookie capture rejects noncanonical chunks, non-base64url bytes, and oversized payloads', () => {
  assert.equal(cookieSession([cookie('sb-matrx-auth-v2.0', session().slice(0, 15)), cookie('sb-matrx-auth-v2.1', session().slice(15))]).access_token, 'x'.repeat(32));
  assert.throws(() => cookieSession([cookie('sb-matrx-auth-v2.00')]), /canonical_cookie_scope_ambiguous/);
  assert.throws(() => cookieSession([cookie('sb-matrx-auth-v2', `${session()}$`)]), /canonical_cookie_base64url/);
  assert.throws(() => cookieSession([cookie('sb-matrx-auth-v2', `base64-${'A'.repeat(20_000)}`)]), /canonical_cookie_base64url/);
});

test('cleanup plan retains an uncertain authenticated profile', () => {
  assert.equal(cleanupPlan({ authStarted: true, lastVerifiedSession: false, finalSessionCertain: false, attempts: false, browserClosed: true }).retainProfile, true);
});
