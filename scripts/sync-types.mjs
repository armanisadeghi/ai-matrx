#!/usr/bin/env node
/**
 * sync-types — Single command to keep generated types in sync.
 *
 * 🚨 WHERE THE API CONTRACT COMES FROM. By default it comes from the aidream
 * CHECKOUT at ../aidream, emitted offline from that working tree — NOT from a
 * running server. A server serves the code it booted with, and the DEPLOYED
 * server is behind the repo for as long as the deploy train takes. On 2026-09-12
 * a lane regenerated from production while aidream `c64f53507` was undeployed,
 * the new `api-types.ts` lost `DirectiveConfirmRequest.conversation_id`, and the
 * client's use of that field — the approve path's IDEMPOTENCY NAMESPACE — was
 * deleted to clear the type error, so a second Approve wrote a second project
 * (DD-128). Generating from the checkout makes that impossible by construction.
 *
 * Modes:
 *   pnpm sync-types          → all 3 steps, API contract from the ../aidream CHECKOUT
 *   pnpm sync-types:live     → all 3 steps, API contract from the LIVE server,
 *                              REFUSED unless that server contains the commit pinned
 *                              in scripts/aidream-contract-pin.json
 *   pnpm sync-types:local    → all 3 steps against the LOCAL backend (http://localhost:8000)
 *   pnpm sync-types:fast     → ONLY step 2 against the LOCAL backend (no db-types, no typecheck)
 *
 * Steps:
 *   1. Update Supabase database types          → `pnpm db-types`
 *   2. Update Python API types (paths/schemas) → from the checkout, or from a server
 *   2b. THE DROP GUARD                         → `scripts/typegen-drop-guard.mjs`:
 *      nothing is written if the new schema deletes a property this repo still reads
 *   3. Type-check the codebase                 → `tsc --noEmit -p tsconfig.typecheck.json`
 *      (source + generated DB/API types only — not .next route artifacts)
 *
 * Step 1 must run first so that any new database columns are available to the
 * type-check in step 3. The fast mode is for iterating against a local backend
 * when you only care about refreshing the Python API surface.
 */

import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { assertServerMeetsContractPin } from './aidream-contract-pin.mjs';
import { normalizeDuplicateOperationIds as normalizeOperationIds } from './typegen-openapi-normalize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
function getArg(name, fallback) {
    const idx = args.indexOf(name);
    if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
    return fallback;
}

const fastMode = args.includes('--fast');
const useLocal = fastMode || args.includes('--local');
const explicitUrl = getArg('--url', null);
const useLive = args.includes('--live');
// The checkout is the default. A server is used only when one is explicitly asked for.
const useCheckout = !useLocal && !useLive && !explicitUrl;

const LIVE_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL_PROD
    ? `${process.env.NEXT_PUBLIC_BACKEND_URL_PROD}`
    : 'https://server.app.matrxserver.com';
const LOCAL_BACKEND_URL = 'http://localhost:8000';
const backendUrl = explicitUrl ?? (useLocal ? LOCAL_BACKEND_URL : LIVE_BACKEND_URL);
const outDir = resolve(PROJECT_ROOT, 'types/python-generated');

const AIDREAM_ROOT = resolve(PROJECT_ROOT, '../aidream');
const AIDREAM_SYNC_SCRIPT = resolve(AIDREAM_ROOT, 'scripts/sync-types.mjs');
const AIDREAM_GENERATED_DIR = resolve(AIDREAM_ROOT, 'aidream/api/generated');
const DROP_GUARD = resolve(__dirname, 'typegen-drop-guard.mjs');
const BACKEND_SYNC_MAX_ATTEMPTS = 3;
const BACKEND_SYNC_RETRY_DELAY_MS = 3_000;

/**
 * aidream's generated filename → this repo's filename. The two repos disagree on
 * one name only (`canvas-chat.ts` here arrives as `canvas-chat-ts.ts`, from the
 * bundle-name fallback in aidream's own sync script); keep it, so nothing that
 * imports the existing path breaks.
 */
const BUNDLE_FILES = {
    'stream-events.ts': 'stream-events.ts',
    'stream-events.schema.json': 'stream-events.schema.json',
    'llm-params.schema.json': 'llm-params.schema.json',
    'llm-params-enums.generated.ts': 'llm-params-enums.generated.ts',
    'llm-enums.ts': 'llm-enums.ts',
    'workflow-events.ts': 'workflow-events.ts',
    'source-attribution.ts': 'source-attribution.ts',
    'provision-offers.ts': 'provision-offers.ts',
    'canvas-chat.ts': 'canvas-chat-ts.ts',
};

/**
 * Normalize duplicate operationIds in a staged openapi.json, in place.
 * The rewrite itself lives in `typegen-openapi-normalize.mjs` so that
 * `check:api-types-fresh` re-derives the committed file through the SAME code.
 */
function normalizeDuplicateOperationIds(openapiPath) {
    const document = JSON.parse(readFileSync(openapiPath, 'utf-8'));
    const normalized = normalizeOperationIds(document);
    if (normalized > 0) {
        writeFileSync(openapiPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
    }
    return normalized;
}

function generateApiTypes(openapiPath, apiTypesPath) {
    const generator = resolve(PROJECT_ROOT, 'node_modules/.bin/openapi-typescript');
    if (!existsSync(generator)) {
        throw new Error(`openapi-typescript not found at ${generator}`);
    }
    execFileSync(
        generator,
        [openapiPath, '--default-non-nullable', 'false', '-o', apiTypesPath],
        { stdio: 'inherit', cwd: PROJECT_ROOT },
    );
}

/** Emit the contract from the aidream working tree — no server, no network. */
function generateFromCheckout(stagingDir) {
    if (!existsSync(AIDREAM_ROOT)) {
        console.error(`  ✗ The aidream checkout is not at ${AIDREAM_ROOT}.`);
        console.error('    That checkout IS the API contract this repo is written against. Clone it,');
        console.error('    or, knowing the risk, generate from a server with: pnpm sync-types:live\n');
        process.exit(1);
    }

    console.log('  Generating the API contract from the aidream CHECKOUT (no server)...\n');
    console.log('  Note: this also refreshes aidream\'s own committed snapshot in');
    console.log(`        ${AIDREAM_GENERATED_DIR}, so that checkout may now show as modified.\n`);
    try {
        execSync('uv run python scripts/generate_types.py all --direct', {
            stdio: 'inherit',
            cwd: AIDREAM_ROOT,
        });
    } catch {
        console.error('\n  ✗ The aidream checkout could not emit its schema.');
        console.error('    Fix the errors above (usually a Python import error in that tree), then re-run.');
        console.error(`    The same command on its own: cd ${AIDREAM_ROOT} && uv run python scripts/emit_openapi.py --out /tmp/openapi.json\n`);
        process.exit(1);
    }

    for (const [from, to] of Object.entries({ 'openapi.json': 'openapi.json', ...BUNDLE_FILES })) {
        const source = join(AIDREAM_GENERATED_DIR, from);
        if (!existsSync(source)) continue;
        copyFileSync(source, join(stagingDir, to));
    }
}

/** Fetch the contract from a running server via aidream's own sync script. */
async function generateFromServer(stagingDir) {
    if (!existsSync(AIDREAM_SYNC_SCRIPT)) {
        console.error(`  ✗ sync-types.mjs not found at: ${AIDREAM_SYNC_SCRIPT}`);
        console.error('    Make sure the aidream repo is cloned at ../aidream');
        process.exit(1);
    }

    for (let attempt = 1; attempt <= BACKEND_SYNC_MAX_ATTEMPTS; attempt += 1) {
        try {
            execSync(
                `node "${AIDREAM_SYNC_SCRIPT}" --url "${backendUrl}" --out "${stagingDir}"`,
                { stdio: 'inherit', cwd: PROJECT_ROOT },
            );
            return;
        } catch {
            if (attempt < BACKEND_SYNC_MAX_ATTEMPTS) {
                console.warn(
                    `\n  ⚠ Backend unavailable. Retrying in 3 seconds ` +
                    `(${attempt}/${BACKEND_SYNC_MAX_ATTEMPTS - 1} retries)...\n`,
                );
                await delay(BACKEND_SYNC_RETRY_DELAY_MS);
            }
        }
    }

    console.error('\n  ✗ Failed to sync types from the Python backend.');
    if (useLocal) {
        console.error('    Make sure the backend is running: uv run run.py (from aidream/)');
    } else {
        console.error(`    Could not reach: ${backendUrl}`);
        console.error('    Generate from the checkout instead: pnpm sync-types');
    }
    process.exit(1);
}

const modeLabel = fastMode
    ? 'fast (api types only, local server)'
    : useCheckout
      ? 'checkout (all 3 steps)'
      : useLocal
        ? 'local (all 3 steps)'
        : 'server (all 3 steps)';
const sourceLabel = useCheckout ? `${AIDREAM_ROOT} (working tree, no server)` : backendUrl;

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  sync-types');
console.log(`  Contract from: ${sourceLabel}`);
console.log(`  Mode:          ${modeLabel}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ── Step 1: Supabase database types ────────────────────────────────────────

if (fastMode) {
    console.log('  ⊘ Step 1: Skipping Supabase db-types (--fast)\n');
} else {
    console.log('  Step 1: Updating Supabase database types (pnpm db-types)...\n');
    try {
        execSync('pnpm db-types', { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log('\n  ✓ Supabase types updated.\n');
    } catch {
        console.error('\n  ✗ Failed to update Supabase database types.');
        console.error('    Fix the errors above, then re-run: pnpm sync-types\n');
        process.exit(1);
    }

    // Step 1b: Regenerate the type-safe entity-token vocabulary from
    // platform.entity_types (the source of truth for every association token).
    console.log('  Step 1b: Regenerating entity-token vocabulary (pnpm gen:entity-types)...\n');
    try {
        execSync('pnpm gen:entity-types', { stdio: 'inherit', cwd: PROJECT_ROOT });
        console.log('\n  ✓ Entity-token vocabulary updated.\n');
    } catch {
        console.error('\n  ✗ Failed to regenerate entity-token vocabulary.');
        console.error('    Fix the errors above, then re-run: pnpm sync-types\n');
        process.exit(1);
    }
}

// ── Step 2: Python API types ───────────────────────────────────────────────

console.log('  Step 2: Getting the API contract...\n');

// A remote server may be the source only if it already contains the pinned commit.
if (!useCheckout && !useLocal) {
    await assertServerMeetsContractPin(backendUrl);
}

// Everything lands in staging first: nothing in types/python-generated/ is
// touched until the drop guard has seen the new schema.
const stagingDir = mkdtempSync(join(tmpdir(), 'matrx-sync-types-'));
try {
    if (useCheckout) generateFromCheckout(stagingDir);
    else await generateFromServer(stagingDir);

    const stagedOpenApi = join(stagingDir, 'openapi.json');
    if (!existsSync(stagedOpenApi)) {
        console.error('\n  ✗ No openapi.json was produced. Nothing was written.\n');
        process.exit(1);
    }

    // ── Step 2b: THE DROP GUARD ────────────────────────────────────────────
    const currentOpenApi = join(outDir, 'openapi.json');
    if (existsSync(currentOpenApi)) {
        console.log('\n  Step 2b: Checking the new schema does not delete anything this repo reads...\n');
        try {
            execFileSync(
                'node',
                [DROP_GUARD, '--before', currentOpenApi, '--after', stagedOpenApi],
                { stdio: 'inherit', cwd: PROJECT_ROOT },
            );
        } catch {
            console.error('  Nothing was written. types/python-generated/ is untouched.\n');
            process.exit(1);
        }
    }

    // FastAPI emits one operationId when a single route accepts several HTTP
    // methods. OpenAPI requires operationIds to be unique, and generated TS
    // rejects the duplicate property names. Normalize consumer-side so the
    // frontend contract remains independently releasable from the backend.
    try {
        const normalized = normalizeDuplicateOperationIds(stagedOpenApi);
        if (normalized > 0) console.log(`  ✓ Normalized ${normalized} duplicate OpenAPI operation ids.\n`);
        console.log('  Running openapi-typescript...\n');
        generateApiTypes(stagedOpenApi, join(stagingDir, 'api-types.ts'));
    } catch (error) {
        console.error('\n  ✗ Failed to generate the API types from the new schema.');
        console.error(`    ${error instanceof Error ? error.message : String(error)}`);
        console.error('    Nothing was written. types/python-generated/ is untouched.\n');
        process.exit(1);
    }

    for (const name of ['openapi.json', 'api-types.ts', ...Object.values(BUNDLE_FILES)]) {
        const staged = join(stagingDir, name);
        if (existsSync(staged)) copyFileSync(staged, join(outDir, name));
    }
    console.log(`  ✓ types/python-generated/ updated from ${sourceLabel}\n`);
} finally {
    rmSync(stagingDir, { recursive: true, force: true });
}

// ── Step 3: Type-check the codebase ────────────────────────────────────────

if (fastMode) {
    console.log('\n  ⊘ Step 3: Skipping type-check (--fast)\n');
} else {
    console.log('\n  Step 3: Running TypeScript type-check...\n');
    try {
        execSync(
            './node_modules/.bin/tsc --noEmit -p tsconfig.typecheck.json',
            {
                stdio: 'inherit',
                cwd: PROJECT_ROOT,
                env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=8192' },
            },
        );
        console.log('\n  ✓ Type-check passed — all types are aligned.\n');
    } catch {
        console.error('\n  ✗ TYPE ERRORS DETECTED');
        console.error('    The codebase has types that are out of sync with the backend.');
        console.error('    Fix the errors above, then re-run: pnpm sync-types\n');
        process.exit(1);
    }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  sync-types complete');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
