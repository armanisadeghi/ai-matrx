/**
 * Every setting has THREE distinguishable states, and the saved JSON says
 * exactly which one (owner, 2026-10-02: "the difference between something
 * being set to none and something not being included at all"):
 *
 *   not set → the key is ABSENT from the saved settings
 *   off     → an explicit off value is saved ("none" / false)
 *   value   → the value is saved
 *
 * And a model switch never silently drops or converts a set value: the value
 * is kept and shown as "Translated for this model" (the server translates).
 *
 * Real use: "Contract Clause Reviewer", a legal-review agent on a reasoning
 * model. These render the real AgentSettingsCore over a real agent-definition
 * store and read the DB update payload the save path builds
 * (agentDefinitionToUpdate) — only network-bound pieces are stubbed.
 */

import { agentDefinitionWithBuilderReducer } from "@/features/agents/redux/agent-builder.slice";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

let mockNextModelId = "";

jest.mock("@ai-matrx/chat/agents/model-registry/modelRegistrySlice", () => {
  const actual = jest.requireActual(
    "@ai-matrx/chat/agents/model-registry/modelRegistrySlice",
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
import modelRegistryReducer from "@ai-matrx/chat/agents/model-registry/modelRegistrySlice";
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
        enum: ["none", "low", "medium", "high", "xhigh"],
        default: "medium",
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
  const registryInit = modelRegistryReducer(undefined, { type: "@@INIT" });
  const store = configureStore({
    reducer: {
      agentDefinition: agentDefinitionWithBuilderReducer,
      modelRegistry: modelRegistryReducer,
    },
    preloadedState: {
      modelRegistry: {
        ...registryInit,
        entities: Object.fromEntries(
          Object.entries(MODELS).map(([id, m]) => [id, normalizeModel(m)]),
        ) as unknown as typeof registryInit.entities,
        activeIds: Object.keys(MODELS),
      },
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

describe("three setting states — saved JSON says absent / off / value", () => {
  it("value: a level is saved and the row reads as set", () => {
    const store = makeStore({ reasoning_effort: "high" });
    render(store);
    expect(rowState("reasoning_effort")).toBe("set");
    expect(savedSettings(store)).toEqual({ reasoning_effort: "high" });
  });

  it("off: an explicit 'none' is saved, shows Off, and is not unset", () => {
    const store = makeStore({ reasoning_effort: "none", include_thoughts: false });
    render(store);
    expect(rowState("reasoning_effort")).toBe("off");
    expect(row("reasoning_effort").textContent).toContain("Off");
    expect(rowState("include_thoughts")).toBe("off");
    const saved = savedSettings(store);
    expect(saved.reasoning_effort).toBe("none");
    expect(saved.include_thoughts).toBe(false);
  });

  it("not set: clearing removes the key — absent, never null or a sentinel", () => {
    const store = makeStore({ reasoning_effort: "none", max_output_tokens: 4096 });
    render(store);
    clickClear("reasoning_effort");
    const saved = savedSettings(store);
    expect("reasoning_effort" in saved).toBe(false);
    expect(saved).toEqual({ max_output_tokens: 4096 });
    // The row now reads as not set (the model default is labelled, never stored).
    expect(["unset", "default"]).toContain(rowState("reasoning_effort"));
    expect(row("reasoning_effort").textContent).toContain("Not set");
  });

  it("set → off → not set round-trips through the stored JSON", () => {
    const store = makeStore({ reasoning_effort: "high" });
    render(store);
    expect(savedSettings(store)).toEqual({ reasoning_effort: "high" });
    act(() => {
      store.dispatch(
        mergePartialAgent({
          id: AGENT_ID,
          settings: { reasoning_effort: "none" },
        } as Parameters<typeof mergePartialAgent>[0]),
      );
    });
    expect(rowState("reasoning_effort")).toBe("off");
    clickClear("reasoning_effort");
    expect(savedSettings(store)).toEqual({});
  });
});

describe("model switch keeps the person's setting", () => {
  it("a value the new model lacks is kept and shown as translated, never cleared", () => {
    const store = makeStore({ reasoning_effort: "high", max_output_tokens: 8000 });
    render(store);
    mockNextModelId = PLAIN_MODEL;
    const switcher = container.querySelector<HTMLButtonElement>(
      "[data-test-switch-model]",
    )!;
    act(() => switcher.click());

    const agent = store.getState().agentDefinition.agents[AGENT_ID];
    expect(agent.modelId).toBe(PLAIN_MODEL); // committed without a dialog
    expect(savedSettings(store)).toEqual({
      reasoning_effort: "high",
      max_output_tokens: 8000,
    });
    expect(rowState("reasoning_effort")).toBe("translated");
    expect(row("reasoning_effort").textContent).toContain("Translated");
    // Nothing about it reads as a warning to fix.
    expect(container.textContent).not.toContain("Settings Warnings");
  });

  it("an explicit off survives a switch too (off is a setting, not absence)", () => {
    const store = makeStore({ reasoning_effort: "none" });
    render(store);
    mockNextModelId = PLAIN_MODEL;
    act(() =>
      container
        .querySelector<HTMLButtonElement>("[data-test-switch-model]")!
        .click(),
    );
    expect(savedSettings(store)).toEqual({ reasoning_effort: "none" });
  });
});
