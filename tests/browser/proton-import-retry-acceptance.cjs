/*
 * Armed-only production acceptance canary for one disposable Proton login.
 * It deliberately drops one completed create response and relies on the
 * dialog's real Retry current row affordance; it never replays a request.
 */
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { chromium } = require('/Users/armanisadeghi/code/matrx-frontend/node_modules/playwright');

const FRONTEND = 'https://www.aimatrx.com';
const API = 'https://server.app.matrxserver.com';
const DB = 'https://db.matrxserver.com';
const EXE =
  '/Users/armanisadeghi/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ARTIFACT_ROOT =
  '/Users/armanisadeghi/code/matrx-frontend/.matrx/surface-check-artifacts/proton-retry-canary';
const RUN = crypto.randomUUID();
const ROOT = path.join(ARTIFACT_ROOT, `run-${RUN}`);
const PROFILE = path.join(ROOT, `cft-private-profile-${crypto.randomUUID()}`);
const INPUT = path.join(ROOT, 'proton-input.json');
const PROOF = path.join(ROOT, 'proof.json');
const LEDGER = path.join(ROOT, 'pending-attempt-keys.json');
const HISTORICAL_RUN = '47e54df6-25fc-4240-b6ae-250a56722e1a';
const HISTORICAL_PROOF_SHA256 = '7fcacdbc5976e6d62f83e4e2f240caf625204e188e72508cd8bb7db0a67a7dbf';
const RECOVERY_REVIEW_SHA256 = '9f9cc2958a145d18be3c10e757c4bd408448e8ab9a2d7758dbc6727731b79e7f';
const RECOVERY_RECEIPT = path.join(ARTIFACT_ROOT, `reconciliation-${HISTORICAL_RUN}.json`);
const RECOVERY_QUERY = path.join(ARTIFACT_ROOT, 'reconcile-run-47e54df6.sql');
const AUTH_COOKIE = 'sb-matrx-auth-v2';
const CANONICAL_COOKIE_SCOPES = new Set(['www.aimatrx.com', '.aimatrx.com']);
const MAX_AUTH_COOKIE_CHUNKS = 16;
const MAX_AUTH_COOKIE_BYTES = 16 * 1024;
const MAX_AUTH_SESSION_BYTES = 12 * 1024;
const MAX_ACCESS_TOKEN_BYTES = 8 * 1024;
const LABEL = `Vault Proton retry ${RUN.slice(0, 8)} login`;
const USERNAME = `proton-${RUN.slice(0, 8)}@example.invalid`;
const PASSWORD = `Disposable-${crypto.randomUUID()}`;

let context;
let page;
let token;
let apiKey;
let userId;
let requestOrgId;
let baselineIds = [];
let firstBodyHash;
let firstKey;
let firstResponseDropped = false;
let activeIntercepts = 0;
let stage = 'artifact_preflight';
let authStarted = false;
let exactVerifiedSession = false;
let lastVerifiedAuth;
let finalAuthCertain = false;
const attemptKeys = new Set();
const ownedIds = new Set();
const proof = {
  scope: 'owned CFT Proton import response-loss idempotency acceptance',
  runId: RUN,
  startedAt: new Date().toISOString(),
  browser: 'Google Chrome for Testing private persistent profile',
  connectOverCDP: false,
  checks: {},
  attempts: [],
  cleanup: { reconciliationRequired: true, authDisposition: 'not_started', mutationDisposition: 'no_attempts' },
};

const assert = (value, code) => {
  if (!value) throw new Error(code);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function atomicJson(target, value, { fsync = syncFs.fsyncSync } = {}) {
  const temp = `${target}.tmp`;
  const fd = syncFs.openSync(
    temp,
    syncFs.constants.O_WRONLY | syncFs.constants.O_CREAT | syncFs.constants.O_TRUNC | syncFs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    syncFs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    fsync(fd);
  } finally {
    syncFs.closeSync(fd);
  }
  syncFs.renameSync(temp, target);
  const directory = syncFs.openSync(path.dirname(target), syncFs.constants.O_RDONLY);
  try {
    fsync(directory);
  } finally {
    syncFs.closeSync(directory);
  }
}

function persistProof() {
  atomicJson(PROOF, proof);
}

function persistAttemptLedger() {
  atomicJson(LEDGER, { attemptKeys: [...attemptKeys] });
}

function setStage(next) {
  stage = next;
  proof.stage = next;
  persistProof();
}

async function assertNoPriorPendingLedger() {
  const entries = await fs.readdir(ARTIFACT_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-') || entry.name === `run-${RUN}`) continue;
    const priorPath = path.join(ARTIFACT_ROOT, entry.name, 'proof.json');
    const priorBytes = await fs.readFile(priorPath).catch(() => null);
    const prior = priorBytes && JSON.parse(priorBytes);
    if (prior?.runId === HISTORICAL_RUN) {
      assert(await historicalRecoveryAccepted(entry.name, priorBytes, prior), 'historical_recovery_unaccepted');
      continue;
    }
    assert(prior?.cleanup?.reconciliationRequired === false && prior?.cleanup?.profileRemoved === true, 'previous_run_unreconciled');
  }
}

async function historicalRecoveryAccepted(directory, proofBytes, prior) {
  if (
    directory !== `run-${HISTORICAL_RUN}` ||
    sha256(proofBytes) !== HISTORICAL_PROOF_SHA256 ||
    !Array.isArray(prior?.attempts) || prior.attempts.length !== 0
  ) return false;
  const names = new Set(await fs.readdir(path.join(ARTIFACT_ROOT, directory)).catch(() => []));
  if (names.has('pending-attempt-keys.json') || names.has('proton-input.json') || [...names].some((name) => name.startsWith('cft-private-profile-'))) return false;
  const receipt = await fs.readFile(RECOVERY_RECEIPT, 'utf8').then(JSON.parse).catch(() => null);
  const querySha256 = await fs.readFile(RECOVERY_QUERY).then(sha256).catch(() => null);
  return historicalReceiptIsClosed(receipt, querySha256);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function historicalReceiptIsClosed(receipt, querySha256) {
  return (
    exactKeys(receipt, [
      'historicalRunId', 'originalProofSha256', 'correctedQuerySha256', 'correctedQueryResult',
      'mutationDisposition', 'fixtureRemoved', 'profileRemoved', 'authDisposition', 'safeToRetry',
      'reviewerEvidenceSha256', 'limitation',
    ]) &&
    exactKeys(receipt?.correctedQueryResult, ['headlessCftSessions', 'allAdminSessionsInWindow', 'canaryReceiptBackedItems']) &&
    receipt?.historicalRunId === HISTORICAL_RUN &&
    receipt?.originalProofSha256 === HISTORICAL_PROOF_SHA256 &&
    receipt?.mutationDisposition === 'no_attempts_and_no_receipts' &&
    receipt?.fixtureRemoved === true && receipt?.profileRemoved === true &&
    receipt?.authDisposition === 'unattributed_possible_session' &&
    receipt?.safeToRetry === true &&
    receipt?.reviewerEvidenceSha256 === RECOVERY_REVIEW_SHA256 &&
    receipt?.correctedQuerySha256 === querySha256 &&
    receipt?.correctedQueryResult?.headlessCftSessions === 0 &&
    receipt?.correctedQueryResult?.allAdminSessionsInWindow === 3 &&
    receipt?.correctedQueryResult?.canaryReceiptBackedItems === 0
  );
}

function cookieSession(cookies) {
  const groups = new Map();
  for (const cookie of cookies) {
    const match = /^sb-matrx-auth-v2(?:\.(0|[1-9]\d*))?$/.exec(cookie.name);
    if (!match || !CANONICAL_COOKIE_SCOPES.has(cookie.domain) || cookie.path !== '/' || !cookie.secure) continue;
    const scope = `${cookie.domain}|${cookie.path}|${cookie.secure}`;
    const entries = groups.get(scope) || [];
    entries.push({ index: match[1] === undefined ? null : Number(match[1]), value: cookie.value });
    groups.set(scope, entries);
  }
  assert(groups.size === 1, 'canonical_cookie_scope_ambiguous');
  const entries = [...groups.values()][0];
  const direct = entries.filter((entry) => entry.index === null);
  const chunks = entries.filter((entry) => entry.index !== null).sort((a, b) => a.index - b.index);
  assert(!(direct.length && chunks.length) && direct.length <= 1, 'canonical_cookie_shape_ambiguous');
  assert(chunks.length <= MAX_AUTH_COOKIE_CHUNKS, 'canonical_cookie_chunk_count');
  let encodedBytes = 0;
  const encoded = direct.length
    ? direct[0].value
    : chunks.map((entry, index) => {
        assert(entry.index === index, 'canonical_cookie_chunks_noncontiguous');
        assert(entry.value.length <= MAX_AUTH_COOKIE_BYTES, 'canonical_cookie_chunk_bytes');
        encodedBytes += entry.value.length;
        assert(encodedBytes <= MAX_AUTH_COOKIE_BYTES, 'canonical_cookie_total_bytes');
        return entry.value;
      }).join('');
  assert(encoded.startsWith('base64-'), 'canonical_cookie_encoding');
  const payload = encoded.slice('base64-'.length);
  assert(payload.length > 0 && payload.length <= MAX_AUTH_COOKIE_BYTES && /^[A-Za-z0-9_-]+$/.test(payload), 'canonical_cookie_base64url');
  const decoded = Buffer.from(payload, 'base64url');
  assert(decoded.length > 0 && decoded.length <= MAX_AUTH_SESSION_BYTES && decoded.toString('base64url') === payload, 'canonical_cookie_base64url_roundtrip');
  const session = JSON.parse(decoded.toString('utf8'));
  assert(typeof session?.access_token === 'string' && session.access_token.length > 20 && session.access_token.length <= MAX_ACCESS_TOKEN_BYTES, 'canonical_cookie_access_token');
  return session;
}

function cleanupPlan({ authStarted: started, lastVerifiedSession, finalSessionCertain, logoutStatus, attempts, receipts, browserClosed }) {
  const mustLogout = lastVerifiedSession;
  const logoutComplete = !mustLogout || logoutStatus === 204;
  const retainProfile = started && (!finalSessionCertain || !logoutComplete);
  return {
    mustLogout,
    retainProfile,
    canRemoveLocalSecrets: browserClosed === true && !retainProfile && logoutComplete && (!attempts || receipts === true),
  };
}

async function runHarnessLifecycle({
  persistArtifactPreflight,
  historicalGate,
  login,
  workspace,
  work,
  onStageError,
  captureFinally,
  hasLastVerifiedSession,
  cleanupReceipts,
  logout,
  closeBrowser,
  getCleanupState,
  removeFixture,
  removeProfile,
  removeLedger,
  persistFinalProof,
}) {
  let stageError;
  try {
    await persistArtifactPreflight();
    await historicalGate();
    await login();
    await workspace();
    await work();
  } catch (error) {
    stageError = error;
    try {
      await onStageError(error);
    } catch {
      // A reporting error must not skip the owned cleanup sequence.
    }
  }

  let finalCaptureError = false;
  let cleanupError = false;
  let logoutError = false;
  let browserClosed = false;
  let fixtureRemoved = false;
  let profileRemoved = false;
  let pendingLedgerRemoved = false;
  try {
    await captureFinally();
  } catch {
    finalCaptureError = true;
  }
  let verifiedSession = false;
  try {
    verifiedSession = hasLastVerifiedSession();
  } catch {
    cleanupError = true;
  }
  if (verifiedSession) {
    try {
      await cleanupReceipts();
    } catch {
      cleanupError = true;
    }
    try {
      await logout();
    } catch {
      logoutError = true;
    }
  }
  try {
    browserClosed = await closeBrowser();
  } catch {
    browserClosed = false;
  }

  let cleanupState;
  try {
    cleanupState = getCleanupState({ finalCaptureError, cleanupError, logoutError, browserClosed });
  } catch {
    cleanupError = true;
    cleanupState = {
      authStarted: true,
      lastVerifiedSession: verifiedSession,
      finalSessionCertain: false,
      logoutStatus: undefined,
      attempts: true,
      receipts: false,
      ownedIdsEmpty: false,
      ownedIdsCount: 0,
      softDeletedCount: 0,
      ownedActiveCount: 1,
      baselineUnchanged: false,
    };
  }
  const state = { ...cleanupState, finalSessionCertain: cleanupState.finalSessionCertain && !finalCaptureError };
  const removalPlan = cleanupPlan({ ...state, browserClosed });
  const removalAllowed = removalPlan.canRemoveLocalSecrets && !cleanupError && !logoutError;
  if (removalAllowed) {
    try {
      fixtureRemoved = await removeFixture();
    } catch {
      fixtureRemoved = false;
    }
    try {
      profileRemoved = await removeProfile();
    } catch {
      profileRemoved = false;
    }
  }
  const mutationCleanupComplete = state.attempts === false
    ? state.ownedIdsEmpty === true
    : state.receipts === true && state.softDeletedCount === state.ownedIdsCount &&
      state.ownedActiveCount === 0 && state.baselineUnchanged === true;
  let reconciliationRequired = !(
    mutationCleanupComplete &&
    (!state.authStarted || state.logoutStatus === 204) &&
    browserClosed === true && fixtureRemoved === true && profileRemoved === true
  );
  if (!reconciliationRequired && removalAllowed) {
    try {
      pendingLedgerRemoved = await removeLedger();
    } catch {
      pendingLedgerRemoved = false;
    }
    if (!pendingLedgerRemoved) reconciliationRequired = true;
  }
  const result = {
    stageError,
    finalCaptureError,
    cleanupError,
    logoutError,
    browserClosed,
    fixtureRemoved,
    profileRemoved,
    pendingLedgerRemoved,
    profileRetainedForRecovery: !profileRemoved,
    reconciliationRequired,
    ok: !stageError && !reconciliationRequired,
  };
  try {
    await persistFinalProof(result);
  } catch {
    result.finalProofPersistenceError = true;
    result.ok = false;
    try {
      await persistFinalProof(result);
    } catch {
      result.finalProofRewriteError = true;
    }
  }
  return result;
}

function fixture() {
  const itemId = crypto.randomUUID();
  return {
    version: '1.0.0',
    userId: 'acceptance-user',
    vaults: {
      acceptance: {
        description: '',
        display: {},
        name: 'Acceptance',
        items: [
          {
            itemId,
            shareId: 'acceptance',
            data: {
              type: 'login',
              content: {
                itemEmail: USERNAME,
                password: PASSWORD,
                urls: [`https://example.invalid/proton-retry/${itemId}`],
                totpUri: '',
                passkeys: [],
                itemUsername: USERNAME,
                autofillUrls: [{ url: `https://example.invalid/proton-retry/${itemId}`, mode: 0 }],
              },
              extraFields: [],
              metadata: { name: LABEL, note: 'Disposable retry acceptance', itemUuid: itemId },
            },
            state: 1,
            aliasEmail: null,
            contentFormatVersion: 8,
            createTime: 1,
            modifyTime: 2,
            pinned: false,
            files: [],
          },
        ],
      },
    },
  };
}

function assertFixture(value) {
  const item = value?.vaults?.acceptance?.items?.[0];
  assert(value?.version === '1.0.0' && value?.vaults?.acceptance?.items?.length === 1, 'fixture_cardinality');
  assert(item?.data?.type === 'login' && item?.data?.metadata?.name === LABEL, 'fixture_login_label');
  assert(item?.data?.content?.itemUsername === USERNAME && item?.data?.content?.password === PASSWORD, 'fixture_owned_values');
  assert(item?.state === 1 && item?.files?.length === 0 && item?.data?.content?.passkeys?.length === 0, 'fixture_no_unsupported_data');
}

async function api(url, options = {}) {
  assert(token && apiKey, 'canonical_auth_unavailable');
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
    apikey: apiKey,
  };
  if (requestOrgId) headers['X-Organization-Id'] = requestOrgId;
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`http_${response.status}_${options.label || 'request'}`);
  return response.status === 204 ? null : response.json();
}

async function listPersonalItems() {
  const result = await api(`${API}/api/vault/items?principal_type=user`, { label: 'personal_items' });
  assert(Array.isArray(result.items), 'personal_items_shape');
  return result.items;
}

async function itemMetadata(ids) {
  if (!ids.length) return [];
  const query = new URLSearchParams({
    select: 'id,user_id,organization_id,display_name,deleted_at,browser_fill_enabled',
    id: `in.(${ids.join(',')})`,
  });
  return api(`${DB}/rest/v1/credential_items?${query}`, {
    headers: { 'Accept-Profile': 'users' },
    label: 'metadata',
  });
}

async function resolveReceipts() {
  let resolved = { results: [] };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { stdout } = await execFileAsync(
      '/Users/armanisadeghi/code/aidream/.venv/bin/python',
      [path.join(__dirname, 'reconcile-proton-import-retry.py'), userId, requestOrgId, ...attemptKeys],
      { cwd: '/Users/armanisadeghi/code/aidream', timeout: 15_000, maxBuffer: 32_768 },
    );
    resolved = JSON.parse(stdout);
    assert(Array.isArray(resolved.results), 'receipt_shape');
    if (resolved.results.length === attemptKeys.size) break;
    await wait(1_000);
  }
  const seen = new Set();
  for (const receipt of resolved.results) {
    assert(
      attemptKeys.has(receipt.mutation_id) &&
        !seen.has(receipt.mutation_id) &&
        !baselineIds.includes(receipt.result_item_id) &&
        receipt.user_id === userId &&
        receipt.organization_id === null,
      'receipt_scope',
    );
    seen.add(receipt.mutation_id);
    ownedIds.add(receipt.result_item_id);
  }
  proof.cleanup.receiptReconciliation = seen.size === attemptKeys.size;
  proof.ownedFixtureIds = [...ownedIds];
  persistProof();
  return proof.cleanup.receiptReconciliation === true;
}

async function captureOwnedCanonicalAuth(phase) {
  assert(context && apiKey, 'canonical_auth_configuration');
  const session = cookieSession(await context.cookies(FRONTEND));
  const candidateToken = session.access_token;
  const response = await fetch(`${DB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${candidateToken}`, apikey: apiKey },
  });
  assert(response.status === 200, 'canonical_auth_identity_status');
  const identity = await response.json();
  assert(identity?.email === 'admin@admin.com' && typeof identity?.id === 'string', 'fresh_admin_identity');
  token = candidateToken;
  userId = identity.id;
  exactVerifiedSession = true;
  lastVerifiedAuth = { token: candidateToken, userId: identity.id };
  proof.checks.freshAdminIdentity = true;
  proof.checks[`canonicalAuth${phase}`] = true;
  proof.cleanup.authDisposition = 'exact_verified_session';
  const claims = token.split('.')[1];
  try {
    const sessionId = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')).session_id;
    if (typeof sessionId === 'string') proof.cleanup.sessionIdSha256 = sha256(sessionId);
  } catch {
    // A verified token is enough for local logout; the optional digest is diagnostic only.
  }
  persistProof();
}

async function selectAdminWorkspace() {
  await page.getByLabel('User menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Organization', exact: true }).click();
  const option = page.getByRole('option', { name: /admin's workspace/i, exact: true });
  await option.waitFor({ state: 'visible', timeout: 15_000 });
  await option.click();
  await page
    .locator('[data-slot="organization-picker-status"]')
    .filter({ hasText: /Working in\s+admin's workspace/i })
    .waitFor({ state: 'visible', timeout: 15_000 });
  proof.checks.adminWorkspaceExplicitlySelected = true;
}

async function chooseProtonFile(file) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Proton Pass JSON or ZIP', exact: true }).click();
  const input = dialog.locator('input[type="file"][accept*="application/json"]');
  await input.setInputFiles(file);
  await dialog.getByText(/1 selected; 0 skipped; 0 invalid; 0 unsupported; 0 deleted/i).waitFor({ state: 'visible', timeout: 20_000 });
}

function ownedCreate(body, key) {
  const fields = Array.isArray(body?.fields) ? body.fields : [];
  return (
    uuid(key) &&
    body?.principal?.type === 'user' &&
    body?.display_name === LABEL &&
    body?.definition_key === 'website_login' &&
    body?.source === 'system_import' &&
    body?.browser_fill_enabled === false &&
    fields.some((field) => field?.field_key === 'username' && field?.value === USERNAME) &&
    fields.some((field) => field?.field_key === 'password' && field?.value === PASSWORD)
  );
}

async function main() {
  let mainError;
  const lifecycle = await runHarnessLifecycle({
    persistArtifactPreflight: async () => {
      await fs.mkdir(ARTIFACT_ROOT, { recursive: true, mode: 0o700 });
      await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
      setStage('artifact_preflight');
    },
    historicalGate: assertNoPriorPendingLedger,
    login: async () => {
      setStage('fixture_prepare');
    const input = fixture();
    assertFixture(input);
    await fs.writeFile(INPUT, JSON.stringify(input), { mode: 0o600 });
    persistProof();
    require('/Users/armanisadeghi/code/matrx-frontend/node_modules/dotenv').config({
      path: '/Users/armanisadeghi/code/matrx-frontend/.env.local', quiet: true,
    });
    require('/Users/armanisadeghi/code/matrx-frontend/node_modules/dotenv').config({
      path: '/Users/armanisadeghi/code/aidream/.env', quiet: true,
    });
    apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert(process.env.AI_ADMIN_USERNAME === 'admin@admin.com' && process.env.AI_ADMIN_PASSWORD && apiKey, 'admin_configuration');

    setStage('browser_launch');
    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath: EXE,
      headless: true,
    });
    setStage('login_navigation');
    page = await context.newPage();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== DB && url.origin !== API) return;
      const headers = request.headers();
      const authorization = headers.authorization;
      if (!token && typeof authorization === 'string' && /^Bearer\s+.+/i.test(authorization))
        token = authorization.slice(7);
      if (
        url.origin === API &&
        !requestOrgId &&
        typeof headers['x-organization-id'] === 'string' &&
        uuid(headers['x-organization-id'])
      )
        requestOrgId = headers['x-organization-id'];
    });
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#email').fill(process.env.AI_ADMIN_USERNAME);
    await page.locator('#password').fill(process.env.AI_ADMIN_PASSWORD);
    setStage('login_submit');
    authStarted = true;
    proof.cleanup.authDisposition = 'auth_unknown';
    persistProof();
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    setStage('canonical_auth_post_login');
    await captureOwnedCanonicalAuth('PostLogin');
    },
    workspace: async () => {
      setStage('workspace_select');
    await selectAdminWorkspace();
    setStage('vault_navigation');
    await page.goto(`${FRONTEND}/vault`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    setStage('canonical_auth_before_workspace_work');
    await captureOwnedCanonicalAuth('BeforeWorkspaceWork');
    },
    work: async () => {

    setStage('production_preflight');
    const preflight = await fetch(`${API}/api/vault/items`, {
      method: 'OPTIONS',
      headers: {
        Origin: FRONTEND,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,x-organization-id,idempotency-key',
      },
    });
    const allowed = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert(preflight.status === 200 && ['authorization', 'content-type', 'x-organization-id', 'idempotency-key'].every((header) => allowed.includes(header)), 'production_preflight');
    proof.checks.productionPreflight200 = true;

    setStage('dialog_open');
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    await page.getByRole('dialog').getByText('Import passwords', { exact: true }).waitFor({ state: 'visible' });
    await chooseProtonFile(INPUT);
    const dialog = page.getByRole('dialog');
    setStage('fixture_normalization');
    const browserFill = dialog.getByText(/Enable browser fill only for eligible logins/i).locator('xpath=..').getByRole('switch');
    assert((await browserFill.getAttribute('data-state')) === 'unchecked', 'browser_fill_off');
    const approval = dialog.getByText(/I approve disclosure of the listed destination and public-key metadata/i).locator('xpath=..').getByRole('switch');
    await approval.click();

    setStage('create_intercept_arm');
    await context.route(`${API}/api/vault/items`, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      let body;
      try {
        body = request.postDataJSON();
      } catch {
        return route.continue();
      }
      const key = request.headers()['idempotency-key'];
      if (!ownedCreate(body, key)) return route.continue();
      const bodyHash = sha256(request.postData() || '');
      if (!firstKey) {
        requestOrgId = request.headers()['x-organization-id'];
        assert(uuid(requestOrgId), 'canonical_request_org');
        baselineIds = (await listPersonalItems()).map((item) => item.id).sort();
        assert(new Set(baselineIds).size === baselineIds.length, 'baseline_personal_ids');
        proof.baselinePersonalIdCount = baselineIds.length;
        firstKey = key;
        firstBodyHash = bodyHash;
        attemptKeys.add(key);
        proof.cleanup.mutationDisposition = 'attempts_dispatched';
        persistAttemptLedger();
        proof.attempts.push({ phase: 'response_dropped_after_completion', keySha256: sha256(key), bodySha256: bodyHash });
        persistProof(); // Durable ledger precedes the server request.
        activeIntercepts += 1;
        try {
          const response = await route.fetch();
          assert(response.status() >= 200 && response.status() < 300, 'first_create_not_completed');
          firstResponseDropped = true;
          proof.checks.firstCreateCompletedBeforeDrop = true;
          persistProof();
          await route.abort('failed');
        } finally {
          activeIntercepts -= 1;
        }
        return;
      }
      assert(key === firstKey && bodyHash === firstBodyHash, 'retry_command_changed');
      attemptKeys.add(key);
      persistAttemptLedger();
      proof.attempts.push({ phase: 'ui_retry', keySha256: sha256(key), bodySha256: bodyHash });
      persistProof();
      await route.continue();
    });

    setStage('first_import');
    await dialog.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    assert(firstResponseDropped && firstKey && attemptKeys.size === 1, 'first_response_loss_not_observed');
    setStage('ui_retry');
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).click();
    await dialog.getByText(/Imported 1; skipped 0; failed 0/i).waitFor({ state: 'visible', timeout: 20_000 });
    assert(proof.attempts.length === 2 && proof.attempts.every((attempt) => attempt.keySha256 === sha256(firstKey) && attempt.bodySha256 === firstBodyHash), 'same_key_same_body');

    setStage('receipt_reconciliation');
    assert(await resolveReceipts(), 'receipt_reconciliation');
    assert(ownedIds.size === 1, 'receipt_exact_one_id');
    const metadata = await itemMetadata([...ownedIds]);
    assert(metadata.length === 1 && metadata[0].display_name === LABEL && metadata[0].user_id === userId && metadata[0].organization_id === null && metadata[0].browser_fill_enabled === false && metadata[0].deleted_at === null, 'owned_metadata');
    proof.checks.uiImportedOne = true;
    proof.checks.exactOneReceiptBackedId = true;

    // The current dialog refreshes existingItems after onCommitted. Reopen only
    // after the successful retry and require the real duplicate preflight.
    setStage('duplicate_reupload');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    await chooseProtonFile(INPUT);
    await page.getByRole('dialog').getByText(/0 selected; 1 skipped; 0 invalid; 0 unsupported; 0 deleted/i).waitFor({ state: 'visible', timeout: 20_000 });
    proof.checks.reuploadDuplicateSkipped = true;
    },
    onStageError: async (error) => {
      mainError = error;
      proof.failureStage = stage;
      proof.failureCode = /^[a-z0-9_]{1,80}$/.test(String(error?.message || '')) ? error.message : `canary_${stage}_refused`;
    },
    captureFinally: async () => {
      if (!context || !authStarted) {
        finalAuthCertain = true;
        return;
      }
      setStage('canonical_auth_finally');
      await captureOwnedCanonicalAuth('Finally');
      finalAuthCertain = true;
    },
    hasLastVerifiedSession: () => Boolean(lastVerifiedAuth),
    cleanupReceipts: async () => {
      if (!lastVerifiedAuth || !requestOrgId || !attemptKeys.size) return;
      token = lastVerifiedAuth.token;
      userId = lastVerifiedAuth.userId;
      const reconciled = await resolveReceipts();
      if (!reconciled) return;
      for (const id of ownedIds) {
        assert(!baselineIds.includes(id), 'cleanup_baseline_refusal');
        await api(`${API}/api/vault/items/${id}`, { method: 'DELETE', label: 'owned_cleanup_delete' });
      }
      const retired = await itemMetadata([...ownedIds]);
      proof.cleanup.softDeletedCount = retired.filter((row) => row.deleted_at !== null).length;
      proof.cleanup.ownedActiveCount = retired.filter((row) => row.deleted_at === null).length;
      const afterIds = (await listPersonalItems()).map((item) => item.id).sort();
      proof.cleanup.baselineUnchanged = JSON.stringify(afterIds) === JSON.stringify(baselineIds);
    },
    logout: async () => {
      if (!lastVerifiedAuth || !apiKey) return;
      const response = await fetch(`${DB}/auth/v1/logout?scope=local`, {
        method: 'POST', headers: { apikey: apiKey, Authorization: `Bearer ${lastVerifiedAuth.token}` },
      });
      proof.cleanup.localLogoutStatus = response.status;
    },
    closeBrowser: async () => {
      for (let i = 0; i < 30 && activeIntercepts; i += 1) await wait(500);
      proof.cleanup.activeInterceptsAtClose = activeIntercepts;
      if (context) await context.close();
      return true;
    },
    getCleanupState: () => {
      return {
        authStarted,
        lastVerifiedSession: Boolean(lastVerifiedAuth),
        finalSessionCertain: finalAuthCertain,
        logoutStatus: proof.cleanup.localLogoutStatus,
        attempts: attemptKeys.size > 0,
        receipts: proof.cleanup.receiptReconciliation,
        ownedIdsEmpty: ownedIds.size === 0,
        ownedIdsCount: ownedIds.size,
        softDeletedCount: proof.cleanup.softDeletedCount,
        ownedActiveCount: proof.cleanup.ownedActiveCount,
        baselineUnchanged: proof.cleanup.baselineUnchanged,
      };
    },
    removeFixture: async () => {
      await fs.rm(INPUT, { force: true });
      return !(await fs.stat(INPUT).then(() => true, () => false));
    },
    removeProfile: async () => {
      assert(PROFILE.startsWith(`${ROOT}/cft-private-profile-`), 'private_profile_path');
      await fs.rm(PROFILE, { recursive: true, force: true });
      return !(await fs.stat(PROFILE).then(() => true, () => false));
    },
    removeLedger: async () => {
      await fs.rm(LEDGER, { force: true });
      return !(await fs.stat(LEDGER).then(() => true, () => false));
    },
    persistFinalProof: async (result) => {
      if (result.finalCaptureError) proof.cleanup.authDisposition = authStarted ? 'auth_unknown' : 'not_started';
      if (result.cleanupError || result.logoutError) proof.cleanup.cleanupRefused = true;
      proof.cleanup.browserClosed = result.browserClosed;
      proof.cleanup.fixtureRemoved = result.fixtureRemoved;
      proof.cleanup.profileRemoved = result.profileRemoved;
      proof.cleanup.pendingLedgerRemoved = result.pendingLedgerRemoved;
      proof.cleanup.profileRetainedForRecovery = result.profileRetainedForRecovery;
      proof.cleanup.reconciliationRequired = result.reconciliationRequired;
      proof.cleanup.finalProofPersistenceError = Boolean(result.finalProofPersistenceError);
      proof.finishedAt = new Date().toISOString();
      proof.ok = result.ok && !mainError;
      persistProof();
    },
  });
  if (!lifecycle.ok || !proof.ok) {
    process.stderr.write('Acceptance refused: Proton retry canary did not prove complete cleanup\n');
    process.exitCode = 1;
  } else process.stdout.write('PASS: Proton UI response-loss retry acceptance and exact cleanup\n');
}

module.exports = { atomicJson, cookieSession, cleanupPlan, historicalReceiptIsClosed, runHarnessLifecycle };

if (require.main === module) {
  if (process.env.MATRX_PROTON_IMPORT_RETRY_CANARY !== 'RUN_UNDER_REVIEW')
    throw new Error('inert_canary_requires_explicit_arm');
  main().catch(() => {
    process.stderr.write('Canary initialization refused; no acceptance claimed\n');
    process.exitCode = 1;
  });
}
