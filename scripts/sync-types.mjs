#!/usr/bin/env node
/**
 * sync-types — Single command to keep generated types in sync.
 *
 * Modes:
 *   pnpm sync-types          → all 3 steps against the LIVE backend
 *   pnpm sync-types:local    → all 3 steps against the LOCAL backend (http://localhost:8000)
 *   pnpm sync-types:fast     → ONLY step 2 against the LOCAL backend (no db-types, no typecheck)
 *
 * Steps:
 *   1. Update Supabase database types          → `pnpm db-types`
 *   2. Update Python API types (paths/schemas) → via aidream/scripts/sync-types.mjs
 *   3. Type-check the codebase                 → `tsc --noEmit -p tsconfig.typecheck.json`
 *      (source + generated DB/API types only — not .next route artifacts)
 *
 * Step 1 must run first so that any new database columns are available to the
 * type-check in step 3. The fast mode is for iterating against a local backend
 * when you only care about refreshing the Python API surface.
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

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

const LIVE_BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL
    ? `${process.env.NEXT_PUBLIC_BACKEND_URL}`
    : 'https://server.app.matrxserver.com';
const LOCAL_BACKEND_URL = 'http://localhost:8000';
const backendUrl = getArg('--url', useLocal ? LOCAL_BACKEND_URL : LIVE_BACKEND_URL);
const outDir = resolve(PROJECT_ROOT, 'types/python-generated');

const AIDREAM_SYNC_SCRIPT = resolve(PROJECT_ROOT, '../aidream/scripts/sync-types.mjs');
const BACKEND_SYNC_MAX_ATTEMPTS = 3;
const BACKEND_SYNC_RETRY_DELAY_MS = 3_000;
const OPENAPI_METHODS = new Set([
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
]);

function normalizeDuplicateOperationIds(openapiPath) {
    const document = JSON.parse(readFileSync(openapiPath, 'utf-8'));
    const operationsById = new Map();

    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!OPENAPI_METHODS.has(method) || !operation || typeof operation !== 'object') continue;
            const operationId = operation.operationId;
            if (typeof operationId !== 'string' || operationId.length === 0) continue;
            const entries = operationsById.get(operationId) ?? [];
            entries.push({ method, operation, path });
            operationsById.set(operationId, entries);
        }
    }

    let normalized = 0;
    for (const [operationId, entries] of operationsById) {
        if (entries.length < 2) continue;
        for (const { method, operation, path } of entries) {
            const pathSuffix = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
            operation.operationId = `${operationId}__${method}__${pathSuffix}`;
            normalized += 1;
        }
    }

    if (normalized > 0) {
        writeFileSync(openapiPath, `${JSON.stringify(document, null, 2)}\n`, 'utf-8');
    }
    return normalized;
}

function regenerateOpenApiTypes(outDir) {
    const openapiPath = resolve(outDir, 'openapi.json');
    if (!existsSync(openapiPath)) return;

    const normalized = normalizeDuplicateOperationIds(openapiPath);
    if (normalized === 0) return;

    const generator = resolve(PROJECT_ROOT, 'node_modules/.bin/openapi-typescript');
    if (!existsSync(generator)) {
        throw new Error(`openapi-typescript not found at ${generator}`);
    }
    execFileSync(
        generator,
        [
            openapiPath,
            '--default-non-nullable',
            'false',
            '-o',
            resolve(outDir, 'api-types.ts'),
        ],
        { stdio: 'inherit', cwd: PROJECT_ROOT },
    );
    console.log(`  ✓ Normalized ${normalized} duplicate OpenAPI operation ids.\n`);
}

const modeLabel = fastMode ? 'fast (api types only)' : useLocal ? 'local (all 3 steps)' : 'live (all 3 steps)';

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  sync-types');
console.log(`  Backend: ${backendUrl}`);
console.log(`  Mode:    ${modeLabel}`);
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

if (!existsSync(AIDREAM_SYNC_SCRIPT)) {
    console.error(`  ✗ sync-types.mjs not found at: ${AIDREAM_SYNC_SCRIPT}`);
    console.error('    Make sure the aidream repo is cloned at ../aidream');
    process.exit(1);
}

console.log('  Step 2: Fetching API types from Python backend...\n');

let backendSyncSucceeded = false;
for (let attempt = 1; attempt <= BACKEND_SYNC_MAX_ATTEMPTS; attempt += 1) {
    try {
        execSync(
            `node "${AIDREAM_SYNC_SCRIPT}" --url "${backendUrl}" --out "${outDir}"`,
            { stdio: 'inherit', cwd: PROJECT_ROOT },
        );
        backendSyncSucceeded = true;
        break;
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

if (!backendSyncSucceeded) {
    console.error('\n  ✗ Failed to sync types from the Python backend.');
    if (useLocal) {
        console.error('    Make sure the backend is running: uv run run.py (from aidream/)');
    } else {
        console.error(`    Could not reach: ${backendUrl}`);
        console.error('    Use --local to sync from your local backend instead.');
    }
    process.exit(1);
}

try {
    // FastAPI emits one operationId when a single route accepts several HTTP
    // methods. OpenAPI requires operationIds to be unique, and generated TS
    // rejects the duplicate property names. Normalize consumer-side so the
    // frontend contract remains independently releasable from the backend.
    regenerateOpenApiTypes(outDir);
} catch (error) {
    console.error('\n  ✗ Failed to normalize duplicate OpenAPI operation ids.');
    console.error(`    ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
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
