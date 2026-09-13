import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, 'proton-import-retry-acceptance.cjs');
const helper = path.join(here, 'reconcile-proton-import-retry.py');
const dialog = path.resolve(here, '../../features/secrets/components/VaultCsvImportDialog.tsx');
const [runnerSource, helperSource, dialogSource] = await Promise.all([
  readFile(runner, 'utf8'), readFile(helper, 'utf8'), readFile(dialog, 'utf8'),
]);
execFileSync(process.execPath, ['--check', runner], { stdio: 'inherit' });
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
]) if (!runnerSource.includes(required)) throw new Error(`missing_canary_guard:${required}`);
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
