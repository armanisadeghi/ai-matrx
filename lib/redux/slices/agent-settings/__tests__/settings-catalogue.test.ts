/**
 * Guardrail test for the Model Settings visibility invariant.
 *
 * THE INVARIANT: every catalogue setting renders for every model. The model's
 * controls only DECORATE a row (supported flag), never decide whether it shows.
 *
 * This is the structural lock that replaced the recurring "filter settings by
 * model support" bug. If anyone reintroduces filtering inside buildSettingsRows
 * (or drops a catalogue entry), these tests fail.
 */

import {
  SETTINGS_CATALOGUE,
  CATALOGUE_KEYS,
  buildSettingsRows,
} from "../settings-catalogue";

const TOTAL_CATALOGUE_ENTRIES = SETTINGS_CATALOGUE.reduce(
  (n, g) => n + g.entries.length,
  0,
);

const flatRows = (
  controls: Record<string, unknown> | null,
  settings: Record<string, unknown> | null,
) => buildSettingsRows(controls, settings).flatMap((g) => g.rows);

describe("buildSettingsRows — visibility invariant", () => {
  it("renders EVERY catalogue setting when the model declares NO controls", () => {
    const rows = flatRows(null, {});
    for (const key of CATALOGUE_KEYS) {
      expect(rows.filter((r) => r.key === key)).toHaveLength(1);
    }
    expect(rows).toHaveLength(TOTAL_CATALOGUE_ENTRIES);
    // Shown, but every one is flagged unsupported — never dropped.
    for (const r of rows) {
      expect(r.supported).toBe(false);
      expect(r.control).toBeNull();
    }
  });

  it("renders the SAME number of rows regardless of how many controls the model declares (regression guard)", () => {
    const none = flatRows(null, {}).length;
    const sparse = flatRows(
      {
        temperature: { type: "number", min: 0, max: 2 },
        rawControls: {},
        unmappedControls: {},
      },
      {},
    ).length;
    // The historical bug filtered rows by getControl(key); this asserts the
    // visible set is model-independent.
    expect(sparse).toBe(none);
    expect(sparse).toBe(TOTAL_CATALOGUE_ENTRIES);
  });

  it("decorates supported rows but still shows unsupported ones", () => {
    const rows = flatRows(
      {
        temperature: { type: "number", min: 0, max: 2 },
        reasoning_effort: { type: "enum", enum: ["low", "high"] },
        rawControls: {},
        unmappedControls: {},
      },
      {},
    );
    expect(rows.find((r) => r.key === "temperature")?.supported).toBe(true);
    expect(rows.find((r) => r.key === "reasoning_effort")?.supported).toBe(true);
    // top_k is in the catalogue but not declared → shown, flagged unsupported.
    const topK = rows.find((r) => r.key === "top_k");
    expect(topK).toBeDefined();
    expect(topK?.supported).toBe(false);
  });

  it("never hides a setting that holds a value, even outside the catalogue", () => {
    const rows = flatRows(
      { rawControls: {}, unmappedControls: {} },
      { some_brand_new_param: "x" },
    );
    const extra = rows.find((r) => r.key === "some_brand_new_param");
    expect(extra).toBeDefined();
    expect(extra?.hasValue).toBe(true);
    expect(extra?.group).toBe("other");
  });

  it("surfaces a model-declared control that the catalogue doesn't cover", () => {
    const rows = flatRows(
      {
        weird_provider_param: { type: "number", min: 0, max: 1 },
        rawControls: {},
        unmappedControls: {},
      },
      {},
    );
    const extra = rows.find((r) => r.key === "weird_provider_param");
    expect(extra).toBeDefined();
    expect(extra?.supported).toBe(true);
    expect(extra?.group).toBe("other");
  });

  it("excludes bookkeeping / identity / coupled keys from the catch-all", () => {
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
