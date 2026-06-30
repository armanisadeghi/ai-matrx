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

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

try {
    execSync(
        `node "${AIDREAM_SYNC_SCRIPT}" --url "${backendUrl}" --out "${outDir}"`,
        { stdio: 'inherit', cwd: PROJECT_ROOT },
    );
} catch {
    console.error('\n  ✗ Failed to sync types from the Python backend.');
    if (useLocal) {
        console.error('    Make sure the backend is running: uv run run.py (from aidream/)');
    } else {
        console.error(`    Could not reach: ${backendUrl}`);
        console.error('    Use --local to sync from your local backend instead.');
    }
    process.exit(1);
}

// ── Step 3: Type-check the codebase ────────────────────────────────────────

if (fastMode) {
    console.log('\n  ⊘ Step 3: Skipping type-check (--fast)\n');
} else {
    console.log('\n  Step 3: Running TypeScript type-check...\n');
    try {
        execSync(
            'node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.typecheck.json',
            {
                stdio: 'inherit',
                cwd: PROJECT_ROOT,
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
