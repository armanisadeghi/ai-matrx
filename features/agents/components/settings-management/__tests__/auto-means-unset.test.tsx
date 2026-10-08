/**
 * ONE MEANING PER STATE (settings-translation F-b). The server treats a saved
 * reasoning_effort "auto" exactly like an absent key (aidream
 * catalog/canonicalize.py), so choosing "auto" in the builder must REMOVE the
 * key — never save a word equal to unset. Checking the box to set the setting
 * stores a real level, never "auto".
 *
 * The real AgentSettingsCore over a real agent-definition store; only the
 * dense control primitive is stubbed (a button that emits one value), so the
 * test drives the builder's own write path without a Radix select.
 */

import { agentDefinitionWithBuilderReducer } from "@/features/agents/redux/agent-builder.slice";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

jest.mock("../controls/SettingControlInput", () => ({
  SettingControlInput: ({
    settingKey,
    onChange,
  }: {
    settingKey: string;
    onChange: (v: unknown) => void;
  }) => (
    <>
      <button type="button" data-test-pick={`${settingKey}:auto`} onClick={() => onChange("auto")}>
        auto
      </button>
      <button type="button" data-test-pick={`${settingKey}:low`} onClick={() => onChange("low")}>
        low
      </button>
    </>
  ),
}));

let mockNextModelId = "";

jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: () => undefined,
}));
jest.mock("@ai-matrx/agents/models/react", () => ({
  useModelCatalog: () => ({ models: [] }),
  ModelListDropdown: ({
    onValueChange,
  }: {
    onValueChange: (id: string) => void;
  }) => (
    <button
      type="button"
      data-test-switch-model
      onClick={() => onValueChange(mockNextModelId)}
    >
      switch
    </button>
  ),
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
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { agentDefinitionToUpdate } from "@ai-matrx/chat/agents/redux/agent-definition/converters";
import { getModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { normalizeModel } from "@ai-matrx/agents/models";
import { AgentSettingsCore } from "../AgentSettingsCore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const REASONING_MODEL = "6f1d2b0e-5d0a-4a57-9c34-0b8a3d6e1f21";
const PLAIN_MODEL = "a3c9e7d4-1b2f-4e6a-8d5c-7f0e9b2a4c13";
const AGENT_ID = "c1e5a9f3-7b2d-4d8e-9a61-3f4b2c8d7e05";

const MODELS = {
  [REASONING_MODEL]: {
    id: REASONING_MODEL,
    name: "gpt-5.5",
    common_name: "GPT-5.5",
    constraints: [],
    _fetchType: "full",
    controls: {
      reasoning_effort: {
        type: "enum",
        enum: ["auto", "none", "low", "medium", "high", "xhigh"],
        default: "auto",
      },
      include_thoughts: { type: "boolean" },
      max_output_tokens: { type: "integer", min: 1, max: 128000 },
    },
  },
  [PLAIN_MODEL]: {
    id: PLAIN_MODEL,
    name: "llama-3.3-70b",
    common_name: "Llama 3.3 70B",
    constraints: [],
    _fetchType: "full",
    controls: {
      temperature: { type: "number", min: 0, max: 2 },
      max_output_tokens: { type: "integer", min: 1, max: 32768 },
    },
  },
};

function makeStore(settings: Record<string, unknown>) {
  // The model catalog's records (B3) hold the models the settings read.
  getModelRecords().hydrate({
    models: Object.values(MODELS).map((m) => normalizeModel(m)) as never,
    fetchType: "full",
    fetchScope: "active",
    lastFetched: Date.now(),
  });
  const store = configureStore({
    reducer: {
      agentDefinition: agentDefinitionWithBuilderReducer,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }),
  });
  store.dispatch(
    mergePartialAgent({
      id: AGENT_ID,
      name: "Contract Clause Reviewer",
      modelId: REASONING_MODEL,
      settings,
      variableDefinitions: [],
      tools: [],
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

/** The settings JSON the save path writes to the database. */
function savedSettings(store: TestStore): Record<string, unknown> {
  const agent = store.getState().agentDefinition.agents[AGENT_ID];
  return agentDefinitionToUpdate({ settings: agent.settings }).settings as Record<
    string,
    unknown
  >;
}

function row(key: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-setting-row="${key}"]`);
  if (!el) throw new Error(`no row for ${key}`);
  return el;
}

function rowState(key: string): string | null {
  return row(key).getAttribute("data-setting-state");
}

function clickClear(key: string) {
  const btn = [...row(key).querySelectorAll("button")].find(
    (b) => b.querySelector(".lucide-trash2, .lucide-trash-2") !== null,
  );
  if (!btn) throw new Error(`no clear control on ${key}`);
  act(() => btn.click());
}

function pick(key: string, value: string) {
  const btn = container.querySelector<HTMLButtonElement>(
    `[data-test-pick="${key}:${value}"]`,
  );
  if (!btn) throw new Error(`no ${value} choice on ${key}`);
  act(() => btn.click());
}

describe("'auto' effort is not set — one meaning per state (F-b)", () => {
  it("choosing auto removes the saved key", () => {
    const store = makeStore({ reasoning_effort: "high", max_output_tokens: 4096 });
    render(store);
    pick("reasoning_effort", "auto");
    expect(savedSettings(store)).toEqual({ max_output_tokens: 4096 });
  });

  it("choosing a level still saves it", () => {
    const store = makeStore({ reasoning_effort: "high" });
    render(store);
    pick("reasoning_effort", "low");
    expect(savedSettings(store)).toEqual({ reasoning_effort: "low" });
  });
});
