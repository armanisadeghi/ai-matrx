import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, 'proton-import-retry-acceptance.cjs');
const harness = path.join(here, 'proton-import-retry-harness.test.cjs');
const helper = path.join(here, 'reconcile-proton-import-retry.py');
const dialog = path.resolve(here, '../../features/secrets/components/VaultCsvImportDialog.tsx');
const recoveryReceipt = path.resolve(here, '../../.matrx/surface-check-artifacts/proton-retry-canary/reconciliation-47e54df6-25fc-4240-b6ae-250a56722e1a.json');
const recoveryQuery = path.resolve(here, '../../.matrx/surface-check-artifacts/proton-retry-canary/reconcile-run-47e54df6.sql');
const [runnerSource, helperSource, dialogSource, receiptSource, recoveryQuerySource] = await Promise.all([
  readFile(runner, 'utf8'), readFile(helper, 'utf8'), readFile(dialog, 'utf8'),
  readFile(recoveryReceipt, 'utf8'), readFile(recoveryQuery, 'utf8'),
]);
execFileSync(process.execPath, ['--check', runner], { stdio: 'inherit' });
execFileSync(process.execPath, ['--test', harness], { stdio: 'inherit' });
execFileSync('python3', ['-m', 'py_compile', helper], { stdio: 'inherit' });
for (const required of [
  "MATRX_PROTON_IMPORT_RETRY_CANARY !== 'RUN_UNDER_REVIEW'",
  "Proton Pass JSON or ZIP",
  "Retry current row",
  "route.fetch()",
  "await route.abort('failed')",
  "scope=local",
  "reconciliationRequired",
  "idempotency-key",
  "failureStage",
  "setStage('login_submit')",
  "setStage('first_import')",
  'cookieSession',
  'canonical_auth_post_login',
  'canonical_auth_finally',
  'historicalRecoveryAccepted',
  'async function runHarnessLifecycle({',
  'await persistArtifactPreflight()',
  'await historicalGate()',
  'await login()',
  'await workspace()',
  'await work()',
  'await captureFinally()',
  'await cleanupReceipts()',
  'await logout()',
  'await closeBrowser()',
  'getCleanupState',
  'removeFixture',
  'removeProfile',
  'removeLedger',
  'persistFinalProof',
  'finalProofPersistenceError',
  'finalProofRewriteError',
  'result.ok = false',
]) if (!runnerSource.includes(required)) throw new Error(`missing_canary_guard:${required}`);
if (runnerSource.includes('finalize: async')) throw new Error('opaque_lifecycle_finalizer_forbidden');
const duplicateReupload = runnerSource.indexOf("setStage('duplicate_reupload')");
const dismissDuplicateDialog = runnerSource.indexOf("await page.keyboard.press('Escape');", duplicateReupload);
const hiddenDuplicateDialog = runnerSource.indexOf("await dialog.waitFor({ state: 'hidden' });", dismissDuplicateDialog);
const reopenDuplicateDialog = runnerSource.indexOf("await page.getByRole('button', { name: 'Import passwords', exact: true }).click();", hiddenDuplicateDialog);
const reuploadDuplicateFile = runnerSource.indexOf('await chooseProtonFile(INPUT);', reopenDuplicateDialog);
if (!(duplicateReupload < dismissDuplicateDialog && dismissDuplicateDialog < hiddenDuplicateDialog && hiddenDuplicateDialog < reopenDuplicateDialog && reopenDuplicateDialog < reuploadDuplicateFile))
  throw new Error('duplicate_reupload_dialog_transition_missing');
if (!recoveryQuerySource.includes('WITH bounds AS')) throw new Error('missing_recovery_query_fix');
const receipt = JSON.parse(receiptSource);
const receiptKeys = [
  'historicalRunId', 'originalProofSha256', 'correctedQuerySha256', 'correctedQueryResult',
  'mutationDisposition', 'fixtureRemoved', 'profileRemoved', 'authDisposition', 'safeToRetry',
  'reviewerEvidenceSha256', 'limitation',
];
const resultKeys = ['headlessCftSessions', 'allAdminSessionsInWindow', 'canaryReceiptBackedItems'];
if (Object.keys(receipt).length !== receiptKeys.length || !receiptKeys.every((key) => Object.hasOwn(receipt, key)))
  throw new Error('invalid_recovery_receipt:top_level_keys');
if (Object.keys(receipt.correctedQueryResult ?? {}).length !== resultKeys.length || !resultKeys.every((key) => Object.hasOwn(receipt.correctedQueryResult, key)))
  throw new Error('invalid_recovery_receipt:result_keys');
for (const [key, value] of Object.entries({
  historicalRunId: '47e54df6-25fc-4240-b6ae-250a56722e1a',
  originalProofSha256: '7fcacdbc5976e6d62f83e4e2f240caf625204e188e72508cd8bb7db0a67a7dbf',
  mutationDisposition: 'no_attempts_and_no_receipts',
  authDisposition: 'unattributed_possible_session',
  safeToRetry: true,
  reviewerEvidenceSha256: '9f9cc2958a145d18be3c10e757c4bd408448e8ab9a2d7758dbc6727731b79e7f',
})) if (receipt[key] !== value) throw new Error(`invalid_recovery_receipt:${key}`);
if (receipt.correctedQuerySha256 !== createHash('sha256').update(recoveryQuerySource).digest('hex'))
  throw new Error('invalid_recovery_receipt:correctedQuerySha256');
for (const required of [
  "r.operation = 'create_item'",
  "r.principal_type = 'user'",
  "r.target_item_id IS NULL",
  'personal_item_scope',
]) if (!helperSource.includes(required)) throw new Error(`missing_receipt_guard:${required}`);
for (const required of [
  'value="proton_pass"',
  'Proton Pass JSON or ZIP',
  'Retry current row',
  'I approve disclosure of the listed destination and public-key',
]) if (!dialogSource.includes(required)) throw new Error(`dialog_contract_drift:${required}`);
process.stdout.write('PASS: inert Proton retry canary static contract\n');
