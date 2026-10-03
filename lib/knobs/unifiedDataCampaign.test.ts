/**
 * THE RECORD STORE HAS NO SWITCH, and this suite keeps it that way.
 *
 * Arman, 2026-10-03: "EVERYTHING IS ON by default and things can only be TURNED OFF! Don't
 * limit what users can do." It fails when:
 *   1. the module grows a reader again (`enabled` / `check`), an RPC call, or a default of OFF;
 *   2. a per-person knob or an env var is read here;
 *   3. the census breaks: a file that reaches campaign code is not on the register.
 */
import fs from "fs";
import path from "path";

import { execSync } from "child_process";

import { judge, scanFiles } from "../../scripts/lib/campaign-entry-points";
import {
    CAMPAIGN_ENTRY_POINT_KINDS,
    ENTRY_POINTS,
    UNIFIED_DATA_CAMPAIGN,
    UNIFIED_DATA_CAMPAIGN_DEFAULT,
    UNIFIED_DATA_CAMPAIGN_FEATURE,
    UNIFIED_DATA_CAMPAIGN_KEY,
} from "./unifiedDataCampaign";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const OWN_SOURCE = fs.readFileSync(path.resolve(__dirname, "unifiedDataCampaign.ts"), "utf8");
/**
 * The module's CODE, with its comments blanked. A guard that reads raw source
 * cannot tell a read from the same characters inside the paragraph explaining
 * why that read was removed — and this repo has already watched a comment be
 * reworded to dodge a guard (`check:signout-scope`). The comments here
 * deliberately NAME the closed door; the code must not reach it.
 */
const OWN_CODE = OWN_SOURCE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Every tracked file that actually IMPORTS the switch, minus the ones whose
 *  job is to police it. Resolved through the TypeScript AST, not grepped. */
function trackedImportersOfTheSwitch(): string[] {
    const own = new Set([
        "lib/knobs/unifiedDataCampaign.ts",
        "lib/knobs/unifiedDataCampaign.register.ts",
        "lib/knobs/unifiedDataCampaign.test.ts",
        "scripts/check-campaign-entry-points.ts",
        "scripts/lib/campaign-entry-points.ts",
    ]);
    const files = execSync("git ls-files -- '*.ts' '*.tsx'", { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        .split("\n")
        .filter((f) => f && !own.has(f) && !f.startsWith("scripts/fixtures/"));
    expect(files.length).toBeGreaterThan(1000); // never a silent empty census
    return [
        ...new Set(
            scanFiles(files, REPO_ROOT)
                .filter((r) => r.how === "import" && r.what === "lib/knobs/unifiedDataCampaign")
                .map((r) => r.file),
        ),
    ].sort();
}

describe("the unified record store has no switch", () => {
    it("names the RETIRED knob for the census only, and the default is ON", () => {
        expect(UNIFIED_DATA_CAMPAIGN_FEATURE).toBe("custom");
        expect(UNIFIED_DATA_CAMPAIGN_KEY).toBe("system_enabled");
        expect(UNIFIED_DATA_CAMPAIGN_DEFAULT).toBe(true);
        expect(UNIFIED_DATA_CAMPAIGN.DEFAULT).toBe(true);
    });

    it("THERE IS NO READER: nothing here can answer off, could-not-check, or anything at all", () => {
        expect(Object.keys(UNIFIED_DATA_CAMPAIGN)).not.toEqual(expect.arrayContaining(["enabled"]));
        expect(Object.keys(UNIFIED_DATA_CAMPAIGN)).not.toEqual(expect.arrayContaining(["check"]));
        expect(Object.keys(UNIFIED_DATA_CAMPAIGN)).not.toEqual(expect.arrayContaining(["DOOR"]));
        // No network, no door name, no per-person knob resolver in the module's code.
        expect(OWN_CODE).not.toMatch(/\.rpc\(|createClient|unified_data_store_on/);
        expect(OWN_CODE).not.toMatch(/code_paths_enabled/);
        expect(OWN_CODE).not.toMatch(/useEffectiveKnob|ensureEffectiveKnob|knobBool/);
        expect(OWN_CODE).not.toMatch(/OFF_SENTENCE|UNAVAILABLE_SENTENCE/);
    });

    it("never reads an env var (an env var is a value, never a toggle)", () => {
        expect(OWN_CODE).not.toMatch(/process\.env/);
    });

    // ---- THE REGISTER AND THE GUARD -------------------------------------

    it("REGISTER IS HONEST: every entry names a kind and a reason, and the file exists", () => {
        expect(ENTRY_POINTS.length).toBeGreaterThan(0);
        for (const entry of ENTRY_POINTS) {
            // The register's OWN declared kinds, never a copy of them here: this
            // list was hand-written as three words and went stale the moment the
            // register legitimately grew `one_line`, `red_twin` and `door_gated`,
            // each with its reason. `CAMPAIGN_ENTRY_POINT_KINDS` is the one
            // source, and the register proves at compile time that it and the
            // `CampaignEntryPointKind` union are the same set.
            expect(CAMPAIGN_ENTRY_POINT_KINDS).toContain(entry.kind);
            expect(entry.why.trim().length).toBeGreaterThan(10);
            expect(fs.existsSync(path.resolve(REPO_ROOT, entry.file))).toBe(true);
        }
    });

    it("CENSUS: every shipped importer of this module is a registered runtime entry or a red twin", () => {
        const importers = trackedImportersOfTheSwitch();
        const runtime = UNIFIED_DATA_CAMPAIGN.RUNTIME_ENTRY_POINTS.map((e) => e.file).sort();
        expect(runtime.length).toBeGreaterThan(0);
        const redTwins = new Set(ENTRY_POINTS.filter((e) => e.kind === "red_twin").map((e) => e.file));
        const isRedTwin = (f: string) => /\.red\.test\.tsx?$/.test(f);
        expect([...redTwins].filter((f) => !isRedTwin(f))).toEqual([]);
        expect(importers.filter(isRedTwin).filter((f) => !redTwins.has(f))).toEqual([]);
        // Test files that import the module are not shipped code.
        const shipped = importers.filter((f) => !isRedTwin(f) && !/(\.test\.tsx?$|__tests__\/)/.test(f));
        expect(shipped.filter((f) => !runtime.includes(f))).toEqual([]);
    });

    it("RED THEN GREEN: a stray campaign importer is caught, and is not caught once removed", () => {
        const stray = "scripts/fixtures/campaign-entry-points/stray-campaign-importer.ts";
        expect(fs.existsSync(path.resolve(REPO_ROOT, stray))).toBe(true);

        // RED — the planted fixture reaches the campaign store and is on no register.
        const withFixture = judge(scanFiles([stray], REPO_ROOT), ENTRY_POINTS, REPO_ROOT, new Set());
        expect(withFixture.map((v) => v.file)).toContain(stray);
        expect(withFixture.find((v) => v.file === stray)!.message).toMatch(/NOT in ENTRY_POINTS/);

        // GREEN — remove it from what is scanned and the same judgement is clean.
        expect(judge(scanFiles([], REPO_ROOT), ENTRY_POINTS, REPO_ROOT, new Set())).toEqual([]);
    });

    it("the guard demands NO gate: a registered runtime file is clean whether or not it reads anything", () => {
        const fixture = "scripts/fixtures/campaign-entry-points/registered-gated-runtime.ts";
        for (const kind of ["runtime", "tooling"] as const) {
            expect(judge([], [{ id: "probe", file: fixture, kind, why: "planted fixture for this assertion" }], REPO_ROOT, new Set())).toEqual([]);
        }
    });
});
