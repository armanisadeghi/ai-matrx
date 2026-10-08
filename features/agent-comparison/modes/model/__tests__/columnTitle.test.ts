/**
 * A Model-battle column is named after the model it runs, read live.
 * Regression (2026-10-02): two of five columns read "Model 3" / "Model 4"
 * above GPT-6 Astra and Gemini 3.8 Flash answers, because the name was copied
 * once at pick time and the model list had not loaded those models yet.
 */
import type { RootState } from "@/lib/redux/store";
import { selectModelColumnTitle } from "../columnTitle";

const records: { entities: Record<string, unknown>; identityById: Record<string, unknown> } = { entities: {}, identityById: {} };
jest.mock("@ai-matrx/chat/agents/identity/model-catalog", () => ({ readModelRecords: () => records }));

function state(
  models: Record<string, { name: string }>,
  overrides: Record<string, unknown>,
): RootState {
  records.entities = models;
  return {
    instanceModelOverrides: {
      byConversationId: {
        conv: { overrides, removals: [], baseSettings: { model: "agent-model" } },
      },
    },
  } as unknown as RootState;
}

describe("selectModelColumnTitle", () => {
  it("names the column after its picked model, whatever was stored", () => {
    const s = state({ astra: { name: "GPT-6 Astra" } }, { model: "astra" });
    expect(
      selectModelColumnTitle(s, { conversationId: "conv", label: "Model 3" }),
    ).toBe("GPT-6 Astra");
  });

  it("names an unpicked column after the agent's model", () => {
    const s = state({ "agent-model": { name: "Gemini 3.8 Flash" } }, {});
    expect(
      selectModelColumnTitle(s, { conversationId: "conv", label: "Model 2" }),
    ).toBe("Gemini 3.8 Flash");
  });

  it("keeps a name the person typed", () => {
    const s = state({ astra: { name: "GPT-6 Astra" } }, { model: "astra" });
    expect(
      selectModelColumnTitle(s, {
        conversationId: "conv",
        label: "Fast baseline",
        labelCustom: true,
      }),
    ).toBe("Fast baseline");
  });

  it("falls back to the stored label only while the model's name is unknown", () => {
    const s = state({}, { model: "astra" });
    expect(
      selectModelColumnTitle(s, { conversationId: "conv", label: "Model 3" }),
    ).toBe("Model 3");
  });
});
