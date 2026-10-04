/**
 * The grid's pure model: what a rule sends per value, which cells "Needs you"
 * shows (K4), and which keys are MISSING (no cell anywhere — T1's definition).
 */

import {
  buildGrid,
  describeOff,
  describeUnset,
  describeValue,
  inTab,
  modalityOf,
  tabCounts,
  visibleSlice,
} from "../model";
import type { TranslationBundle, TranslationCellRow } from "../types";
import * as fs from "node:fs";
import * as path from "node:path";

const API_GROQ = "11111111-1111-1111-1111-111111111111";
const API_IMG = "22222222-2222-2222-2222-222222222222";
const OFF_A = "aaaaaaaa-0000-0000-0000-000000000001";
const OFF_B = "aaaaaaaa-0000-0000-0000-000000000002";
const OFF_I = "aaaaaaaa-0000-0000-0000-000000000003";

function cell(over: Partial<TranslationCellRow>): TranslationCellRow {
  return {
    id: over.id ?? "c",
    layer: "api",
    layer_owner_id: API_GROQ,
    setting_key: "temperature",
    rule: {},
    state: "inherited",
    confidence: null,
    rationale: null,
    evidence: [],
    source: "migration",
    conflict: null,
    rejection_fingerprint: null,
    approved_by: null,
    approved_at: null,
    version: 1,
    updated_at: null,
    ...over,
  };
}

function bundle(cells: TranslationCellRow[], compiled: TranslationBundle["compiled"]): TranslationBundle {
  return {
    cells,
    compiled,
    profiles: [],
    apis: [
      { id: API_GROQ, name: "groq_chat", display_name: "Groq Chat", translator_key: "groq_chat" },
      { id: API_IMG, name: "openai_image", display_name: "Openai Image", translator_key: "openai_image" },
    ],
    offerings: [
      { id: OFF_A, api_id: API_GROQ, model_id: "m1", provider_model_id: "llama", setting_profile_id: null, model_name: "Llama", capabilities: { input: ["text"], output: ["text"], interaction: "turn" } },
      { id: OFF_B, api_id: API_GROQ, model_id: "m2", provider_model_id: "qwen", setting_profile_id: null, model_name: "Qwen", capabilities: { input: ["text"], output: ["text"], interaction: "turn" } },
      { id: OFF_I, api_id: API_IMG, model_id: "m3", provider_model_id: "gpt-image", setting_profile_id: null, model_name: "GPT Image", capabilities: { input: ["text", "image"], output: ["image"], interaction: "turn" } },
    ],
    settings: [
      { key: "temperature", value_type: "number", canonical_min: 0, canonical_max: 2, canonical_values: null, default_value: null, value_positions: null, family: "Randomness" },
      {
        key: "reasoning_effort",
        value_type: "enum",
        canonical_min: null,
        canonical_max: null,
        canonical_values: ["auto", "none", "low", "medium", "high"],
        default_value: null,
        value_positions: null,
        family: "Intensity",
      },
    ],
  };
}

describe("describeValue / describeUnset / describeOff", () => {
  it("maps, renames and declares a not-sent value", () => {
    const rule = { provider_key: "effort", value_map: { low: "minimal", high: "high", none: null } };
    expect(describeValue(rule, "reasoning_effort", "low")).toEqual({ text: "effort = minimal", tone: "send" });
    expect(describeValue(rule, "reasoning_effort", "none")).toEqual({ text: "Nothing sent", tone: "nothing" });
    expect(describeValue(rule, "reasoning_effort", "medium").tone).toBe("computed");
  });

  it("drop and via-family win over any map", () => {
    expect(describeValue({ drop: true, value_map: { low: "x" } }, "k", "low").text).toBe("Dropped");
    expect(describeValue({ supported: false }, "k", "low").text).toBe("Converts via family");
  });

  it("unset sends nothing unless a default is sent when unset", () => {
    expect(describeUnset({}, "k").tone).toBe("nothing");
    expect(describeUnset({ default: 1, send_when_unset: true }, "k").text).toBe("1 (default)");
  });

  it("off is distinct from unset when declared", () => {
    const setting = bundle([], []).settings[1];
    expect(describeOff({ off: { send: "minimal" } }, "reasoning_effort", setting)?.text).toBe("minimal");
    expect(describeOff({ off: { omit: true, why: "no native off" } }, "reasoning_effort", setting)?.text).toBe(
      "Nothing sent — no native off",
    );
    // No declared off: falls back to how the canonical off value ("none") maps.
    expect(describeOff({ value_map: { none: "none" } }, "reasoning_effort", setting)?.text).toBe("none");
  });
});

type ModalityCase = {
  name: string;
  capabilities: { input?: string[]; output?: string[]; interaction?: string } | null;
  profile_modality: string | null;
  expected: string;
};
const CASES_FILE = path.join(__dirname, "modality_rule_cases.json");
const SERVER_CASES_FILE = path.resolve(
  __dirname,
  "../../../../../aidream/aidream/testing/fixtures/modality_rule_cases.json",
);
const CASES = (JSON.parse(fs.readFileSync(CASES_FILE, "utf8")) as { cases: ModalityCase[] }).cases;

describe("modalityOf is the server's modality_of (shared cases, F-c)", () => {
  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(modalityOf(c.capabilities, c.profile_modality)).toBe(c.expected);
  });

  it("runs the same cases file the server runs", () => {
    if (!fs.existsSync(SERVER_CASES_FILE)) return; // no aidream checkout beside this one
    expect(fs.readFileSync(CASES_FILE, "utf8")).toBe(fs.readFileSync(SERVER_CASES_FILE, "utf8"));
  });
});

describe("a TTS listing on a chat API is audio, not text (F-c)", () => {
  it("is never MISSING the text keys its chat neighbours declare", () => {
    const API_EL = "33333333-3333-3333-3333-333333333333";
    const OFF_T = "aaaaaaaa-0000-0000-0000-000000000009";
    const b: TranslationBundle = {
      cells: [cell({ id: "t", setting_key: "temperature", layer_owner_id: API_EL })],
      compiled: [
        { offering_id: OFF_A, setting_key: "temperature", cell_id: "t", layer: "api", state: "inherited" },
      ],
      profiles: [],
      apis: [{ id: API_EL, name: "elevenlabs_chat", display_name: null, translator_key: "elevenlabs_chat" }],
      offerings: [
        { id: OFF_A, api_id: API_EL, model_id: "m1", provider_model_id: "llama", setting_profile_id: null, model_name: "Llama", capabilities: { input: ["text"], output: ["text"] } },
        { id: OFF_T, api_id: API_EL, model_id: "m9", provider_model_id: "eleven_v3", setting_profile_id: null, model_name: "Eleven v3", capabilities: { input: ["text"], output: ["audio"] } },
      ],
      settings: [
        { key: "temperature", value_type: "number", canonical_min: 0, canonical_max: 2, canonical_values: null, default_value: null, value_positions: null, family: "randomness" },
      ],
    };
    const grid = buildGrid(b);
    const gc = grid.rows.find((r) => r.key === "temperature")?.cells.get(`api:${API_EL}`);
    expect(gc?.missing.map((m) => m.id) ?? []).not.toContain(OFF_T);
  });
});

describe("buildGrid", () => {
  const groqTemp = cell({ id: "t1", setting_key: "temperature", state: "inherited" });
  const groqEffort = cell({ id: "e1", setting_key: "reasoning_effort", state: "proposed", source: "agent", confidence: 0.6 });

  // Llama resolves both keys from the API cells; Qwen has no cell for reasoning_effort
  // (it is relevant to text because Llama declares it) → MISSING for Qwen.
  const compiled: TranslationBundle["compiled"] = [
    { offering_id: OFF_A, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
    { offering_id: OFF_A, setting_key: "reasoning_effort", cell_id: "e1", layer: "api", state: "proposed" },
    { offering_id: OFF_B, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
  ];

  it("puts proposed cells in Needs you and inherited ones under Not yet reviewed", () => {
    const model = buildGrid(bundle([groqTemp, groqEffort], compiled));
    const effort = model.rows.find((r) => r.key === "reasoning_effort")!.cells.get(`api:${API_GROQ}`)!;
    const temp = model.rows.find((r) => r.key === "temperature")!.cells.get(`api:${API_GROQ}`)!;
    expect(inTab(effort, "needs")).toBe(true);
    expect(inTab(temp, "needs")).toBe(false);
    expect(inTab(temp, "inherited")).toBe(true);
    expect(inTab(temp, "all")).toBe(true);
    expect(temp.covers.map((m) => m.id).sort()).toEqual([OFF_A, OFF_B].sort());
  });

  it("names a model that resolves a relevant key by computation as missing", () => {
    const model = buildGrid(bundle([groqTemp, groqEffort], compiled));
    const effort = model.rows.find((r) => r.key === "reasoning_effort")!.cells.get(`api:${API_GROQ}`)!;
    expect(effort.missing.map((m) => m.id)).toEqual([OFF_B]);
    expect(effort.needsYou).toBe(true);
  });

  it("a declared drop never makes a key relevant: no 'missing' image setting on text models", () => {
    // Llama's offering carries a declared drop for reasoning_effort ("no such setting"); Qwen has
    // no rule at all. A drop is an answer, not a reason to ask about every other text model.
    const effortDrop = cell({ id: "d1", layer: "offering", layer_owner_id: OFF_A, setting_key: "reasoning_effort", rule: { drop: true, why: "no such setting" } });
    const withDrop: TranslationBundle["compiled"] = [
      { offering_id: OFF_A, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
      { offering_id: OFF_A, setting_key: "reasoning_effort", cell_id: "d1", layer: "offering", state: "inherited" },
      { offering_id: OFF_B, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
    ];
    const model = buildGrid(bundle([groqTemp, effortDrop], withDrop));
    const effort = model.rows.find((r) => r.key === "reasoning_effort")?.cells.get(`api:${API_GROQ}`);
    expect(effort?.missing.map((m) => m.id) ?? []).toEqual([]);
  });

  it("an approved, quiet cell never reaches Needs you; a conflict brings it back", () => {
    const approved = cell({ id: "t1", state: "approved", approved_by: "u" });
    const tempOnly = compiled.filter((r) => r.setting_key === "temperature");
    const quiet = buildGrid(bundle([approved], tempOnly));
    const q = quiet.rows[0]!.cells.get(`api:${API_GROQ}`)!;
    expect(inTab(q, "needs")).toBe(false);

    const disputed = buildGrid(
      bundle([{ ...approved, conflict: { sources: [{ name: "ingest", says: { clamp: { max: 1 } } }] } }], tempOnly),
    );
    expect(inTab(disputed.rows[0]!.cells.get(`api:${API_GROQ}`)!, "needs")).toBe(true);
  });

  it("hides rows and columns with nothing for the tab, and counts per tab", () => {
    const model = buildGrid(bundle([groqTemp, groqEffort], compiled));
    const needs = visibleSlice(model, "needs", "all", "");
    expect(needs.rows.map((r) => r.key)).toEqual(["reasoning_effort"]);
    expect(needs.columns.map((c) => c.id)).toEqual([`api:${API_GROQ}`]);
    expect(visibleSlice(model, "needs", "image", "").rows).toEqual([]);
    expect(tabCounts(model)).toEqual({ needs: 1, agent: 0, inherited: 1, all: 2 });
  });
});
