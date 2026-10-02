/**
 * LOCKSTEP proof (settings-translation C4a): the client resolver builds the SAME
 * controls from `ai.offering_rules_compiled` (K5) rows as `ai.resolve_model_config`
 * does in the database, on the SAME rows.
 *
 * The fixture is real data: 52 offerings of the nightly clone (one per api plus
 * every offering with a tts_voice / multi_speaker / clamped max_output_tokens
 * cell), their K5 rows, the settings those rows name, and the controls the SQL
 * function returned — written by aidream
 * `uv run python scripts/check_model_config_parity.py --prove-on-clone --fixture <this file>`
 * inside a rolled-back transaction with the C4a definition applied.
 * Regenerate it whenever either resolver changes.
 */

import type { AiSetting, ControlParam, ControlRule } from "../../types";
import {
  buildControlRows,
  resolveControlForKey,
  type OfferingCellRow,
} from "../resolveControls";
import fixture from "./fixtures/k5-clone-controls.json";

type FixtureOffering = {
  offering_id: string;
  model_max_tokens: number | null;
  cells: OfferingCellRow[];
  sql_controls: Record<string, ControlParam>;
};

const settings = fixture.settings as unknown as AiSetting[];
const offerings = fixture.offerings as unknown as FixtureOffering[];

/** Controls the SQL adds from model capabilities, not from rules (no TS mirror). */
const CAPABILITY_KEYS = new Set([
  "tools",
  "image_urls",
  "file_urls",
  "youtube_videos",
  "internal_web_search",
  "internal_url_context",
  "internal_x_search",
  "response_format",
]);

function tsControls(o: FixtureOffering): Record<string, ControlParam | null> {
  const rows = buildControlRows({}, {}, settings, o.model_max_tokens, o.cells);
  return Object.fromEntries(rows.map((r) => [r.key, r.resolved]));
}

describe("resolveControls on K5 cells == ai.resolve_model_config (clone fixture)", () => {
  it("covers real offerings, drops and the special-cased keys", () => {
    expect(offerings.length).toBeGreaterThanOrEqual(40);
    const keys = new Set(offerings.flatMap((o) => o.cells.map((c) => c.setting_key)));
    expect(keys.has("max_output_tokens")).toBe(true);
    expect(keys.has("tts_voice")).toBe(true);
    expect(offerings.some((o) => o.cells.some((c) => c.rule.drop === true))).toBe(true);
  });

  it.each(offerings.map((o) => [o.offering_id, o] as const))(
    "offering %s resolves every key exactly as the SQL",
    (_id, o) => {
      const ts = tsControls(o);
      for (const [key, control] of Object.entries(ts)) {
        if (control === null) {
          // Hidden in TS → absent from SQL, unless the SQL adds it from capabilities.
          if (!CAPABILITY_KEYS.has(key)) expect(o.sql_controls).not.toHaveProperty(key);
        } else {
          expect({ key, control }).toEqual({ key, control: o.sql_controls[key] });
        }
      }
      // Every SQL control is either rule-derived (above) or capability-derived.
      for (const key of Object.keys(o.sql_controls)) {
        expect(ts[key] != null || CAPABILITY_KEYS.has(key)).toBe(true);
      }
    },
  );

  it("takes each cell's rule WHOLE — the legacy columns are never merged in", () => {
    const o = offerings.find((x) => x.cells.some((c) => Array.isArray(c.rule.ui_values)))!;
    const cell = o.cells.find((c) => Array.isArray(c.rule.ui_values))!;
    const family = { [cell.setting_key]: { ui_values: ["from-the-columns"] } as ControlRule };
    const rows = buildControlRows(family, {}, settings, o.model_max_tokens, o.cells);
    const row = rows.find((r) => r.key === cell.setting_key)!;
    expect(row.resolved?.enum).toEqual(cell.rule.ui_values);
    expect(row.cell).toEqual({
      cell_id: cell.cell_id,
      layer: cell.layer,
      state: cell.state,
      version: cell.version,
    });
  });

  it("falls back to the family ‖ override merge when the offering has no cells", () => {
    const o = offerings[0];
    const family = Object.fromEntries(o.cells.map((c) => [c.setting_key, c.rule]));
    for (const empty of [null, []]) {
      const rows = buildControlRows(family, {}, settings, o.model_max_tokens, empty);
      expect(rows.every((r) => r.cell === null)).toBe(true);
      expect(Object.fromEntries(rows.map((r) => [r.key, r.resolved]))).toEqual(tsControls(o));
    }
  });

  it("a declared drop is never a control (lockstep with the SQL's skip)", () => {
    const setting = settings.find((s) => s.key === "temperature")!;
    expect(resolveControlForKey("temperature", { drop: true, why: "none here" }, setting, null)).toBeNull();
    expect(resolveControlForKey("temperature", {}, setting, null)).not.toBeNull();
  });
});
