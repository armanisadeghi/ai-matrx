import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
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
