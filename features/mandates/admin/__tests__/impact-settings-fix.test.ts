// Agent Change Impact — R13 "Fix settings": the sentences a person reads
// before the save (what changes, which version it creates) and after the
// re-read (did the row's pile change — never silent when it did not).

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: jest.fn(async () => 72),
}));

import { describeSettingsChanges } from "../impact-settings-fix";
import { settleSettingsFix, type SettingsFixReport } from "../impact-settings-fix-report";
import { ADMIN_WRITE_CONTEXT, type ImpactVerdict } from "../impact";

function verdict(overrides: Partial<ImpactVerdict> = {}): ImpactVerdict {
  const base: ImpactVerdict = {
    holder_kind: "mandate_default",
    row_id: "row-1",
    mandate_key: "probe.alpha",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Quick Test Agent",
    lineage_path: [{ agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" }],
    pinned_version_id: "v29",
    pinned_version_number: 29,
    latest_version_id: "v31",
    latest_version_number: 31,
    grade: "green",
    blocker: null,
    findings: [],
    settings_drift: { keys: [], capability: [], capability_checked: true },
    changed_columns: ["settings"],
    apply_token: { holder_kind: "mandate_default", row_id: "row-1", expected_pinned_version_id: "v29", target_version_id: "v31" },
    auto_advance_eligible: true,
  };
  return { ...base, ...overrides };
}

describe("describeSettingsChanges — the confirm names every setting that moves", () => {
  it("sets / removes / adds, in words, sorted by key", () => {
    expect(
      describeSettingsChanges(
        { reasoning_effort: "high", top_k: 40, temperature: 1 },
        { reasoning_effort: "medium", temperature: 1, max_output_tokens: 4096 },
      ),
    ).toEqual([
      "sets max_output_tokens to 4096",
      "sets reasoning_effort from high to medium",
      "removes top_k (was 40)",
    ]);
  });

  it("no difference → no sentence (the fixer then refuses to save)", () => {
    expect(describeSettingsChanges({ temperature: 1 }, { temperature: 1 })).toEqual([]);
  });
});

describe("settleSettingsFix — before → after from the read that followed the save", () => {
  const fix: SettingsFixReport = {
    outcome: {
      agentId: "agent-1",
      agentName: "Quick Test Agent",
      fromVersionNumber: 31,
      expectedVersionNumber: 32,
      changes: ["sets reasoning_effort from high to medium"],
    },
    settleEpoch: 2,
    before: [{ rungId: "mandate_default:row-1", mandateKey: "probe.alpha", tier: "drift", versions: "v29 → v31" }],
  };
  const options = { dryRun: false, context: ADMIN_WRITE_CONTEXT };

  it("a row that left the Check settings pile says where it landed and which version the save created", () => {
    const after = settleSettingsFix(fix, [verdict({ latest_version_id: "v32", latest_version_number: 32 })], options);
    expect(after.changedPile).toBe(true);
    expect(after.newestAfter).toBe(32);
    expect(after.sentence).toBe(
      "Fixed settings on Quick Test Agent (now v32: sets reasoning_effort from high to medium) — 1 of 1 movable pin moved from Check settings to Safe.",
    );
  });

  it("a fix that changed no pile SAYS so, with what the settings check still finds", () => {
    const still = verdict({
      latest_version_id: "v32",
      latest_version_number: 32,
      settings_drift: {
        keys: [],
        capability: [{ key: "temperature", action: "dropped", reason: "temperature is not supported here", expected: false }],
        capability_checked: true,
      },
    });
    const after = settleSettingsFix(fix, [still], options);
    expect(after.changedPile).toBe(false);
    expect(after.sentence).toContain("no pile changed");
    expect(after.sentence).toContain("Check settings (temperature is not supported here)");
    expect(after.sentence).toContain("Open the agent, or advance anyway.");
  });

  it("blocked and current rungs on the same agent are counted, never listed as moved", () => {
    const wide: SettingsFixReport = {
      ...fix,
      before: [
        ...fix.before,
        { rungId: "mandate_default:row-9", mandateKey: "app.other", tier: "blocked", versions: "latest → v31" },
      ],
    };
    const after = settleSettingsFix(
      wide,
      [
        verdict({ latest_version_id: "v32", latest_version_number: 32 }),
        verdict({ row_id: "row-9", mandate_key: "app.other", blocker: "tracks_latest", pinned_version_id: null, pinned_version_number: null, latest_version_id: "v32", latest_version_number: 32, apply_token: { holder_kind: "mandate_default", row_id: "row-9", expected_pinned_version_id: null, target_version_id: null } }),
      ],
      options,
    );
    expect(after.sentence).toBe(
      "Fixed settings on Quick Test Agent (now v32: sets reasoning_effort from high to medium) — 1 of 1 movable pin moved from Check settings to Safe. 1 other rung on this agent (not in this batch, or current) unchanged.",
    );
  });

  it("a rung the re-read no longer returns is named, not assumed fixed", () => {
    const after = settleSettingsFix(fix, [], options);
    expect(after.after[0].afterTier).toBeNull();
    expect(after.changedPile).toBe(false);
    expect(after.sentence).toContain("expected v32");
  });
});
