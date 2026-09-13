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

if (process.env.MATRX_PROTON_IMPORT_RETRY_CANARY !== 'RUN_UNDER_REVIEW')
  throw new Error('inert_canary_requires_explicit_arm');

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
  cleanup: { reconciliationRequired: true },
};

const assert = (value, code) => {
  if (!value) throw new Error(code);
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

function atomicJson(target, value) {
  const temp = `${target}.tmp`;
  const fd = syncFs.openSync(
    temp,
    syncFs.constants.O_WRONLY | syncFs.constants.O_CREAT | syncFs.constants.O_TRUNC | syncFs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    syncFs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
    syncFs.fsyncSync(fd);
  } finally {
    syncFs.closeSync(fd);
  }
  syncFs.renameSync(temp, target);
  const directory = syncFs.openSync(ROOT, syncFs.constants.O_RDONLY);
  try {
    syncFs.fsyncSync(directory);
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

async function assertNoPriorPendingLedger() {
  const entries = await fs.readdir(ARTIFACT_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-')) continue;
    const prior = await fs
      .readFile(path.join(ARTIFACT_ROOT, entry.name, 'proof.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    assert(
      prior?.cleanup?.reconciliationRequired === false && prior?.cleanup?.profileRemoved === true,
      'previous_run_unreconciled',
    );
  }
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

async function waitForCanonicalAuth() {
  for (let i = 0; i < 80 && (!token || !apiKey); i += 1) await wait(250);
  assert(token && apiKey, 'canonical_auth_capture');
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

(async () => {
  let mainError;
  try {
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true, mode: 0o700 });
    await assertNoPriorPendingLedger();
    await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
    const input = fixture();
    assertFixture(input);
    await fs.writeFile(INPUT, JSON.stringify(input), { mode: 0o600 });
    persistProof();
    require('/Users/armanisadeghi/code/matrx-frontend/node_modules/dotenv').config({
      path: '/Users/armanisadeghi/code/aidream/.env', quiet: true,
    });
    assert(process.env.AI_ADMIN_USERNAME === 'admin@admin.com' && process.env.AI_ADMIN_PASSWORD, 'admin_configuration');

    context = await chromium.launchPersistentContext(PROFILE, {
      executablePath: EXE,
      headless: true,
    });
    page = await context.newPage();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== DB && url.origin !== API) return;
      const headers = request.headers();
      const authorization = headers.authorization;
      if (!token && typeof authorization === 'string' && /^Bearer\s+.+/i.test(authorization))
        token = authorization.slice(7);
      if (!apiKey && typeof headers.apikey === 'string' && headers.apikey.length > 10)
        apiKey = headers.apikey;
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
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Sign in', exact: true }).click(),
    ]);
    await selectAdminWorkspace();
    await page.goto(`${FRONTEND}/vault`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await waitForCanonicalAuth();

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

    const identity = await api(`${DB}/auth/v1/user`, { label: 'fresh_identity' });
    assert(identity?.email === 'admin@admin.com' && typeof identity?.id === 'string', 'fresh_admin_identity');
    userId = identity.id;
    proof.checks.freshAdminIdentity = true;

    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    await page.getByRole('dialog').getByText('Import passwords', { exact: true }).waitFor({ state: 'visible' });
    await chooseProtonFile(INPUT);
    const dialog = page.getByRole('dialog');
    const browserFill = dialog.getByText(/Enable browser fill only for eligible logins/i).locator('xpath=..').getByRole('switch');
    assert((await browserFill.getAttribute('data-state')) === 'unchecked', 'browser_fill_off');
    const approval = dialog.getByText(/I approve disclosure of the listed destination and public-key metadata/i).locator('xpath=..').getByRole('switch');
    await approval.click();

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

    await dialog.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
    assert(firstResponseDropped && firstKey && attemptKeys.size === 1, 'first_response_loss_not_observed');
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).click();
    await dialog.getByText(/Imported 1; skipped 0; failed 0/i).waitFor({ state: 'visible', timeout: 20_000 });
    assert(proof.attempts.length === 2 && proof.attempts.every((attempt) => attempt.keySha256 === sha256(firstKey) && attempt.bodySha256 === firstBodyHash), 'same_key_same_body');

    assert(await resolveReceipts(), 'receipt_reconciliation');
    assert(ownedIds.size === 1, 'receipt_exact_one_id');
    const metadata = await itemMetadata([...ownedIds]);
    assert(metadata.length === 1 && metadata[0].display_name === LABEL && metadata[0].user_id === userId && metadata[0].organization_id === null && metadata[0].browser_fill_enabled === false && metadata[0].deleted_at === null, 'owned_metadata');
    proof.checks.uiImportedOne = true;
    proof.checks.exactOneReceiptBackedId = true;

    // The current dialog refreshes existingItems after onCommitted. Reopen only
    // after the successful retry and require the real duplicate preflight.
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    await chooseProtonFile(INPUT);
    await page.getByRole('dialog').getByText(/0 selected; 1 skipped; 0 invalid; 0 unsupported; 0 deleted/i).waitFor({ state: 'visible', timeout: 20_000 });
    proof.checks.reuploadDuplicateSkipped = true;
  } catch (error) {
    mainError = error;
    proof.failureCode = /^[a-z0-9_]{1,80}$/.test(String(error?.message || '')) ? error.message : 'canary_step_refused';
  } finally {
    for (let i = 0; i < 30 && activeIntercepts; i += 1) await wait(500);
    proof.cleanup.activeInterceptsAtClose = activeIntercepts;
    try {
      if (context) await context.close();
      proof.cleanup.browserClosed = true;
    } catch {
      proof.cleanup.browserClosed = false;
    }
    try {
      await fs.rm(INPUT, { force: true });
    } catch {}
    proof.cleanup.fixtureRemoved = !(await fs.stat(INPUT).then(() => true, () => false));
    try {
      if (token && apiKey && userId && requestOrgId && attemptKeys.size) {
        const reconciled = await resolveReceipts();
        if (reconciled) {
          for (const id of ownedIds) {
            assert(!baselineIds.includes(id), 'cleanup_baseline_refusal');
            await api(`${API}/api/vault/items/${id}`, { method: 'DELETE', label: 'owned_cleanup_delete' });
          }
          const retired = await itemMetadata([...ownedIds]);
          proof.cleanup.softDeletedCount = retired.filter((row) => row.deleted_at !== null).length;
          proof.cleanup.ownedActiveCount = retired.filter((row) => row.deleted_at === null).length;
          const afterIds = (await listPersonalItems()).map((item) => item.id).sort();
          proof.cleanup.baselineUnchanged = JSON.stringify(afterIds) === JSON.stringify(baselineIds);
        }
        const logout = await fetch(`${DB}/auth/v1/logout?scope=local`, {
          method: 'POST', headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
        });
        proof.cleanup.localLogoutStatus = logout.status;
      }
    } catch {
      proof.cleanup.cleanupRefused = true;
    }
    try {
      if (context) await context.close();
    } catch {}
    try {
      if (PROFILE.startsWith(`${ROOT}/cft-private-profile-`)) await fs.rm(PROFILE, { recursive: true, force: true });
    } catch {}
    proof.cleanup.profileRemoved = !(await fs.stat(PROFILE).then(() => true, () => false));
    proof.finishedAt = new Date().toISOString();
    proof.cleanup.reconciliationRequired = !(
      proof.cleanup.receiptReconciliation === true &&
      proof.cleanup.softDeletedCount === ownedIds.size &&
      proof.cleanup.ownedActiveCount === 0 &&
      proof.cleanup.baselineUnchanged === true &&
      proof.cleanup.localLogoutStatus === 204 &&
      proof.cleanup.browserClosed === true &&
      proof.cleanup.fixtureRemoved === true &&
      proof.cleanup.profileRemoved === true
    );
    if (!proof.cleanup.reconciliationRequired) {
      try {
        await fs.rm(LEDGER, { force: true });
      } catch {}
      proof.cleanup.pendingLedgerRemoved = !(await fs.stat(LEDGER).then(() => true, () => false));
      if (!proof.cleanup.pendingLedgerRemoved) proof.cleanup.reconciliationRequired = true;
    }
    proof.ok = !mainError && !proof.cleanup.reconciliationRequired;
    persistProof();
  }
  if (!proof.ok) {
    process.stderr.write('Acceptance refused: Proton retry canary did not prove complete cleanup\n');
    process.exitCode = 1;
  } else process.stdout.write('PASS: Proton UI response-loss retry acceptance and exact cleanup\n');
})().catch(() => {
  process.stderr.write('Canary initialization refused; no acceptance claimed\n');
  process.exitCode = 1;
});
