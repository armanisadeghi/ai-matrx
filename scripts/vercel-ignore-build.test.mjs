// vercel-ignore-build.test.mjs — THE STRANDED-RELEASE LAW.
//
// The Ignored Build Step decides whether aimatrx.com (and its two satellites)
// build. Until 2026-09-14 it read the HEAD commit message and nothing else, so
// the shared checkout's mandatory routine — commit → `git pull --no-rebase
// origin main` → push — stranded every release it pushed under a merge commit:
// `release: a chat that was on a sandbox opens back on that sandbox`
// (f2386f68f0) rode in under merge head 12ef018999 and Vercel CANCELED
// dpl_5yi53GmMDeawdPrxVYxV2DmdQmUP2. Three releases were lost that way in a day.
//
// These cases run the REAL script against REAL throwaway git repositories with
// the REAL Vercel env vars (VERCEL_GIT_PREVIOUS_SHA, VERCEL_GIT_COMMIT_SHA,
// VERCEL_GIT_COMMIT_MESSAGE) — no stubbing of git, no stubbing of the script.
// Case (b) is red against the old HEAD-only script and green against the fix;
// (c) and (d) hold the other half of the law: a push with no NEW release
// commit for this project must never start a ~20-minute production build.
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

test("(b) THE CLASS: a merge head with a release commit one behind builds", () => {
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
    assert.equal(build, true, `the stranded-release class is back — release ${local} under merge head ${head} did not build:\n${output}`);
});

test("(b2) the class is caught even with NO previous SHA (first deploy / force-push)", () => {
    const { dir, head } = mergeHeadRepo("release: the release rides in under a merge");
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
    });
    assert.equal(build, true, `fallback path lost the release commit:\n${output}`);
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

test("(f) release-all: behind a merge head builds every project", () => {
    const { dir, base, head } = mergeHeadRepo("release-all: everything ships");
    track(dir);
    for (const t of ["main", "admin", "demos"]) {
        const { build, output } = runIgnore(dir, {
            MATRX_BUILD_TARGET: t,
            VERCEL_GIT_PREVIOUS_SHA: base,
            VERCEL_GIT_COMMIT_SHA: head,
            VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
        });
        assert.equal(build, true, `target=${t} missed release-all behind a merge:\n${output}`);
    }
});

// --- the live-site source of "what did this project last deploy" ------------
// VERCEL_GIT_PREVIOUS_SHA arrives EMPTY in these projects (measured live in
// dpl_5QW9DC83bEsmx9nwTBvk1EkJYBnX, which reported "HEAD only"), so the step
// asks the project's own production domain what commit it is serving. The seam
// is the URL: these cases point it at a real file:// document that answers the
// same JSON shape app/api/version/route.ts returns.

function versionDoc(dir, commit) {
    const path = join(dir, "version.json");
    writeFileSync(path, JSON.stringify({ deploymentId: "dpl_test", commit }));
    return `file://${path}`;
}

test("(g) with no previous SHA, a release after the LIVE commit builds", () => {
    const { dir, base, local, head } = mergeHeadRepo("release: the stranded one");
    track(dir);
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "Merge branch 'main' of github.com:armanisadeghi/ai-matrx",
        MATRX_DEPLOYED_SHA_URL: versionDoc(dir, base),
    });
    assert.equal(build, true, `the live-site range missed release ${local}:\n${output}`);
    assert.match(output, /production domain reports serving/, `it did not use the live answer:\n${output}`);
});

test("(h) with no previous SHA, a release the LIVE site already carries does not rebuild", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const released = commit(dir, "release: already live");
    const head = commit(dir, "chore(docs): a note after the release");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "chore(docs): a note after the release",
        MATRX_DEPLOYED_SHA_URL: versionDoc(dir, released),
    });
    assert.equal(build, false, `a release already serving on the live site rebuilt:\n${output}`);
});

test("(i) a live answer the clone cannot place says so and falls back", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const head = commit(dir, "chore: nothing to ship");
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "chore: nothing to ship",
        MATRX_DEPLOYED_SHA_URL: versionDoc(dir, "0123456789abcdef0123456789abcdef01234567"),
    });
    assert.equal(build, false);
    assert.match(output, /which this clone cannot place/, `the fallback was silent:\n${output}`);
});

test("(j) an older deployment of the version route (no commit field) is not fatal", () => {
    const dir = track(newRepo());
    commit(dir, "chore: baseline");
    const head = commit(dir, "release: ships even when the live answer is old");
    const path = join(dir, "old-version.json");
    writeFileSync(path, JSON.stringify({ deploymentId: "dpl_old" }));
    const { build, output } = runIgnore(dir, {
        MATRX_BUILD_TARGET: "main",
        VERCEL_GIT_COMMIT_SHA: head,
        VERCEL_GIT_COMMIT_MESSAGE: "release: ships even when the live answer is old",
        MATRX_DEPLOYED_SHA_URL: `file://${path}`,
    });
    assert.equal(build, true, `a release as HEAD must still build:\n${output}`);
    assert.match(output, /did not answer one/, `the missing commit field was silent:\n${output}`);
});
