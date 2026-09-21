// vercel-ignore-build.test.mjs — THE ONE-PUSH/ONE-BUILD LAW.
//
// The Ignored Build Step decides whether aimatrx.com (and its two satellites)
// build. A range-based implementation fixed an old merge-head release
// workflow, but created a worse production failure: while a release was still
// building and the live SHA lagged main, every subsequent ordinary push
// rediscovered the same release commit and started another full build.
//
// These cases run the REAL script against REAL throwaway git repositories with
// the REAL Vercel env vars (VERCEL_GIT_PREVIOUS_SHA, VERCEL_GIT_COMMIT_SHA,
// VERCEL_GIT_COMMIT_MESSAGE) — no stubbing of git, no stubbing of the script.
// scripts/release.sh now pushes its generated release commit as HEAD. The rule
// is exact: only the pushed HEAD subject can authorize a build.
//
// Exit 1 = build. Exit 0 = skip.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const SCRIPT = new URL("./vercel-ignore-build.sh", import.meta.url).pathname;

const GIT_ENV = {
    ...process.env,
    GIT_AUTHOR_NAME: "Guard",
    GIT_AUTHOR_EMAIL: "guard@example.com",
    GIT_COMMITTER_NAME: "Guard",
    GIT_COMMITTER_EMAIL: "guard@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
};

function git(cwd, ...args) {
    return execFileSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" }).trim();
}

let fileCounter = 0;
function commit(cwd, message) {
    // A distinct file per commit so the fixture merge is always conflict-free.
    writeFileSync(join(cwd, `file-${(fileCounter += 1)}.txt`), `${message}\n`);
    git(cwd, "add", "-A");
    git(cwd, "commit", "-q", "-m", message);
    return git(cwd, "rev-parse", "HEAD");
}

function newRepo() {
    const dir = mkdtempSync(join(tmpdir(), "vercel-ignore-"));
    git(dir, "init", "-q", "-b", "main");
    return dir;
}

/** Run the real ignore step. Returns { build: boolean, output }. */
function runIgnore(cwd, env = {}) {
    const result = spawnSync("bash", [SCRIPT], {
        cwd,
        env: { ...GIT_ENV, ...env },
        encoding: "utf8",
    });
    assert.ok(
        result.status === 0 || result.status === 1,
        `ignore step exited ${result.status}: ${result.stderr}`,
    );
    return { build: result.status === 1, output: `${result.stdout}${result.stderr}` };
}

/**
 * Builds the exact shape of the shared-checkout routine:
 *   base (already deployed) → local commit → merge of a peer's commits → push.
 * Returns the repo dir plus the SHAs.
 */
function mergeHeadRepo(localSubject) {
    const dir = newRepo();
    const base = commit(dir, "chore: already deployed baseline");
    git(dir, "checkout", "-q", "-b", "peer");
    commit(dir, "feat(seo): a peer's work that landed on origin first");
    git(dir, "checkout", "-q", "main");
    const local = commit(dir, localSubject);
    git(dir, "merge", "-q", "--no-ff", "-m", "Merge branch 'main' of github.com:armanisadeghi/ai-matrx", "peer");
    const head = git(dir, "rev-parse", "HEAD");
    return { dir, base, local, head };
}

const dirs = [];
function track(dir) {
    dirs.push(dir);
    return dir;
}
test.after(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

test("(a) a release commit AS HEAD builds", () => {
    const dir = track(newRepo());
    const base = commit(dir, "chore: already deployed baseline");
    const head = commit(dir, "release: v1.2.3 the thing");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_PREVIOUS_SHA: base,
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "release: v1.2.3 the thing",
    });
    assert.equal(build, true, `expected a build, got skip:\n${output}`);
});

test("(b) THE DUPLICATE CLASS: a merge head with a release one behind SKIPS", () => {
    const { dir, base, local, head } = mergeHeadRepo(
        "release: a chat that was on a sandbox opens back on that sandbox",
    );
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_PREVIOUS_SHA: base,
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
    });
    assert.equal(build, false, `ordinary HEAD rebuilt release ${local} from earlier in its range:\n${output}`);
});

test("(b2) a merge head with a release behind SKIPS even with no previous SHA", () => {
    const { dir, head } = mergeHeadRepo("release: the release rides in under a merge");
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
    });
    assert.equal(build, false, `fallback range scanning rebuilt an earlier release:\n${output}`);
});

test("(c) a merge head with only chores behind it SKIPS", () => {
    const { dir, base, head } = mergeHeadRepo("fix(chat): the composer says what THIS chat is connected to");
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_PREVIOUS_SHA: base,
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
    });
    assert.equal(build, false, `a chores-only push started a production build:\n${output}`);
});

test("(d) a release commit ALREADY deployed does not build again", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const released = commit(dir, "release: v1.2.3 the thing");
    const head = commit(dir, "chore(docs): a note written after the release built");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_PREVIOUS_SHA: released,
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "chore(docs): a note written after the release built",
    });
    assert.equal(build, false, `an already-deployed release commit rebuilt:\n${output}`);
});

test("(e) the per-project prefixes still route: release-demos: builds demos only", () => {
    const dir = track(newRepo());
    const base = commit(dir, "chore: baseline");
    const head = commit(dir, "release-demos: the demos site");
    const env = {
        VERCEL_GIT_PREVIOUS_SHA: base,
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "release-demos: the demos site",
    };
    assert.equal(runIgnore(dir, { ...env, MATRX_BUILD_TARGET: "demos" }).build, true);
    assert.equal(runIgnore(dir, { ...env, MATRX_BUILD_TARGET: "main" }).build, false);
    assert.equal(runIgnore(dir, { ...env, MATRX_BUILD_TARGET: "admin" }).build, false);
});

test("(f) release-all: as HEAD builds every project", () => {
    const dir = track(newRepo());
    const base = commit(dir, "chore: baseline");
    const head = commit(dir, "release-all: everything ships");
    for (const t of ["main", "admin", "demos"]) {
        const { build, output } = runIgnore(dir, {
            MATRX_BUILD_TARGET: t,
            VERCEL_GIT_PREVIOUS_SHA: base,
            VERCEL_GIT_COMMIT_SHA: head,
            VERCEL_GIT_COMMIT_MESSAGE: "release-all: everything ships",
        });
        assert.equal(build, true, `target=${t} missed release-all as HEAD:\n${output}`);
    }
});

test("(g) live SHA lag cannot make an ordinary HEAD rebuild a release", () => {
    const { dir, base, local, head } = mergeHeadRepo("release: the stranded one");
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
        MATRX_DEPLOYED_SHA_URL: "https://unused.invalid/api/version",
    });
    assert.equal(build, false, `live lag rebuilt release ${local} behind ordinary HEAD:\n${output}`);
});

test("(h) a release already behind an ordinary HEAD does not rebuild", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const released = commit(dir, "release: already live");
    const head = commit(dir, "chore(docs): a note after the release");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "chore(docs): a note after the release",
    });
    assert.equal(build, false, `a release already serving on the live site rebuilt:\n${output}`);
});

test("(i) missing Vercel message falls back to the checked-out HEAD subject", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const head = commit(dir, "chore: nothing to ship");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
    });
    assert.equal(build, false);
    assert.match(output, /HEAD: chore: nothing to ship/, `the HEAD fallback was not reported:\n${output}`);
});

test("(j) unrelated live-version metadata cannot block a release HEAD", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const head = commit(dir, "release: ships even when the live answer is old");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "release: ships even when the live answer is old",
        MATRX_DEPLOYED_SHA_URL: "https://unused.invalid/api/version",
    });
    assert.equal(build, true, `a release as HEAD must still build:\n${output}`);
    assert.match(output, /pushed HEAD is a release commit/, `the HEAD decision was not reported:\n${output}`);
});
