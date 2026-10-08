/**
 * Both model-switch engines keep the person's setting by default — the client
 * never silently converts or drops a set value; the SERVER translates it for
 * the new model (settings-translation K7).
 *
 *   Engine 1: features/agents/components/settings-management/reconciliation/analyze.ts
 *   Engine 2: requestModelSwitch → confirmModelSwitch in agentSettingsSlice
 */

import { configureStore } from "@reduxjs/toolkit";
import agentSettingsReducer, {
  initializeAgent,
  requestModelSwitch,
  confirmModelSwitch,
} from "@ai-matrx/chat/agents/redux/agent-settings/agentSettingsSlice";
import { getModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { normalizeModel } from "@ai-matrx/agents/models";
import {
  analyzeModelChange,
  applyReconciliation,
  planNeedsNoDecision,
} from "@/features/agents/components/settings-management/reconciliation/analyze";
import { useModelControls } from "@ai-matrx/chat/agents/hooks/useModelControls";
import type { FeLlmParams } from "@ai-matrx/chat/agents/types/agent-api-types";

const CLAUDE = "5b8e2f4a-9c1d-4e7b-a2f6-0d3c8b1e9a47";
const LLAMA = "e7a1c3d9-2b4f-4a8e-b6d0-9f5c1e3a7b28";

const MODELS = {
  [CLAUDE]: {
    id: CLAUDE,
    name: "claude-opus-4-7",
    common_name: "Claude Opus 4.7",
    constraints: [],
    _fetchType: "full",
    controls: {
      reasoning_effort: { type: "enum", enum: ["none", "low", "medium", "high"] },
      include_thoughts: { type: "boolean" },
      temperature: { type: "number", min: 0, max: 1 },
    },
  },
  [LLAMA]: {
    id: LLAMA,
    name: "llama-3.3-70b",
    common_name: "Llama 3.3 70B",
    constraints: [],
    _fetchType: "full",
    controls: {
      temperature: { type: "number", min: 0, max: 2, default: 0.7 },
      reasoning_effort: { type: "enum", enum: ["low", "medium"] },
    },
  },
};

function makeStore() {
  // The model catalog's records (B3) hold the models the settings read.
  getModelRecords().hydrate({
    models: Object.values(MODELS).map((m) => normalizeModel(m)) as never,
    fetchType: "full",
    fetchScope: "active",
    lastFetched: Date.now(),
  });
  return configureStore({
    reducer: {
      agentSettings: agentSettingsReducer,
    },
    middleware: (gdm) =>
      gdm({ serializableCheck: false, immutableCheck: false }),
  });
}

describe("engine 2 (agentSettings slice) — default keeps every set value", () => {
  it("a setting the new model lacks survives confirm without any choice", async () => {
    const store = makeStore();
    store.dispatch(
      initializeAgent({
        agentId: "deposition-summarizer",
        source: "agent",
        context: "builder",
        settings: {
          model: CLAUDE,
          include_thoughts: false,
          reasoning_effort: "high",
          temperature: 0.4,
        } as never,
      } as never),
    );
    await store.dispatch(
      requestModelSwitch({ agentId: "deposition-summarizer", newModelId: LLAMA }),
    );
    const pending =
      store.getState().agentSettings.entries["deposition-summarizer"].pendingSwitch;
    expect(pending?.mode).toBe("keep_all");
    expect(pending?.conflicts.map((c) => c.key).sort()).toEqual([
      "include_thoughts",
      "reasoning_effort",
    ]);

    store.dispatch(confirmModelSwitch("deposition-summarizer"));
    const defaults = store.getState().agentSettings.entries["deposition-summarizer"]
      .defaults as Record<string, unknown>;
    expect(defaults).toMatchObject({
      model: LLAMA,
      include_thoughts: false, // explicit off kept — not dropped to absent
      reasoning_effort: "high", // not converted to the new list client-side
      temperature: 0.4,
    });
  });
});

describe("engine 2 — a model switch never carries the old model's class", () => {
  // A class (ai.offering) belongs to exactly one model; ai.resolve_model_config
  // refuses a foreign pair with P0002 (captured 2026-10-07 in the builder).
  const OLD_CLASS = "29874e67-5683-40c2-9adb-fb797ea9a176";
  const NEW_CLASS = "cb1f1119-911a-49f7-8bf1-fbc28e21f8ae";

  function seed(store: ReturnType<typeof makeStore>) {
    store.dispatch(
      initializeAgent({
        agentId: "flashcards",
        source: "agent",
        context: "builder",
        settings: { model: CLAUDE, offering_id: OLD_CLASS, temperature: 0.4 } as never,
      } as never),
    );
  }

  it("no class picked → the old model's class is dropped on confirm", async () => {
    const store = makeStore();
    seed(store);
    await store.dispatch(requestModelSwitch({ agentId: "flashcards", newModelId: LLAMA }));
    // Nothing is written while the switch waits for confirmation.
    expect(
      (store.getState().agentSettings.entries.flashcards.defaults as Record<string, unknown>)
        .offering_id,
    ).toBe(OLD_CLASS);
    store.dispatch(confirmModelSwitch("flashcards"));
    const defaults = store.getState().agentSettings.entries.flashcards.defaults as Record<
      string,
      unknown
    >;
    expect(defaults.model).toBe(LLAMA);
    expect("offering_id" in defaults).toBe(false);
  });

  it("the class picked with the model lands together with the model", async () => {
    const store = makeStore();
    seed(store);
    await store.dispatch(
      requestModelSwitch({ agentId: "flashcards", newModelId: LLAMA, offeringId: NEW_CLASS }),
    );
    expect(
      (store.getState().agentSettings.entries.flashcards.defaults as Record<string, unknown>)
        .offering_id,
    ).toBe(OLD_CLASS);
    store.dispatch(confirmModelSwitch("flashcards"));
    expect(store.getState().agentSettings.entries.flashcards.defaults).toMatchObject({
      model: LLAMA,
      offering_id: NEW_CLASS,
    });
  });
});

describe("engine 1 (reconciliation/analyze) — suggested action is keep", () => {
  const models = Object.values(MODELS).map((m) => normalizeModel(m));

  it("unsupported, out-of-list and out-of-range values all default to keep", () => {
    const settings = {
      include_thoughts: false,
      reasoning_effort: "high",
      temperature: 0.4,
    } as unknown as FeLlmParams;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- pure function
    const { normalizedControls } = useModelControls(models as never, LLAMA);
    const plan = analyzeModelChange(
      settings,
      LLAMA,
      models.find((m) => m.id === LLAMA),
      normalizedControls,
      [],
      null,
    );
    const byKey = Object.fromEntries(plan.incompatible.map((r) => [r.key, r]));
    expect(byKey.include_thoughts.issue).toBe("translated");
    expect(byKey.include_thoughts.suggestedAction).toBe("keep");
    expect(byKey.reasoning_effort.suggestedAction).toBe("keep");
    expect(applyReconciliation(plan, {})).toEqual(settings);
  });

  it("a switch whose only rows are translated needs no decision", () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- pure function
    const { normalizedControls } = useModelControls(models as never, LLAMA);
    const plan = analyzeModelChange(
      { include_thoughts: false, temperature: 0.4 } as unknown as FeLlmParams,
      LLAMA,
      models.find((m) => m.id === LLAMA),
      normalizedControls,
      [],
      null,
    );
    expect(planNeedsNoDecision(plan)).toBe(true);
  });
});
