import { recoveredAssistantAnswerText } from "./reattachStudioRun";
import {
  deriveAnswerText,
  deriveAnswerDocumentText,
  selectAccumulatedText,
  selectAnswerText,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import {
  envelopeFromCompleteValue,
  IR_ENVELOPE_KEY,
} from "@ai-matrx/content-ir";

describe("cleanup execution answer boundary", () => {
  it("projects a no-content structured block from its canonical envelope", () => {
    const structured = {
      __kind: "decision_answers",
      model: "test-model",
      answers: { preserve: { answer: "structured" } },
    };

    expect(
      deriveAnswerDocumentText({
        editedText: null,
        renderBlockOrder: ["thinking", "decision"],
        renderBlocks: {
          thinking: {
            blockId: "thinking",
            type: "thinking",
            content: "private scratch work",
          },
          decision: {
            blockId: "decision",
            type: "decision_answers",
            content: null,
            data: null,
            metadata: {
              [IR_ENVELOPE_KEY]: envelopeFromCompleteValue(
                structured,
                "decision_answers",
              ),
            },
          },
        },
      } as never),
    ).toBe(JSON.stringify(structured));
  });

  it("uses a typed __kind payload when no canonical envelope is present", () => {
    const structured = {
      __kind: "decision_answers",
      model: "payload-model",
      answers: { preserve: { answer: "payload" } },
    };
    expect(
      deriveAnswerDocumentText({
        editedText: null,
        renderBlockOrder: ["decision"],
        renderBlocks: {
          decision: {
            blockId: "decision",
            type: "decision_answers",
            content: null,
            data: { payload: structured },
          },
        },
      } as never),
    ).toBe(JSON.stringify(structured));
  });

  it("keeps closed, split, and open inline reasoning out of the canonical live answer", () => {
    const answer = deriveAnswerText({
      editedText: null,
      renderBlockOrder: [
        "before",
        "thinkingOpen",
        "thinkingClose",
        "after",
        "open",
      ],
      renderBlocks: {
        before: {
          blockId: "before",
          type: "text",
          content: "Visible before.",
        },
        thinkingOpen: {
          blockId: "thinkingOpen",
          type: "text",
          content: "<thinking>private reasoning split across blocks",
        },
        thinkingClose: {
          blockId: "thinkingClose",
          type: "text",
          content: "continues here</thinking>",
        },
        after: {
          blockId: "after",
          type: "text",
          content: "Visible after.",
        },
        open: {
          blockId: "open",
          type: "text",
          content: "<reasoning>unfinished private reasoning",
        },
      },
    } as never);

    expect(answer).toContain("Visible before.");
    expect(answer).toContain("Visible after.");
    expect(answer).not.toMatch(
      /private reasoning|continues here|<thinking|<reasoning/i,
    );
  });

  it("does not sanitize an explicit human edit", () => {
    expect(
      deriveAnswerText({
        editedText: "Keep this literal <thinking> example for the reader.",
        renderBlockOrder: [],
        renderBlocks: {},
      } as never),
    ).toBe("Keep this literal <thinking> example for the reader.");
  });

  it("proves the former raw-stream path carries typed reasoning while the canonical answer path does not", () => {
    const state = {
      activeRequests: {
        byRequestId: {
          cleanupRequest: {
            editedText: null,
            renderBlockOrder: ["thought", "reasoning", "answer"],
            renderBlocks: {
              thought: {
                blockId: "thought",
                type: "thinking",
                content: "private scratch work",
              },
              reasoning: {
                blockId: "reasoning",
                type: "reasoning",
                content: "provider chain of thought",
              },
              answer: {
                blockId: "answer",
                type: "text",
                content: "The cleaned transcript.",
              },
            },
          },
        },
      },
    } as never;

    // This is the selector the cleanup hook previously exposed. It is valid
    // for markdown rendering, but handing it to a textarea would leak both
    // typed reasoning blocks.
    expect(selectAccumulatedText("cleanupRequest")(state)).toBe(
      "private scratch work\nprovider chain of thought\nThe cleaned transcript.",
    );
    expect(selectAnswerText("cleanupRequest")(state)).toBe(
      "The cleaned transcript.",
    );
  });
});

describe("recoveredAssistantAnswerText", () => {
  it("returns only persisted answer text without mutating typed reasoning or structured parts", () => {
    // A real `decision_answers` message part — the generated MessagePart contract requires
    // __kind/model/method/usage/cost_usd (see packages/matrx-ai/matrx_ai/decisions/kinds.py in
    // aidream), so a fixture missing them is not a valid persisted part.
    const structuredResult = {
      type: "decision_answers",
      __kind: "decision_answers",
      model: "test-model",
      method: "native",
      answers: {
        preserve: { type: "noul", answer: "structured", confidence: 0.9 },
      },
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: 0.001,
    };
    const persistedParts = [
      { type: "thinking", text: "private scratch work" },
      { type: "reasoning", text: "provider chain of thought" },
      { type: "text", text: "The cleaned transcript." },
      structuredResult,
    ];
    const state = {
      messages: {
        byConversationId: {
          cleanup: {
            orderedIds: ["assistant"],
            byId: {
              assistant: {
                id: "assistant",
                role: "assistant",
                content: persistedParts,
              },
            },
          },
        },
      },
    } as never;

    expect(recoveredAssistantAnswerText(state, "cleanup")).toBe(
      `The cleaned transcript.\n${JSON.stringify(structuredResult)}`,
    );
    expect(persistedParts).toEqual([
      { type: "thinking", text: "private scratch work" },
      { type: "reasoning", text: "provider chain of thought" },
      { type: "text", text: "The cleaned transcript." },
      structuredResult,
    ]);
  });

  it("round-trips a persisted structured result into its lossless __kind document", () => {
    const structuredResult = {
      type: "decision_answers",
      __kind: "decision_answers",
      model: "payload-model",
      method: "native",
      answers: {
        preserve: { type: "noul", answer: "structured", confidence: 0.9 },
      },
      usage: { input_tokens: 10, output_tokens: 5 },
      cost_usd: 0.001,
    };
    const state = {
      messages: {
        byConversationId: {
          cleanup: {
            orderedIds: ["assistant"],
            byId: {
              assistant: {
                id: "assistant",
                role: "assistant",
                content: [
                  { type: "thinking", text: "private" },
                  structuredResult,
                ],
              },
            },
          },
        },
      },
    } as never;

    expect(recoveredAssistantAnswerText(state, "cleanup")).toBe(
      JSON.stringify(structuredResult),
    );
    expect(
      state.messages.byConversationId.cleanup.byId.assistant.content,
    ).toEqual([{ type: "thinking", text: "private" }, structuredResult]);
  });
});
