#!/usr/bin/env npx tsx
/**
 * check:campaign-entry-points — THE unified-data campaign's code-side switch
 * must have something behind it, and nothing may reach the campaign store
 * without being on the register.
 *
 * THE DEFECT THIS CLOSES (adversarial review ATTACK-4, finding 5, 2026-09-15)
 * --------------------------------------------------------------------------
 * `lib/knobs/unifiedDataCampaign.ts` is a real kill switch: it reads
 * `platform.feature_knob` `custom.code_paths_enabled`, defaults OFF, and
 * announces an unreadable row. It was also completely INERT. `ENTRY_POINTS`
 * was `[]`, the only test over it asserted `auditEntryPoints([]) === []` — an
 * audit of nothing, green forever — and a grep of the repo returned no importer
 * of the module outside its own test. So the switch guarded zero code, and any
 * campaign UI route, nav entry or server path a lane wrote could ship to
 * production in ANY other lane's `release*:` commit with nothing hiding it.
 *
 * A switch nobody is wired to is not a safety device; it is a note claiming
 * there is one.
 *
 * THE RULE
 * --------
 * Every file in this repo that reaches the campaign store — the four
 * `platform.custom_*` tables — or imports a campaign module MUST appear in
 * `ENTRY_POINTS` in `lib/knobs/unifiedDataCampaign.ts`, with a `kind` and a
 * reason. The kind then decides what else is demanded:
 *
 *   runtime     → MUST import the flag module and call
 *                 `UNIFIED_DATA_CAMPAIGN.enabled()`. It ships to users.
 *   tooling     → MUST NOT call the gate. `scripts/**`, run by a human;
 *                 gating the campaign's own migration runner on the campaign
 *                 switch would stop the campaign preparing itself.
 *   preexisting → MUST NOT call the gate. It read those tables before the
 *                 campaign existed and is live today; gating it switches OFF
 *                 a shipped feature.
 *
 * HOW IT LOOKS — AST, NOT REGEX, AND WHY
 * --------------------------------------
 * Every candidate is parsed with the TypeScript compiler (`ts.createSourceFile`)
 * and the facts are read off the tree: `ImportDeclaration` / `ExportDeclaration`
 * module specifiers, `import()` and `require()` calls, and `.from("<table>")`
 * call expressions with a string-literal argument. A regex over raw source
 * cannot tell an import from the same characters inside a comment, a docstring
 * or a string — and this repo has already watched a guard train the code the
 * wrong way round when a comment was reworded to dodge it (check:signout-scope
 * had to blank comments and strings for exactly that reason). Import
 * specifiers are RESOLVED (relative paths against the file's directory, `@/`
 * against the repo root) before they are judged, so `"./lib/migration-target"`,
 * `"../lib/migration-target"` and `"@/scripts/lib/migration-target"` are one
 * fact, not three spellings to enumerate.
 *
 * Parsing is cheap because a substring pre-filter runs first: a file that
 * contains none of the campaign's names is never parsed.
 *
 * NOTHING FAILS SILENTLY
 * ----------------------
 * If the file list cannot be taken (no git, not a checkout, an empty listing),
 * this guard reports UNMEASURED and EXITS 1. It never prints a clean line it
 * did not earn.
 *
 * Usage: pnpm check:campaign-entry-points
 *        pnpm check:campaign-entry-points:self-test   (planted fixtures)
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ENTRY_POINTS, type CampaignEntryPoint } from "../lib/knobs/unifiedDataCampaign.register";
import { judge, scanFiles } from "./lib/campaign-entry-points";
import { exitAfterDrain } from "./lib/exit-after-drain";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trackedSources(): string[] {
    let out: string;
    try {
        out = execSync("git ls-files -- '*.ts' '*.tsx'", { cwd: REPO_ROOT, encoding: "utf8" });
    } catch (error) {
        console.error(
            "check:campaign-entry-points: UNMEASURED — could not list tracked files " +
            `(${error instanceof Error ? error.message : String(error)}). ` +
            "This guard did NOT run and this is a FAILURE, not a pass. " +
            "Remedy: run it inside the matrx-frontend git checkout.",
        );
        exitAfterDrain(1);
    }
    const files = out.split("\n").filter(Boolean).filter((f) => !f.startsWith("scripts/fixtures/"));
    if (files.length === 0) {
        console.error(
            "check:campaign-entry-points: UNMEASURED — the tracked-file listing was EMPTY, " +
            "so nothing was inspected. This is a FAILURE, not a pass.",
        );
        exitAfterDrain(1);
    }
    return files;
}

const FIXTURES = "scripts/fixtures/campaign-entry-points";

/**
 * PROVE THE GUARD CAN FAIL. Committed fixtures, never a real file weakened:
 * one stray importer that is not on the register (must be caught), one
 * registered-and-gated runtime file (must be clean), and one registered
 * runtime file with no gate (must be caught).
 */
export function selfTest(): boolean {
    const stray = `${FIXTURES}/stray-campaign-importer.ts`;
    const gated = `${FIXTURES}/registered-gated-runtime.ts`;
    const ungated = `${FIXTURES}/registered-ungated-runtime.ts`;
    for (const f of [stray, gated, ungated]) {
        if (!existsSync(path.resolve(REPO_ROOT, f))) {
            console.error(`check:campaign-entry-points SELF-TEST FAILED: missing fixture ${f}`);
            return false;
        }
    }
    const reaches = scanFiles([stray, gated, ungated], REPO_ROOT);
    const register: CampaignEntryPoint[] = [
        { id: "fixture-gated", file: gated, kind: "runtime", why: "fixture: registered and gated, must be clean" },
        { id: "fixture-ungated", file: ungated, kind: "runtime", why: "fixture: registered but never gated, must be caught" },
    ];
    const violations = judge(reaches, register, REPO_ROOT, new Set());

    const cases: Array<[string, boolean]> = [
        ["the stray importer is caught as unregistered",
            violations.some((v) => v.file === stray && v.message.includes("NOT in ENTRY_POINTS"))],
        ["the registered+gated runtime file is clean",
            !violations.some((v) => v.file === gated)],
        ["the registered-but-ungated runtime file is caught",
            violations.some((v) => v.file === ungated && v.message.includes("never calls"))],
        ["the store read in the stray fixture is seen",
            reaches.some((r) => r.file === stray && r.how === "store")],
    ];
    let ok = true;
    for (const [label, pass] of cases) {
        if (!pass) { ok = false; console.error(`  self-test: FAILED — ${label}`); }
    }
    if (!ok) {
        console.error(
            "check:campaign-entry-points SELF-TEST FAILED: the detector did not catch a planted " +
            "campaign code path. A clean run would mean nothing. Fix the detector.",
        );
        return false;
    }
    console.log(
        `check:campaign-entry-points self-test: ${cases.length} planted cases — an unregistered ` +
        `campaign importer, an unregistered store read and a registered-but-ungated runtime file ` +
        `are all caught, and a correctly registered gated file is not. The guard can fail.`,
    );
    return true;
}

function main(): void {
    if (process.argv.includes("--self-test")) {
        if (!selfTest()) exitAfterDrain(1);
        return;
    }
    const files = trackedSources();
    const reaches = scanFiles(files, REPO_ROOT);
    const violations = judge(reaches, ENTRY_POINTS, REPO_ROOT);

    const runtime = ENTRY_POINTS.filter((e) => e.kind === "runtime").length;
    if (violations.length === 0) {
        console.log(
            `check:campaign-entry-points: ${files.length} tracked files scanned, ` +
            `${reaches.length} campaign reach(es) found, all ${ENTRY_POINTS.length} registered. ` +
            `${runtime} runtime entry point(s) behind the switch` +
            (runtime === 0
                ? " — ZERO: no campaign code is served to a user yet, which is the register's stated state, not an unchecked one."
                : " — each proven to call UNIFIED_DATA_CAMPAIGN.enabled()."),
        );
        return;
    }
    console.error(
        `check:campaign-entry-points: ${violations.length} campaign code path(s) the switch does not cover:`,
    );
    for (const v of violations) console.error(`  ${v.file}\n      ${v.message}`);
    console.error(
        "\nTHE RULE: the unified-data campaign's code ships to production continuously — any\n" +
        "lane's `release*:` commit builds the whole pushed range. Campaign code that reaches\n" +
        "production must be INERT until `platform.feature_knob` custom.code_paths_enabled is\n" +
        "turned on, and this register is how anyone can tell which code that is.\n" +
        "Register: lib/knobs/unifiedDataCampaign.ts → ENTRY_POINTS.\n",
    );
    exitAfterDrain(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
