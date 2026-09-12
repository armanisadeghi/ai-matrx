#!/usr/bin/env node
/**
 * aidream-contract-pin — is this server new enough to generate types from?
 *
 * A server may be the source of the API contract ONLY when the code it is
 * running already contains the commit this repo is written against. That commit
 * lives in `scripts/aidream-contract-pin.json`, and the answer is decided by git
 * ancestry in the ../aidream checkout against the server's own `/health/version`.
 *
 * On 2026-09-12 nobody asked this question: types were regenerated from
 * production while aidream `c64f53507` was undeployed, the schema came back
 * without `DirectiveConfirmRequest.conversation_id`, and the client's use of it —
 * the approve path's idempotency namespace — was deleted to clear the type error
 * (DD-128).
 *
 * Usage:  node scripts/aidream-contract-pin.mjs [--url https://server...]
 * Exit 0 = the server contains the pin. Exit 1 = it is behind, with the sentence.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
export const AIDREAM_ROOT = resolve(PROJECT_ROOT, '../aidream');
const CONTRACT_PIN_PATH = resolve(__dirname, 'aidream-contract-pin.json');

export function readContractPin() {
    return JSON.parse(readFileSync(CONTRACT_PIN_PATH, 'utf-8'));
}

function commitKnown(sha) {
    try {
        execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: AIDREAM_ROOT, stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * @returns {Promise<{ok: boolean, liveSha: string|null, minimum: string, reason: string, message: string}>}
 * Never throws for the expected answers — the caller decides what refusal means.
 */
export async function checkServerMeetsContractPin(url) {
    const pin = readContractPin();
    const minimum = pin.minimum_aidream_sha;
    const base = { minimum, reason: pin.reason, liveSha: null, ok: false };

    if (!existsSync(AIDREAM_ROOT)) {
        return { ...base, message:
            `The aidream checkout is not at ${AIDREAM_ROOT}, so there is no way to tell whether ` +
            `${url} is running code older than this repo. Clone it, or generate from a checkout you have.` };
    }

    let liveSha = null;
    try {
        const res = await fetch(`${url}/health/version`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        liveSha = (await res.json()).git_sha;
    } catch (error) {
        return { ...base, message:
            `Could not ask ${url} which commit it is running (${error instanceof Error ? error.message : String(error)}). ` +
            `Without that answer there is no way to know whether the schema it serves is older than this repo.` };
    }
    if (typeof liveSha !== 'string' || liveSha.length === 0) {
        return { ...base, message: `${url}/health/version did not say which commit it is running.` };
    }

    if (!commitKnown(minimum)) {
        return { ...base, liveSha, message:
            `The pinned minimum commit ${minimum} is not in the aidream checkout. ` +
            `Run \`git fetch\` in ../aidream, or fix scripts/aidream-contract-pin.json.` };
    }
    if (!commitKnown(liveSha)) {
        return { ...base, liveSha, message:
            `${url} is running aidream ${liveSha}, which this checkout has never seen. ` +
            `Run \`git fetch\` in ../aidream so its age can be judged, then try again.` };
    }

    try {
        execFileSync('git', ['merge-base', '--is-ancestor', minimum, liveSha], { cwd: AIDREAM_ROOT, stdio: 'ignore' });
    } catch {
        return { ...base, liveSha, message:
            `${url} IS BEHIND THE CONTRACT THIS REPO IS WRITTEN AGAINST. It is running aidream ${liveSha}, ` +
            `which does not yet contain ${minimum}. Why that commit is the floor: ${pin.reason}` };
    }

    return { ok: true, liveSha, minimum, reason: pin.reason, message:
        `${url} is running aidream ${liveSha}, which contains the pinned ${minimum}.` };
}

/** The same check, but it ends the process on refusal with the remedy spelled out. */
export async function assertServerMeetsContractPin(url) {
    const result = await checkServerMeetsContractPin(url);
    if (result.ok) {
        console.log(`  ✓ ${result.message}\n`);
        return result;
    }
    console.error(`\n  ✗ ${result.message}`);
    console.error('\n    Generating from it would DELETE fields this repo uses, and the type errors');
    console.error('    would read as "your code is wrong" when the truth is "the server is behind".');
    console.error('    Do one of these — never delete the client code:');
    console.error('      • pnpm sync-types                 (generate from the ../aidream checkout)');
    console.error('      • wait for the deploy train, then re-run this\n');
    process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const idx = process.argv.indexOf('--url');
    const url = idx !== -1 && idx + 1 < process.argv.length
        ? process.argv[idx + 1]
        : (process.env.NEXT_PUBLIC_BACKEND_URL_PROD || 'https://server.app.matrxserver.com');
    await assertServerMeetsContractPin(url);
}
