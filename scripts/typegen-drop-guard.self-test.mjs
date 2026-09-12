#!/usr/bin/env node
/**
 * typegen-drop-guard.self-test — proves the guard RED on the real 2026-09-12
 * regression and GREEN when there is nothing to catch.
 *
 * Nothing here is manufactured:
 *   • the two schemas come from the REAL OpenAPI documents — `before` emitted
 *     offline from the aidream checkout, `after` the one production served while
 *     `c64f53507` was undeployed (scripts/fixtures/typegen-drop/);
 *   • the source tree searched is the REAL `ProposedDirectivesZone.tsx` as it
 *     stood at commit `b884fb4708`, restored out of git history into a temp dir.
 *
 * Run: pnpm check:typegen-drop:self-test
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runDropGuard } from "./typegen-drop-guard.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const FIXTURES = resolve(__dirname, "fixtures/typegen-drop");
const BEFORE = join(FIXTURES, "before.checkout.openapi.json");
const AFTER = join(FIXTURES, "after.live-behind.openapi.json");

/** The call site as it really was, at the commit named. */
const CALL_SITE = "features/matrx-envelope/components/ProposedDirectivesZone.tsx";
const USED_THE_FIELDS = "b884fb4708"; // conversation_id + result.message present
const DELETED_THE_FIELDS = "4c827d5530"; // both deleted to clear the type error

function treeAt(commit) {
    const dir = mkdtempSync(join(tmpdir(), "typegen-drop-selftest-"));
    const source = execFileSync("git", ["show", `${commit}:${CALL_SITE}`], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
    });
    const target = join(dir, CALL_SITE);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, "utf-8");
    return dir;
}

const failures = [];
const check = (label, condition, detail) => {
    if (condition) console.log(`  ✓ ${label}`);
    else {
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
        failures.push(label);
    }
};

console.log("\n  typegen-drop-guard self-test\n");

// ── RED: the exact 2026-09-12 regeneration, against the tree that used the fields
const redTree = treeAt(USED_THE_FIELDS);
try {
    const red = runDropGuard({ beforePath: BEFORE, afterPath: AFTER, root: redTree });
    const names = red.violations.map((v) => v.name).sort();
    check(
        `RED: regenerating from the behind-server refuses, naming conversation_id and message (got: ${names.join(", ") || "nothing"})`,
        names.join(",") === "conversation_id,message",
    );
    const hitFiles = red.violations.flatMap((v) => v.hits).join("\n");
    check(
        "RED: the refusal points at the real call site, ProposedDirectivesZone.tsx",
        hitFiles.includes("ProposedDirectivesZone.tsx"),
        hitFiles.slice(0, 400),
    );
} finally {
    rmSync(redTree, { recursive: true, force: true });
}

// ── GREEN 1: nothing dropped (the checkout schema against itself)
const greenTree = treeAt(USED_THE_FIELDS);
try {
    const green = runDropGuard({ beforePath: BEFORE, afterPath: BEFORE, root: greenTree });
    check(
        `GREEN: generating from the checkout drops nothing (violations: ${green.violations.length})`,
        green.violations.length === 0 && green.dropped.length === 0,
    );
} finally {
    rmSync(greenTree, { recursive: true, force: true });
}

// ── GREEN 2: the SAME drop, against the tree that stopped using conversation_id.
// This is what proves the guard measures USE and is not just a schema diff.
// `message` stays flagged there, correctly: that file still reads `.message` on
// each receipt. The guard matches property NAMES, not name-at-path, so it errs
// toward refusing — which is the safe direction for a contract guard.
const unusedTree = treeAt(DELETED_THE_FIELDS);
try {
    const quiet = runDropGuard({ beforePath: BEFORE, afterPath: AFTER, root: unusedTree });
    const stillFlagged = quiet.violations.map((v) => v.name).sort().join(",");
    const nowUnused = quiet.unusedDrops.map((d) => d.name).sort().join(",");
    check(
        `GREEN: conversation_id stops being a violation once nothing reads it (unused: ${nowUnused || "none"}; still flagged: ${stillFlagged || "none"})`,
        nowUnused === "conversation_id" && stillFlagged === "message",
    );
} finally {
    rmSync(unusedTree, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error(`\n  ✗ typegen-drop-guard self-test FAILED: ${failures.length} check(s).\n`);
    process.exit(1);
}
console.log("\n  ✓ typegen-drop-guard self-test passed.\n");
