/**
 * A missing rule opens EMPTY from every entry point: nothing chosen, nothing approvable.
 *
 * Third verifier (V3): "Include reasoning · Anthropic Chat · Missing" opened with Dropped looking
 * pre-selected and a one-click "Save & approve" — the earlier fix had reached only one path. Every
 * way the editor opens is built in `components/editorTargets.ts`; this renders the real editor from
 * each of them (a queue row, the same row on mobile, a grid cell in the All view, and a model's own
 * rule opened from inside the editor) and checks what the owner sees.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildGrid, buildQueue } from "../model";
import { overrideTarget, queueTarget, targetFor } from "../components/editorTargets";
import TranslationCellEditor, { type EditorTarget } from "../components/TranslationCellEditor";
import type { TranslationBundle, TranslationCellRow } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/features/ai-models/catalogReload", () => ({ reloadAiCatalog: () => ({ type: "noop" }) }));
// The notes box is a ProTextarea (2026-10-07) -- dictation, read-aloud and page agents behind a
// full app store. It is not what this suite examines (what the editor OPENS with), so it renders
// as the plain textarea it wraps.
jest.mock("@/components/official/ProTextarea", () => {
  const React = require("react");
  return { ProTextarea: React.forwardRef((props: object, ref: unknown) => React.createElement("textarea", { ...props, ref })) };
});
jest.mock("../data", () => ({ saveTranslationCell: jest.fn(), archiveTranslationCell: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const API = "11111111-1111-1111-1111-111111111111";
const OFF_A = "aaaaaaaa-0000-0000-0000-000000000001";
const OFF_B = "aaaaaaaa-0000-0000-0000-000000000002";

function cell(over: Partial<TranslationCellRow>): TranslationCellRow {
  return {
    id: "c",
    layer: "api",
    layer_owner_id: API,
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

// Llama has its own reasoning rule; Qwen has none at any layer → a missing rule for the API group.
const own = cell({ id: "o1", layer: "offering", layer_owner_id: OFF_A, setting_key: "reasoning_effort", rule: { value_map: { low: "low" } }, state: "proposed", source: "agent", confidence: 0.6 });
const temp = cell({ id: "t1", setting_key: "temperature" });
const BUNDLE: TranslationBundle = {
  cells: [temp, own],
  compiled: [
    { offering_id: OFF_A, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
    { offering_id: OFF_A, setting_key: "reasoning_effort", cell_id: "o1", layer: "offering", state: "proposed" },
    { offering_id: OFF_B, setting_key: "temperature", cell_id: "t1", layer: "api", state: "inherited" },
  ],
  profiles: [],
  apis: [{ id: API, name: "groq_chat", display_name: "Groq Chat", translator_key: "groq_chat" }],
  offerings: [
    { id: OFF_A, api_id: API, model_id: "m1", provider_model_id: "llama", setting_profile_id: null, model_name: "Llama", capabilities: { input: ["text"], output: ["text"], interaction: "turn" } },
    { id: OFF_B, api_id: API, model_id: "m2", provider_model_id: "qwen", setting_profile_id: null, model_name: "Qwen", capabilities: { input: ["text"], output: ["text"], interaction: "turn" } },
  ],
  settings: [
    { key: "temperature", value_type: "number", canonical_min: 0, canonical_max: 2, canonical_values: null, default_value: null, value_positions: null, family: "Randomness" },
    { key: "reasoning_effort", value_type: "enum", canonical_min: null, canonical_max: null, canonical_values: ["auto", "none", "low", "medium", "high"], default_value: null, value_positions: null, family: "Intensity" },
  ],
} as unknown as TranslationBundle;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(target: EditorTarget) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const setting = BUNDLE.settings.find((s) => s.key === target.settingKey);
  act(() => {
    root!.render(
      <TranslationCellEditor target={target} setting={setting} onClose={() => {}} onChanged={() => {}} onOpenOverride={() => {}} />,
    );
  });
}

function buttons(): string[] {
  return [...document.body.querySelectorAll("button")].map((b) => (b.textContent ?? "").trim());
}

function expectEmpty() {
  const selected = [...document.body.querySelectorAll('[role="tab"][aria-selected="true"]')];
  expect(selected.map((t) => t.textContent)).toEqual([]);
  expect(document.body.querySelector('[data-testid="rule-mode-pick"]')).not.toBeNull();
  expect(buttons().some((b) => /approve/i.test(b))).toBe(false);
  expect(document.body.textContent).toContain("No rule yet");
  expect(document.body.textContent).not.toContain("guess");
}

describe("every way a missing-rule editor opens", () => {
  const model = buildGrid(BUNDLE);
  const queue = buildQueue(BUNDLE, model);
  const missingItems = queue.filter((i) => i.kind === "missing");
  const gridMissing = model.rows.flatMap((r) => [...r.cells.values()]).filter((gc) => !gc.cell);

  it("the fixture has a missing rule in the queue and in the grid", () => {
    expect(missingItems.length).toBeGreaterThan(0);
    expect(gridMissing.length).toBeGreaterThan(0);
  });

  it("from the No rule yet queue row (desktop pencil and mobile card share it)", () => {
    for (const item of missingItems) {
      render(queueTarget(item));
      expectEmpty();
      act(() => root?.unmount());
    }
  });

  it("from a grid cell in the All view", () => {
    for (const gc of gridMissing) {
      render(targetFor(gc));
      expectEmpty();
      act(() => root?.unmount());
    }
  });

  it("picking a way is what makes it approvable", () => {
    render(queueTarget(missingItems[0]));
    const native = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Native")!;
    act(() => native.click());
    expect(buttons()).toContain("Save & approve");
  });

  it("a model's own rule opened from the editor shows its rule, not an empty editor", () => {
    const gc = gridMissing[0];
    const column = gc.column;
    render(overrideTarget(column, gc.key, { offering: BUNDLE.offerings[0], cell: own }));
    expect(document.body.querySelector('[data-testid="rule-mode-pick"]')).toBeNull();
  });
});
