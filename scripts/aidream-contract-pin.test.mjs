import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkCheckoutMeetsContractPin } from './aidream-contract-pin.mjs';

function git(cwd, ...args) {
    return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

test('checkout contract pin refuses a stale release clone and accepts a descendant', () => {
    const root = mkdtempSync(join(tmpdir(), 'aidream-contract-pin-'));
    try {
        git(root, 'init', '-q');
        git(root, 'config', 'user.email', 'contract-pin@example.invalid');
        git(root, 'config', 'user.name', 'Contract Pin Test');
        git(root, 'commit', '--allow-empty', '-qm', 'stale release clone');
        const stale = git(root, 'rev-parse', 'HEAD');

        git(root, 'commit', '--allow-empty', '-qm', 'contract floor');
        const minimum = git(root, 'rev-parse', 'HEAD');
        const pin = { minimum_aidream_sha: minimum, reason: 'test contract floor' };
        git(root, 'checkout', '-q', '--detach', stale);

        const refused = checkCheckoutMeetsContractPin(root, pin);
        assert.equal(refused.ok, false);
        assert.equal(refused.checkoutSha, stale);
        assert.match(refused.message, /IS BEHIND THE CONTRACT/);
        assert.match(refused.message, /Refresh|git fetch|does not contain/);

        git(root, 'checkout', '-q', minimum);
        git(root, 'commit', '--allow-empty', '-qm', 'newer checkout');
        const accepted = checkCheckoutMeetsContractPin(root, pin);
        assert.equal(accepted.ok, true);
        assert.notEqual(accepted.checkoutSha, stale);
        assert.equal(accepted.minimum, minimum);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('sync-types checkout mode runs the pin preflight before generation', () => {
    const root = mkdtempSync(join(tmpdir(), 'aidream-sync-preflight-'));
    try {
        git(root, 'init', '-q');
        git(root, 'config', 'user.email', 'contract-pin@example.invalid');
        git(root, 'config', 'user.name', 'Contract Pin Test');
        git(root, 'commit', '--allow-empty', '-qm', 'stale release clone');
        const stale = git(root, 'rev-parse', 'HEAD');
        git(root, 'commit', '--allow-empty', '-qm', 'contract floor');
        const minimum = git(root, 'rev-parse', 'HEAD');
        git(root, 'checkout', '-q', '--detach', stale);
        const pinPath = join(root, 'contract-pin.json');
        writeFileSync(pinPath, JSON.stringify({
            minimum_aidream_sha: minimum,
            reason: 'entrypoint test contract floor',
        }));

        const run = () => spawnSync(
            process.execPath,
            [
                'scripts/sync-types.mjs', '--preflight-only',
                '--aidream-root', root, '--contract-pin-path', pinPath,
            ],
            { cwd: new URL('..', import.meta.url), encoding: 'utf-8' },
        );

        const refused = run();
        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /IS BEHIND THE CONTRACT/);
        assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, /Step 1: Updating Supabase/);

        git(root, 'checkout', '-q', minimum);
        const accepted = run();
        assert.equal(accepted.status, 0, accepted.stderr);
        assert.match(accepted.stdout, /Contract-source preflight complete/);
        assert.doesNotMatch(accepted.stdout, /Step 1: Updating Supabase/);

        assert.notEqual(stale, minimum);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
