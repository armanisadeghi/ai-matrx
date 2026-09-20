/*
 * Explicitly armed localhost acceptance for the existing KeePass XML import.
 * It must prove the real dialog preserves the idempotency key after a completed
 * response is dropped; it never runs against a remote frontend or API origin.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const ARM = 'RUN_UNDER_REVIEW';
const WORKTREE = path.resolve(__dirname, '..', '..');
const ROOT = path.join(WORKTREE, '.matrx', 'keepass-localhost-acceptance');
const RUN = crypto.randomUUID();
const RUN_ROOT = path.join(ROOT, `run-${RUN}`);
const PROFILE = path.join(RUN_ROOT, 'private-profile');
const FIXTURE = path.join(RUN_ROOT, 'keepass.xml');
const FRONTEND = process.env.MATRX_KEEPASS_LOCAL_FRONTEND || 'http://127.0.0.1:3001';
const API = process.env.MATRX_KEEPASS_LOCAL_API || 'http://127.0.0.1:8000';

function localOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch { return false; }
}

function requireRuntimeConfig(env = process.env) {
  assert(env.MATRX_KEEPASS_IMPORT_CANARY === ARM, 'explicit_arm_required');
  assert(localOrigin(FRONTEND) && new URL(FRONTEND).port === '3001', 'localhost_frontend_required');
  assert(localOrigin(API), 'localhost_api_required');
  assert(env.AI_ADMIN_USERNAME === 'admin@admin.com' && typeof env.AI_ADMIN_PASSWORD === 'string' && env.AI_ADMIN_PASSWORD.length > 0, 'verified_admin_env_required');
}

function exactRetry(first, retry) {
  return first.key === retry.key && first.bodyHash === retry.bodyHash && first.id === retry.id;
}

function xml(items) {
  const entries = items.map(({ title, username, password, url }) => `<Entry><UUID>${crypto.randomUUID().replaceAll('-', '').slice(0, 22)}</UUID><String><Key>Title</Key><Value>${title}</Value></String><String><Key>UserName</Key><Value>${username}</Value></String><String><Key>Password</Key><Value Protected="True">${password}</Value></String><String><Key>URL</Key><Value>${url}</Value></String><String><Key>Notes</Key><Value>accepted synthetic notes</Value></String></Entry>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?><KeePassFile><Meta><Generator>KeePassXC</Generator><DatabaseName>Acceptance</DatabaseName></Meta><Root><Group><UUID>AAAAAAAAAAAAAAAAAAAAAA</UUID><Name>Acceptance</Name>${entries}</Group></Root></KeePassFile>`;
}

function assertOwned(body, label) {
  assert(body?.display_name === label && body?.definition_key === 'website_login', 'owned_create_shape');
  assert(body?.source === 'system_import' && body?.browser_fill_enabled === false, 'owned_create_custody');
}

async function main() {
  requireRuntimeConfig();
  await fs.mkdir(RUN_ROOT, { recursive: true, mode: 0o700 });
  const firstLabel = `KeePass local retry ${RUN.slice(0, 8)}`;
  const cancelOne = `KeePass local cancel one ${RUN.slice(0, 8)}`;
  const cancelTwo = `KeePass local cancel two ${RUN.slice(0, 8)}`;
  const fixture = xml([
    { title: firstLabel, username: `retry-${RUN.slice(0, 8)}@example.invalid`, password: `Synthetic-${RUN}`, url: 'https://retry.example.invalid/login' },
  ]);
  await fs.writeFile(FIXTURE, fixture, { mode: 0o600 });
  let context; let page; let accessToken; let orgId; let cleanupComplete = false; const ownedIds = new Set(); const requests = [];
  try {
    context = await chromium.launchPersistentContext(PROFILE, { headless: true });
    page = await context.newPage();
    context.on('request', (request) => {
      const headers = request.headers();
      if (!accessToken && /^bearer\s+.+/i.test(headers.authorization || '')) accessToken = headers.authorization.slice(7);
      if (!orgId && /^[0-9a-f-]{36}$/i.test(headers['x-organization-id'] || '')) orgId = headers['x-organization-id'];
    });
    await page.goto(`${FRONTEND}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.locator('#email').fill(process.env.AI_ADMIN_USERNAME);
    await page.locator('#password').fill(process.env.AI_ADMIN_PASSWORD);
    await Promise.all([page.waitForURL((url) => url.pathname !== '/login', { timeout: 30_000 }), page.getByRole('button', { name: 'Sign in', exact: true }).click()]);
    await page.goto(`${FRONTEND}/vault`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'KeePass / KeePassXC XML', exact: true }).click();
    await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await dialog.getByText(/1 selected; 0 skipped; 0 invalid; 0 unsupported/i).waitFor({ timeout: 20_000 });

    let first; let releaseCancel; const holdCancel = new Promise((resolve) => { releaseCancel = resolve; });
    let cancellationPhase = false;
    await context.route(`${API}/api/vault/items`, async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      const body = request.postDataJSON();
      const key = request.headers()['idempotency-key'];
      const bodyHash = crypto.createHash('sha256').update(request.postData() || '').digest('hex');
      if (body?.display_name === firstLabel) {
        assertOwned(body, firstLabel);
        const response = await route.fetch();
        assert(response.ok(), 'first_create_must_complete');
        const completed = await response.json();
        const attempt = { key, bodyHash, id: completed.id };
        requests.push(attempt);
        if (!first) { first = attempt; await route.abort('failed'); return; }
        assert(exactRetry(first, attempt), 'same_key_body_and_item_required');
        ownedIds.add(attempt.id); await route.fulfill({ response }); return;
      }
      if (body?.display_name === cancelOne || body?.display_name === cancelTwo) {
        assert(cancellationPhase, 'unexpected_cancel_create'); assertOwned(body, body.display_name);
        const response = await route.fetch(); const completed = await response.json(); ownedIds.add(completed.id);
        if (body.display_name === cancelOne) await holdCancel;
        await route.fulfill({ response }); return;
      }
      return route.continue();
    });
    await dialog.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).waitFor({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Retry current row', exact: true }).click();
    await dialog.getByText(/Imported 1; skipped 0; failed 0/i).waitFor({ timeout: 20_000 });
    assert(requests.length === 2 && exactRetry(requests[0], requests[1]) && ownedIds.size === 1, 'response_loss_exactly_one_item');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    const duplicate = page.getByRole('dialog');
    await duplicate.getByRole('combobox').click(); await page.getByRole('option', { name: 'KeePass / KeePassXC XML', exact: true }).click();
    await duplicate.locator('input[type="file"]').setInputFiles(FIXTURE);
    await duplicate.getByText(/0 selected; 1 skipped; 0 invalid/i).waitFor({ timeout: 20_000 });
    await page.keyboard.press('Escape');

    cancellationPhase = true;
    await fs.writeFile(FIXTURE, xml([
      { title: cancelOne, username: 'cancel-one@example.invalid', password: `Synthetic-${RUN}-one`, url: 'https://cancel.example.invalid/one' },
      { title: cancelTwo, username: 'cancel-two@example.invalid', password: `Synthetic-${RUN}-two`, url: 'https://cancel.example.invalid/two' },
    ]), { mode: 0o600 });
    await page.getByRole('button', { name: 'Import passwords', exact: true }).click();
    const cancelDialog = page.getByRole('dialog');
    await cancelDialog.getByRole('combobox').click(); await page.getByRole('option', { name: 'KeePass / KeePassXC XML', exact: true }).click();
    await cancelDialog.locator('input[type="file"]').setInputFiles(FIXTURE);
    await cancelDialog.getByText(/2 selected; 0 skipped; 0 invalid/i).waitFor({ timeout: 20_000 });
    await cancelDialog.getByRole('button', { name: 'Import selected records', exact: true }).click();
    await cancelDialog.getByRole('button', { name: 'Stop after current row', exact: true }).click();
    releaseCancel();
    await cancelDialog.getByText(/Imported 1; skipped 0; failed 0\. Stopped after the confirmed current row/i).waitFor({ timeout: 20_000 });
    assert(ownedIds.size === 2, 'cancel_must_commit_exactly_one_current_row');

    assert(accessToken && orgId, 'authenticated_local_request_context_required');
    for (const id of ownedIds) {
      const reveal = await fetch(`${API}/api/vault/items/${id}/reveal`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-Id': orgId, 'Content-Type': 'application/json' }, body: JSON.stringify({ field_key: 'import_source_record' }) });
      assert(reveal.ok(), 'encrypted_source_reveal_required');
      const value = (await reveal.json()).value;
      assert(typeof value === 'string' && value.includes('KeePassFile'), 'encrypted_source_preservation_required');
    }
    for (const id of ownedIds) {
      const response = await fetch(`${API}/api/vault/items/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}`, 'X-Organization-Id': orgId } });
      assert(response.ok(), 'owned_cleanup_required');
    }
    cleanupComplete = true;
    process.stdout.write('PASS: local KeePass response-loss, duplicate, cancellation, preservation, and owned cleanup\n');
  } finally {
    if (context) await context.close();
    await fs.rm(FIXTURE, { force: true });
    if (ownedIds.size === 0 || cleanupComplete) await fs.rm(PROFILE, { recursive: true, force: true });
  }
}

module.exports = { exactRetry, localOrigin, requireRuntimeConfig };
if (require.main === module) {
  if (process.env.MATRX_KEEPASS_IMPORT_CANARY !== ARM) throw new Error('inert_canary_requires_explicit_arm');
  main().catch((error) => { process.stderr.write(`Acceptance refused: ${/^[a-z0-9_]+$/.test(error.message) ? error.message : 'keepass_local_canary_failed'}\n`); process.exitCode = 1; });
}
