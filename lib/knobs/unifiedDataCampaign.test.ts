/**
 * The unified-data campaign switch must be OFF, and must be the ONLY door into
 * campaign code.
 *
 * This is a forcing-function test, not a tautology. It fails when:
 *   1. the shipped default stops being OFF (the failure this test exists for —
 *      campaign code ships continuously, so a default of ON is a production
 *      incident, not a bug report);
 *   2. an unreadable / missing knob row stops meaning OFF, or stops announcing
 *      itself;
 *   3. a campaign entry point is registered whose module does not actually go
 *      through the gate. Proven red-then-green: put a file in ENTRY_POINTS that
 *      never calls `UNIFIED_DATA_CAMPAIGN.enabled()` and this suite goes red.
 */
import fs from "fs";
import path from "path";

import { execSync } from "child_process";

import { judge, scanFiles } from "../../scripts/lib/campaign-entry-points";
import {
    ENTRY_POINTS,
    UNIFIED_DATA_CAMPAIGN,
    UNIFIED_DATA_CAMPAIGN_DEFAULT,
    UNIFIED_DATA_CAMPAIGN_FEATURE,
    UNIFIED_DATA_CAMPAIGN_KEY,
    type CampaignEntryPoint,
} from "./unifiedDataCampaign";
import { knobBool } from "./featureKnobs";

jest.mock("./featureKnobs", () => ({ knobBool: jest.fn() }));

const knobBoolMock = knobBool as jest.MockedFunction<typeof knobBool>;

const REPO_ROOT = path.resolve(__dirname, "..", "..");

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
    const files = execSync("git ls-files -- '*.ts' '*.tsx'", { cwd: REPO_ROOT, encoding: "utf8" })
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

describe("unified data campaign switch", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        knobBoolMock.mockReset();
        warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it("is addressed at platform.feature_knob custom.code_paths_enabled", () => {
        expect(UNIFIED_DATA_CAMPAIGN_FEATURE).toBe("custom");
        expect(UNIFIED_DATA_CAMPAIGN_KEY).toBe("code_paths_enabled");
        expect(UNIFIED_DATA_CAMPAIGN.FEATURE).toBe("custom");
        expect(UNIFIED_DATA_CAMPAIGN.KEY).toBe("code_paths_enabled");
    });

    it("SHIPS OFF: the default is false", () => {
        expect(UNIFIED_DATA_CAMPAIGN_DEFAULT).toBe(false);
        expect(UNIFIED_DATA_CAMPAIGN.DEFAULT).toBe(false);
    });

    it("is OFF and ANNOUNCES ITSELF when the knob row is missing", async () => {
        knobBoolMock.mockRejectedValue(
            new Error(
                'Missing feature knob "custom.code_paths_enabled". Knobs have no code fallback by design',
            ),
        );
        await expect(UNIFIED_DATA_CAMPAIGN.enabled()).resolves.toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        const said = String(warn.mock.calls[0][0]);
        expect(said).toContain("custom");
        expect(said).toContain("code_paths_enabled");
        expect(said).toMatch(/OFF/);
        expect(said).toMatch(/Remedy:/);
    });

    it("is OFF and ANNOUNCES ITSELF when the read throws for any other reason", async () => {
        knobBoolMock.mockRejectedValue(new Error("fetch failed"));
        await expect(UNIFIED_DATA_CAMPAIGN.enabled()).resolves.toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain("fetch failed");
    });

    it("is OFF, silently, when the row exists and says false", async () => {
        knobBoolMock.mockResolvedValue(false);
        await expect(UNIFIED_DATA_CAMPAIGN.enabled()).resolves.toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it("is ON only when the row itself says true", async () => {
        knobBoolMock.mockResolvedValue(true);
        await expect(UNIFIED_DATA_CAMPAIGN.enabled()).resolves.toBe(true);
        expect(knobBoolMock).toHaveBeenCalledWith("custom", "code_paths_enabled");
    });

    it("never reads an env var (an env var is a value, never a toggle)", () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, "unifiedDataCampaign.ts"),
            "utf8",
        );
        expect(src).not.toMatch(/process\.env/);
    });

    // ---- THE REGISTER AND THE GUARD -------------------------------------
    //
    // `expect(audit(ENTRY_POINTS)).toEqual([])` used to live here, over an
    // EMPTY list: an audit of nothing, green forever, while the switch guarded
    // no code at all (adversarial review ATTACK-4, finding 5, 2026-09-15). The
    // three tests below are what replaced it.

    it("REGISTER IS HONEST: every entry names a kind and a reason, and the file exists", () => {
        expect(ENTRY_POINTS.length).toBeGreaterThan(0);
        for (const entry of ENTRY_POINTS) {
            expect(["runtime", "tooling", "preexisting"]).toContain(entry.kind);
            expect(entry.why.trim().length).toBeGreaterThan(10);
            expect(fs.existsSync(path.resolve(REPO_ROOT, entry.file))).toBe(true);
        }
    });

    it("OFF ≡ ABSENT: no shipped module imports the campaign switch, so turning it off changes nothing", () => {
        // WHAT "byte-identical" MEANS HERE, concretely. `enabled()` has exactly
        // one observable effect: what it returns. A file whose behaviour could
        // differ between "switch OFF" and "campaign module deleted from the
        // repo" must therefore CALL it. So the proof is a census, not a
        // simulation: resolve every import in every tracked file and show that
        // the only importers of this module are its own test, its guard, and
        // the register it re-exports. If that set is empty of shipped code,
        // deleting the module changes no served byte — which is the strongest
        // form of "OFF leaves current behaviour unchanged" available while the
        // campaign has no runtime code yet.
        //
        // The moment a lane adds one, this test starts pointing at it and the
        // claim must be re-earned by the gate, not by this census.
        const importers = trackedImportersOfTheSwitch();
        expect(importers).toEqual([]);
        expect(UNIFIED_DATA_CAMPAIGN.RUNTIME_ENTRY_POINTS).toEqual([]);
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

    it("the guard demands the gate of a runtime entry, and refuses it on tooling", () => {
        const gatedFixture = "scripts/fixtures/campaign-entry-points/registered-gated-runtime.ts";
        const ungatedFixture = "scripts/fixtures/campaign-entry-points/registered-ungated-runtime.ts";
        const asRuntime = (file: string) => [{ id: "probe", file, kind: "runtime" as const, why: "planted fixture for this assertion" }];

        expect(judge([], asRuntime(gatedFixture), REPO_ROOT, new Set())).toEqual([]);
        const ungated = judge([], asRuntime(ungatedFixture), REPO_ROOT, new Set());
        expect(ungated).toHaveLength(1);
        expect(ungated[0].message).toMatch(/never calls UNIFIED_DATA_CAMPAIGN\.enabled\(\)/);

        // And the mirror: a gate on a tooling entry is a registration that lies.
        const asTooling = judge([], [{ id: "probe", file: gatedFixture, kind: "tooling" as const, why: "planted fixture for this assertion" }], REPO_ROOT, new Set());
        expect(asTooling).toHaveLength(1);
        expect(asTooling[0].message).toMatch(/calls the gate/);
    });
});
