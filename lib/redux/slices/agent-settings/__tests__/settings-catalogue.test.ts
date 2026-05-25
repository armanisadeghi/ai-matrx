/**
 * Guardrail test for the Model Settings STANDARD-list contract.
 *
 * THE CONTRACT: buildSettingsRows returns ONLY the keys the selected model
 * declares a control for (supported). It must NOT return the whole catalogue,
 * and it must NOT return set-but-unsupported keys — those belong to the caution
 * layer (see unsupported-by-model.test.ts), never the standard list.
 *
 * This locks both failure modes: the original "settings filtered out per model"
 * bug AND the later "showing all possible keys in the standard list" bug.
 */

import {
  CATALOGUE_KEYS,
  buildSettingsRows,
} from "../settings-catalogue";

const flatRows = (
  controls: Record<string, unknown> | null,
  settings: Record<string, unknown> | null,
) => buildSettingsRows(controls, settings).flatMap((g) => g.rows);

const num = (min: number, max: number) => ({ type: "number", min, max });
const enumc = (...e: string[]) => ({ type: "enum", enum: e });

describe("buildSettingsRows — standard list = supported only", () => {
  it("returns NOTHING when the model declares no controls", () => {
    expect(flatRows(null, {})).toHaveLength(0);
    expect(
      flatRows({ rawControls: {}, unmappedControls: {} }, { temperature: 1 }),
    ).toHaveLength(0);
  });

  it("returns ONLY the keys the model declares (not the whole catalogue)", () => {
    const controls = {
      temperature: num(0, 2),
      reasoning_effort: enumc("low", "high"),
      rawControls: {},
      unmappedControls: {},
    };
    const rows = flatRows(controls, {});
    expect(rows.map((r) => r.key).sort()).toEqual([
      "reasoning_effort",
      "temperature",
    ]);
    // sanity: the catalogue is much larger than what's returned
    expect(rows.length).toBeLessThan(CATALOGUE_KEYS.size);
  });

  it("every returned row is supported and carries its control", () => {
    const rows = flatRows(
      { temperature: num(0, 2), rawControls: {}, unmappedControls: {} },
      {},
    );
    for (const r of rows) {
      expect(r.supported).toBe(true);
      expect(r.control).not.toBeNull();
    }
  });

  it("does NOT include set-but-unsupported keys in the standard list", () => {
    // top_k is set on the agent but the model declares no control for it.
    const rows = flatRows(
      { temperature: num(0, 2), rawControls: {}, unmappedControls: {} },
      { temperature: 1, top_k: 40, reasoning_effort: "high" },
    );
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("temperature"); // supported → standard
    expect(keys).not.toContain("top_k"); // set-but-unsupported → caution, not here
    expect(keys).not.toContain("reasoning_effort"); // ditto
  });

  it("surfaces a supported model-declared control the catalogue doesn't name", () => {
    const rows = flatRows(
      {
        weird_provider_param: num(0, 1),
        rawControls: {},
        unmappedControls: {},
      },
      {},
    );
    const extra = rows.find((r) => r.key === "weird_provider_param");
    expect(extra).toBeDefined();
    expect(extra?.group).toBe("other");
    expect(extra?.supported).toBe(true);
  });

  it("never treats bookkeeping / identity / coupled keys as standard rows", () => {
    const rows = flatRows(
      { rawControls: { a: 1 }, unmappedControls: { b: 2 } },
      { model_id: "abc", multi_speaker: true },
    );
    for (const hidden of [
      "rawControls",
      "unmappedControls",
      "model_id",
      "multi_speaker",
    ]) {
      expect(rows.find((r) => r.key === hidden)).toBeUndefined();
    }
  });
});
