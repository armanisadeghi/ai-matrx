/**
 * The Model Settings modal tells ONE truth across its three views.
 *
 * Real use: "Product Shot Studio", an image agent on GPT Image 2 whose aspect
 * ratio and quality are run inputs (controls bound to variables) and whose
 * moderation is fixed at "low". On 2026-09-25 the Settings form showed
 * Quality = medium, Aspect Ratio = 1:1, Count = 1, Output Compression = 0 and a
 * "Response Format" row, while Raw Settings and Raw Editable showed only
 * `moderation: low`: the bound controls were missing from both JSON views, the
 * unset controls displayed a value nothing stored, and GPT Image 2's image
 * file format was presented as the text response format.
 *
 * These tests render the real AgentSettingsCore over a real agent-definition
 * store and read what each tab shows. Only the network-bound pieces (model
 * fetch thunks, the org knob, the model picker, the catalog hook) are stubbed.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("@/features/ai-models/redux/modelRegistrySlice", () => {
  const actual = jest.requireActual(
    "@/features/ai-models/redux/modelRegistrySlice",
  );
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    fetchModelOptions: () => ({ type: "test/noop" }),
    fetchModelById: () => ({ type: "test/noop" }),
  };
});
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: () => undefined,
}));
jest.mock("@/features/ai-models/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({ models: [] }),
}));
jest.mock("@/features/ai-models/components/lab/ModelListDropdown", () => ({
  ModelListDropdown: () => null,
}));
jest.mock("../ui-gates/UiGatesEditor", () => ({ UiGatesEditor: () => null }));
jest.mock("../output-schema/OutputSchemaTab", () => ({
  OutputSchemaTab: () => null,
}));
jest.mock("../matrx-directives/MatrxDirectivesTab", () => ({
  MatrxDirectivesTab: () => null,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));
jest.mock("@/features/overlays/openers/diffViewerWindow", () => ({
  useOpenDiffViewerWindow: () => () => undefined,
}));

import agentDefinitionReducer, {
  mergePartialAgent,
} from "@/features/agents/redux/agent-definition/slice";
import modelRegistryReducer from "@/features/ai-models/redux/modelRegistrySlice";
import { AgentSettingsCore } from "../AgentSettingsCore";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
// jsdom has no ResizeObserver; Radix measures with it. Layout is irrelevant here.
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const GPT_IMAGE_2 = "0386fcae-d2af-4bff-a411-4b349a040648";
const GEMINI_IMAGE = "1c057a01-5310-43b0-be6d-88dcc4eb4798";
const AGENT_ID = "3bf7e37d-26b4-4581-ac29-450462c18b22";

const ASPECT_OPTIONS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

// The live catalog rows (ai.model_config.controls) for the two image models.
const MODELS = {
  [GPT_IMAGE_2]: {
    id: GPT_IMAGE_2,
    name: "gpt-image-2",
    common_name: "GPT Image 2",
    constraints: [],
    _fetchType: "full",
    controls: {
      count: { max: 10, min: 1, type: "integer" },
      tools: { allowed: false },
      quality: { enum: ["auto", "low", "medium", "high"], type: "enum", default: "auto" },
      background: { enum: ["auto", "opaque"], type: "enum" },
      moderation: { enum: ["auto", "low"], type: "enum", default: "auto" },
      aspect_ratio: { enum: ASPECT_OPTIONS, type: "enum" },
      output_format: { enum: ["png", "jpeg", "webp"], type: "enum" },
      partial_images: { max: 3, min: 0, type: "integer" },
      output_compression: { max: 100, min: 0, type: "integer" },
    },
  },
  [GEMINI_IMAGE]: {
    id: GEMINI_IMAGE,
    name: "gemini-3.1-flash-image",
    common_name: "Gemini 3.1 Flash Image",
    constraints: [],
    _fetchType: "full",
    controls: {
      tools: { allowed: false },
      resolution: { enum: ["0.5k", "1k", "2k", "4k"], type: "enum" },
      aspect_ratio: { enum: ASPECT_OPTIONS, type: "enum" },
      internal_web_search: { allowed: true },
      internal_url_context: { allowed: true },
    },
  },
};

const SHOT_STUDIO_VARIABLES: VariableDefinition[] = [
  { name: "subject", defaultValue: "", required: true },
  {
    name: "aspect_ratio",
    control: { key: "aspect_ratio" },
    required: false,
    defaultValue: "1:1",
    customComponent: { type: "pill-toggle", options: ASPECT_OPTIONS },
  },
  {
    name: "quality",
    control: { key: "quality" },
    required: false,
    defaultValue: "medium",
    customComponent: { type: "select", options: ["auto", "low", "medium", "high"] },
  },
];

function makeStore(agent: {
  modelId: string;
  settings: Record<string, unknown>;
  variableDefinitions?: VariableDefinition[];
  tools?: string[];
}) {
  const registryInit = modelRegistryReducer(undefined, { type: "@@INIT" });
  const store = configureStore({
    reducer: {
      agentDefinition: agentDefinitionReducer,
      modelRegistry: modelRegistryReducer,
    },
    preloadedState: {
      modelRegistry: {
        ...registryInit,
        entities: MODELS as unknown as typeof registryInit.entities,
        activeIds: Object.keys(MODELS),
      },
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    mergePartialAgent({
      id: AGENT_ID,
      modelId: agent.modelId,
      settings: agent.settings,
      variableDefinitions: agent.variableDefinitions ?? [],
      tools: agent.tools ?? [],
    } as Parameters<typeof mergePartialAgent>[0]),
  );
  return store;
}

type TestStore = ReturnType<typeof makeStore>;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(store: TestStore) {
  act(() => {
    root.render(
      <Provider store={store}>
        <AgentSettingsCore agentId={AGENT_ID} />
      </Provider>,
    );
  });
}

function clickTab(label: string) {
  const tab = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.replace(/\d+\+?$/, "").trim() === label,
  );
  if (!tab) throw new Error(`tab "${label}" not found`);
  act(() => tab.click());
}

function readRawSettings(): Record<string, unknown> {
  clickTab("Raw Settings");
  const pre = container.querySelector("pre");
  if (!pre) throw new Error("Raw Settings shows no JSON");
  return JSON.parse(pre.textContent ?? "");
}

function readRawEditable(): Record<string, unknown> {
  clickTab("Raw Editable");
  const ta = container.querySelector("textarea");
  if (!ta) throw new Error("Raw Editable shows no editor");
  return JSON.parse(ta.value);
}

interface FormRow {
  key: string;
  state: string;
  text: string;
  inputs: string[];
}

function readForm(): FormRow[] {
  clickTab("Settings");
  return [...container.querySelectorAll<HTMLElement>("[data-setting-row]")].map(
    (row) => ({
      key: row.getAttribute("data-setting-row") ?? "",
      state: row.getAttribute("data-setting-state") ?? "",
      text: (row.textContent ?? "").replace(/\s+/g, " ").trim(),
      inputs: [...row.querySelectorAll("input")].map((i) => i.value),
    }),
  );
}

function agent(store: TestStore) {
  return store.getState().agentDefinition.agents[AGENT_ID];
}

function setTextareaValue(ta: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  setter.call(ta, value);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

async function applyRawEditable(next: Record<string, unknown>) {
  clickTab("Raw Editable");
  const ta = container.querySelector("textarea")!;
  act(() => setTextareaValue(ta, JSON.stringify(next, null, 2)));
  // The editor validates on a 200ms debounce before Apply is enabled.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 260));
  });
  const apply = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === "Apply",
  )!;
  act(() => apply.click());
}

const shotStudio = () =>
  makeStore({
    modelId: GPT_IMAGE_2,
    settings: { moderation: "low" },
    variableDefinitions: SHOT_STUDIO_VARIABLES,
  });

describe("Model Settings — every view shows the same truth", () => {
  test("Raw Settings shows each bound control as its run input, not nothing", () => {
    render(shotStudio());
    const raw = readRawSettings();
    expect(raw).toEqual({
      model_id: GPT_IMAGE_2,
      moderation: "low",
      aspect_ratio: { $var: "aspect_ratio", default: "1:1" },
      quality: { $var: "quality", default: "medium" },
    });
  });

  test("Raw Editable starts from exactly what Raw Settings shows", () => {
    render(shotStudio());
    expect(readRawEditable()).toEqual(readRawSettings());
  });

  test("an unset control is labelled as not set / model default, never shown as a value", () => {
    render(shotStudio());
    const rows = Object.fromEntries(readForm().map((r) => [r.key, r]));
    // Count has no catalog default and nothing stored: no phantom "1".
    expect(rows.count.state).toBe("unset");
    expect(rows.count.inputs).toEqual([]);
    expect(rows.count.text).toMatch(/Not set/);
    expect(rows.output_compression.state).toBe("unset");
    expect(rows.output_compression.inputs).toEqual([]);
    expect(rows.partial_images.state).toBe("unset");
    expect(rows.moderation.state).toBe("set");
    expect(rows.moderation.text).toMatch(/low/);
  });

  test("a control with a catalog default says it is the model default", () => {
    render(
      makeStore({ modelId: GEMINI_IMAGE, settings: { aspect_ratio: "1:1" } }),
    );
    const rows = Object.fromEntries(readForm().map((r) => [r.key, r]));
    expect(rows.internal_web_search.state).toBe("default");
    expect(rows.internal_web_search.text).toMatch(/Model default: On/);
    expect(rows.aspect_ratio.state).toBe("set");
  });

  test("every form row agrees with the JSON views, key by key", () => {
    render(shotStudio());
    const rows = readForm();
    const raw = readRawSettings();
    const rawEdit = readRawEditable();
    expect(rawEdit).toEqual(raw);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      if (row.state === "bound") {
        expect(raw[row.key]).toMatchObject({ $var: expect.any(String) });
        const marker = raw[row.key] as { $var: string; default: string };
        expect(row.text).toContain(`{{${marker.$var}}}`);
        expect(row.text).toContain(marker.default);
      } else if (row.state === "set") {
        expect(raw).toHaveProperty(row.key);
      } else {
        expect(raw).not.toHaveProperty(row.key);
      }
    }
    // …and every JSON key other than identity is a form row.
    const rowKeys = new Set(rows.map((r) => r.key));
    for (const key of Object.keys(raw)) {
      if (key === "model_id" || key === "tools") continue;
      expect(rowKeys).toContain(key);
    }
  });

  test("GPT Image 2's output_format is the image file format, never 'Response Format'", () => {
    render(shotStudio());
    const rows = Object.fromEntries(readForm().map((r) => [r.key, r]));
    expect(rows.response_format).toBeUndefined();
    expect(rows.output_format).toBeDefined();
  });

  test("a legacy settings.model_id never replaces the agent's model in the JSON", () => {
    render(
      makeStore({
        modelId: GEMINI_IMAGE,
        settings: { model_id: GPT_IMAGE_2, aspect_ratio: "1:1" },
      }),
    );
    expect(readRawSettings().model_id).toBe(GEMINI_IMAGE);
    expect(readRawEditable().model_id).toBe(GEMINI_IMAGE);
  });
});

describe("Raw Editable Apply writes the document back without corrupting settings", () => {
  test("applying the untouched document changes nothing", async () => {
    const store = shotStudio();
    render(store);
    const before = agent(store);
    await applyRawEditable(readRawEditable());
    const after = agent(store);
    expect(after.settings).toEqual(before.settings);
    expect(after.variableDefinitions).toEqual(before.variableDefinitions);
  });

  test("a $var marker never lands in settings; editing its default edits the run input", async () => {
    const store = shotStudio();
    render(store);
    const doc = readRawEditable();
    await applyRawEditable({
      ...doc,
      aspect_ratio: { $var: "aspect_ratio", default: "16:9" },
    });
    const after = agent(store);
    expect(after.settings).toEqual({ moderation: "low" });
    const aspect = after.variableDefinitions!.find(
      (d) => d.control?.key === "aspect_ratio",
    );
    expect(aspect?.defaultValue).toBe("16:9");
    expect(readRawSettings().aspect_ratio).toEqual({
      $var: "aspect_ratio",
      default: "16:9",
    });
  });

  test("replacing a marker with a literal makes it a fixed setting", async () => {
    const store = shotStudio();
    render(store);
    await applyRawEditable({ ...readRawEditable(), quality: "high" });
    const after = agent(store);
    expect(after.settings).toEqual({ moderation: "low", quality: "high" });
    expect(
      after.variableDefinitions!.some((d) => d.control?.key === "quality"),
    ).toBe(false);
    const rows = Object.fromEntries(readForm().map((r) => [r.key, r]));
    expect(rows.quality.state).toBe("set");
  });
});
