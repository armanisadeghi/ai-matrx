/**
 * Both model-switch engines keep the person's setting by default — the client
 * never silently converts or drops a set value; the SERVER translates it for
 * the new model (settings-translation K7).
 *
 *   Engine 1: features/agents/components/settings-management/reconciliation/analyze.ts
 *   Engine 2 (the core settings store) is proven in @ai-matrx/agents settings/__tests__.
 */

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
