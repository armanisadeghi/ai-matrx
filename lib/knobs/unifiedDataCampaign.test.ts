/**
 * ONE SWITCH PER ORGANIZATION, and it must be the ONLY door into campaign code.
 *
 * This is a forcing-function test, not a tautology. It fails when:
 *   1. the shipped default stops being OFF (the failure this test exists for —
 *      campaign code ships continuously, so a default of ON is a production
 *      incident, not a bug report);
 *   2. an unreadable / refused switch stops meaning OFF, or stops announcing
 *      itself;
 *   3. THE SECOND SWITCH COMES BACK. The 19 September verdict found an admin
 *      who had turned the store on for their organization still locked out by a
 *      per-PERSON knob (`custom.code_paths_enabled`) they could only set for
 *      themselves. This suite reads this module's own source and fails if that
 *      key, or a per-person knob resolver, reappears in it;
 *   4. a campaign entry point is registered whose module does not actually go
 *      through the gate. Proven red-then-green: put a file in ENTRY_POINTS that
 *      never calls `UNIFIED_DATA_CAMPAIGN.enabled()` and this suite goes red.
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
    UNIFIED_DATA_STORE_DOOR,
} from "./unifiedDataCampaign";
import { createClient } from "@/utils/supabase/client";

/** The browser client, stood in with exactly the two calls this module makes. */
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));

const createClientMock = createClient as unknown as jest.Mock;
const rpc = jest.fn();

function theDoorAnswers(answer: unknown, error: { message: string } | null = null) {
    rpc.mockResolvedValue({ data: answer, error });
}

const ORG = "11111111-2222-3333-4444-555555555555";
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
        // The switch's CLIENT half (lane RSC-FIX, 19 September) — see the
        // matching comment in scripts/lib/campaign-entry-points.ts. It IS the
        // switch, not a consumer of it.
        "lib/knobs/useUnifiedDataCampaignGate.ts",
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

describe("the unified record store's one switch", () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        rpc.mockReset();
        createClientMock.mockReset();
        createClientMock.mockReturnValue({ schema: () => ({ rpc }) });
        warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warn.mockRestore());

    it("is addressed at the ORGANIZATION's knob, custom.system_enabled", () => {
        expect(UNIFIED_DATA_CAMPAIGN_FEATURE).toBe("custom");
        expect(UNIFIED_DATA_CAMPAIGN_KEY).toBe("system_enabled");
        expect(UNIFIED_DATA_CAMPAIGN.FEATURE).toBe("custom");
        expect(UNIFIED_DATA_CAMPAIGN.KEY).toBe("system_enabled");
        expect(UNIFIED_DATA_STORE_DOOR).toBe("unified_data_store_on");
        expect(UNIFIED_DATA_CAMPAIGN.DOOR).toBe("unified_data_store_on");
    });

    it("SHIPS OFF: the default is false", () => {
        expect(UNIFIED_DATA_CAMPAIGN_DEFAULT).toBe(false);
        expect(UNIFIED_DATA_CAMPAIGN.DEFAULT).toBe(false);
    });

    it("THERE IS NO SECOND SWITCH: this module never reads the per-person knob", () => {
        // The verdict's second finding, guarded at its source. `code_paths_enabled`
        // is `overridable_by {user}`-shaped thinking and a per-person resolver is
        // how it got here; neither may appear in the module the pages read.
        expect(OWN_CODE).not.toMatch(/code_paths_enabled/);
        expect(OWN_CODE).not.toMatch(/useEffectiveKnob|ensureEffectiveKnob|knobBool/);
        // …and the reader takes ONE argument: the organization. A reader with no
        // organization is a platform-wide answer, which is what the second switch was.
        expect(UNIFIED_DATA_CAMPAIGN.enabled.length).toBe(1);
    });

    it("is ON only when the organization's own door says so", async () => {
        theDoorAnswers({ on: true, organization_id: ORG, why: "…" });
        await expect(UNIFIED_DATA_CAMPAIGN.enabled(ORG)).resolves.toBe(true);
        expect(rpc).toHaveBeenCalledWith("unified_data_store_on", { p_organization_id: ORG });
        expect(warn).not.toHaveBeenCalled();
    });

    it("is OFF, silently, when the door says the organization is not on it", async () => {
        theDoorAnswers({ on: false, organization_id: ORG, why: "…" });
        await expect(UNIFIED_DATA_CAMPAIGN.enabled(ORG)).resolves.toBe(false);
        expect(warn).not.toHaveBeenCalled();
    });

    it("is OFF, silently, and asks nothing when no organization is picked", async () => {
        await expect(UNIFIED_DATA_CAMPAIGN.enabled(null)).resolves.toBe(false);
        expect(rpc).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });

    it("is OFF and ANNOUNCES ITSELF when the door refuses", async () => {
        theDoorAnswers(null, { message: "permission denied for function unified_data_store_on" });
        await expect(UNIFIED_DATA_CAMPAIGN.enabled(ORG)).resolves.toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        const said = String(warn.mock.calls[0][0]);
        expect(said).toContain("unified_data_store_on");
        // 2026-09-21 (lane SHARE-OUT): the sentence deliberately stopped saying
        // "OFF". A failed read is not a fact about the organization — `/data-v2`
        // printed "this organization does not keep its data in the unified record
        // store" about an organization whose switch was demonstrably true, through
        // a transient PGRST002. `enabled()` still FAILS CLOSED (asserted on the
        // line above: it resolved `false`); what changed is what it SAYS. So this
        // asserts the stronger contract: the announcement names the door, says
        // plainly that it is not an answer about the organization, carries the
        // remedy and the cause — and never claims the store is off.
        expect(said).toMatch(/NOT an answer about the organization/);
        expect(said).toMatch(/Remedy:/);
        expect(said).toContain("permission denied");
        expect(said).not.toMatch(/\bOFF\b/);
    });

    it("is OFF and ANNOUNCES ITSELF when the read throws for any other reason", async () => {
        rpc.mockRejectedValue(new Error("fetch failed"));
        await expect(UNIFIED_DATA_CAMPAIGN.enabled(ORG)).resolves.toBe(false);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain("fetch failed");
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

    it("OFF ≡ ABSENT: every shipped importer of the switch is a registered runtime entry that calls enabled()", () => {
        // WHAT "byte-identical" MEANS HERE, concretely. `enabled()` has exactly
        // one observable effect: what it returns. A file whose behaviour could
        // differ between "switch OFF" and "campaign module deleted from the
        // repo" must therefore CALL it.
        //
        // The census reads TRACKED files, and the register may legitimately
        // carry a runtime entry another lane has written but not yet committed
        // in this shared checkout — so the direction that matters is this one:
        // nothing that SHIPS may import the switch without being registered
        // runtime. A registered file the census cannot see is covered by the two
        // tests around this one (it must exist on disk, and it must call the gate).
        const importers = trackedImportersOfTheSwitch();
        const runtime = UNIFIED_DATA_CAMPAIGN.RUNTIME_ENTRY_POINTS.map((e) => e.file).sort();
        expect(runtime.length).toBeGreaterThan(0);
        // A RED TWIN IS NOT SHIPPED CODE, and this rule is about what ships.
        // `*.red.test.ts(x)` is a suite that MUST fail: it wires the gate the
        // OLD way on purpose so the real fix's clauses are provably
        // load-bearing. `jest.config.ts` excludes the whole class from
        // `pnpm test`, it serves no request, and it CANNOT call
        // `enabled()`-as-a-runtime-entry without ceasing to be a twin of the
        // broken world. The register already has the word for it (`red_twin`,
        // added by lane APPROVAL-KNOB) and `scripts/lib/campaign-entry-points.ts`
        // already honours it; this suite was the last reader still demanding
        // every importer be `runtime`.
        //
        // THIS IS NOT AN EXEMPTION LIST: the whole `\.red\.test\.tsx?$` class is
        // excluded from the RUNTIME rule, and each member must still be on the
        // register under exactly the `red_twin` kind — which is a stricter
        // requirement than the one it replaces, since a served file cannot take
        // the word (the guard refuses `red_twin` on any file not named like one).
        const redTwins = new Set(
            ENTRY_POINTS.filter((e) => e.kind === "red_twin").map((e) => e.file),
        );
        const isRedTwin = (f: string) => /\.red\.test\.tsx?$/.test(f);
        expect([...redTwins].filter((f) => !isRedTwin(f))).toEqual([]);
        expect(importers.filter(isRedTwin).filter((f) => !redTwins.has(f))).toEqual([]);
        expect(
            importers.filter((f) => !isRedTwin(f)).filter((f) => !runtime.includes(f)),
        ).toEqual([]);
        for (const file of runtime) {
            const src = fs.readFileSync(path.resolve(REPO_ROOT, file), "utf8");
            // EITHER READER COUNTS, because there are now two on purpose (lane
            // SHARE-OUT, 21 September): `enabled()` is the boolean for a read
            // path, and `check()` is the three-state answer every surface that
            // SAYS something to a person must use — `enabled()` is implemented
            // in terms of `check()`, so a file calling `check()` reads the same
            // one switch and reads it MORE honestly. Four registered runtime
            // entries (`/data-v2/[tableId]`, `/d/[renderId]`, the public capture
            // sheet and the ramp) moved to `check()` in that change and this
            // clause still demanded the boolean; it went unseen only because the
            // importer census above this line failed first.
            expect(src).toMatch(/UNIFIED_DATA_CAMPAIGN\.(enabled|check)\s*\(/);
        }
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
