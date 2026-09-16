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

import {
    UNIFIED_DATA_CAMPAIGN,
    UNIFIED_DATA_CAMPAIGN_DEFAULT,
    UNIFIED_DATA_CAMPAIGN_FEATURE,
    UNIFIED_DATA_CAMPAIGN_KEY,
    type CampaignEntryPoint,
} from "./unifiedDataCampaign";
import { knobBool } from "./featureKnobs";

jest.mock("./featureKnobs", () => ({ knobBool: jest.fn() }));

const knobBoolMock = knobBool as jest.MockedFunction<typeof knobBool>;

/** THE AUDIT. A registered campaign entry point that does not import the flag
 *  module AND call its gate is a code path that ships live. */
function auditEntryPoints(entries: readonly CampaignEntryPoint[]): string[] {
    const violations: string[] = [];
    for (const entry of entries) {
        const abs = path.resolve(process.cwd(), entry.file);
        if (!fs.existsSync(abs)) {
            violations.push(`${entry.id}: ${entry.file} does not exist`);
            continue;
        }
        const src = fs.readFileSync(abs, "utf8");
        if (!/from\s+["'][^"']*unifiedDataCampaign["']/.test(src)) {
            violations.push(
                `${entry.id}: ${entry.file} never imports the campaign flag module`,
            );
            continue;
        }
        if (!/UNIFIED_DATA_CAMPAIGN\.enabled\s*\(/.test(src)) {
            violations.push(
                `${entry.id}: ${entry.file} never calls UNIFIED_DATA_CAMPAIGN.enabled()`,
            );
        }
    }
    return violations;
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

    it("every registered campaign entry point goes through the gate", () => {
        expect(auditEntryPoints(UNIFIED_DATA_CAMPAIGN.ENTRY_POINTS)).toEqual([]);
    });

    it("the audit has teeth: an ungated entry point is a violation", () => {
        expect(
            auditEntryPoints([
                // This file is real and contains no gate — it is the campaign
                // code path nobody remembered to wire to the switch.
                { id: "probe", file: "lib/knobs/featureKnobs.ts" },
            ]),
        ).toEqual(["probe: lib/knobs/featureKnobs.ts never imports the campaign flag module"]);
    });
});
