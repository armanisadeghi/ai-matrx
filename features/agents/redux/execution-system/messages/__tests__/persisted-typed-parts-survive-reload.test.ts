/**
 * REGRESSION GUARD — a reloaded transcript never drops a typed part.
 *
 * Builder universal-support audit 2026-09-26, gap #1: the persisted-message
 * readers were CLOSED allowlists. `selectMessageInterleavedContent` ended in a
 * bare `default: break`, the user bubble kept a hand-made list of "not an
 * attachment" types, and the persistence boundary threw on any kind it had not
 * been generated with. So a decision turn, a speech script, or any kind the
 * server adds next vanished (or crashed the message) the moment the page
 * reloaded. The rule now is structural: every part that is not text,
 * reasoning, a tool call or a registered attachment is BODY and renders; a
 * kind this build does not know renders as the honest Unknown Data Event.
 *
 * Fixtures are the real persisted shapes (chat.message rows written by the
 * Feedback triage agent and the ElevenLabs speech agent for admin@admin.com),
 * trimmed of prose only.
 */

import {
  persistedBodyBlocks,
  selectMessageInterleavedContent,
} from "../messages.selectors";
import { parsePersistedMessageContent } from "../persisted-content-boundary";
import { normalizeMessagePart } from "@/features/agents/components/context-items/normalize";
import { fromCxMediaPart } from "@/features/files/blocks/image/adapters/from-cx-media-part";
import { fromCxVideoPart } from "@/features/files/blocks/adapters/from-cx-av-part";
import type { MessageRecord } from "../messages.slice";
import type { RootState } from "@/lib/redux/store";
import type {
  ImageMediaPart,
  MessagePart,
  VideoMediaPart,
} from "@/types/python-generated/stream-events";

const DECISION_QUESTIONS = {
  type: "decision_questions",
  __kind: "decision_questions",
  metadata: {},
  questions: [
    {
      name: "is_defect",
      type: "noul",
      criteria: { true: "existing behaviour is wrong", false: "new behaviour is wanted" },
      instructions: "Is this a defect in existing behaviour rather than a request for new behaviour?",
      suggested_threshold: 0.7,
    },
    {
      name: "urgency",
      type: "score",
      criteria: ["cosmetic", "minor friction", "a feature is blocked", "data or money at risk", "down for someone"],
      instructions: "How urgent is this?",
    },
  ],
};

const DECISION_ANSWERS = {
  type: "decision_answers",
  model: "jev-1.13.0",
  usage: { input_tokens: 729, output_tokens: 91 },
  __kind: "decision_answers",
  method: "native",
  answers: {
    is_defect: { type: "noul", __kind: "decision_answer", answer: true, confidence: 0.96, probability: 0.96 },
  },
  cost_usd: 0.00003,
  metadata: {},
  unanswerable: {},
};

const SPEECH_SCRIPT = {
  type: "speech_script",
  __kind: "speech_script",
  metadata: {},
  turns: [
    {
      text: "Good morning and welcome to Deep Dive.",
      voice: "cgSgspJ2msm6clMCkdW9",
      speaker: "Maya",
      direction: "warm and upbeat",
      pause_after_ms: 400,
    },
  ],
};

/** A kind the server might persist tomorrow — this build has never heard of it. */
const FUTURE_KIND = { type: "survey_result", metadata: {}, score: 7 };

const REASONING = { type: "thinking", text: "Weighing the report against the rubric." };

function record(role: "user" | "assistant", content: unknown[]): MessageRecord {
  return { id: "m1", role, content } as unknown as MessageRecord;
}

function stateWith(rec: MessageRecord): RootState {
  return {
    messages: { byConversationId: { c1: { byId: { m1: rec } } } },
    observability: { toolCalls: {} },
  } as unknown as RootState;
}

const isText = (part: MessagePart) => part.type === "text";

describe("reloaded transcript keeps every typed part", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("assistant interleaved path (turn with reasoning) renders decision answers, speech script and an unknown kind", () => {
    const rec = record("assistant", [
      REASONING,
      DECISION_ANSWERS,
      SPEECH_SCRIPT,
      FUTURE_KIND,
    ]);
    const segments = selectMessageInterleavedContent("c1", "m1")(stateWith(rec));
    const blockTypes = segments
      .filter((s) => s.type === "render_block")
      .map((s) => (s as { blockType: string }).blockType);
    expect(segments[0]?.type).toBe("thinking");
    expect(blockTypes).toEqual([
      "decision_answers",
      "speech_script",
      "unknown_data_event",
    ]);
    const unknown = segments.find(
      (s) => s.type === "render_block" && s.blockType === "unknown_data_event",
    ) as { data: Record<string, unknown> };
    expect(unknown.data._dataType).toBe("survey_result");
  });

  it("user bubble body renders the decision questions and a speech script — never dropped, never an 'Attachment' chip", () => {
    const rec = record("user", [
      { type: "text", text: "Feedback item", metadata: {}, citations: [] },
      DECISION_QUESTIONS,
      SPEECH_SCRIPT,
      FUTURE_KIND,
    ]);
    const blocks = persistedBodyBlocks(rec, { isSelfRendered: isText });
    expect(blocks.map((b) => b.type)).toEqual([
      "decision_questions",
      "speech_script",
      "unknown_data_event",
    ]);
    // None of them becomes an attachment chip.
    const parts = parsePersistedMessageContent(rec.content).flatMap((e) =>
      e.kind === "message_part" ? [e.part] : [],
    );
    for (const part of parts) {
      expect(normalizeMessagePart(part, 0, "c1")).toEqual([]);
    }
  });

  it("an unknown kind is surfaced loudly, while a malformed KNOWN kind still throws", () => {
    const entries = parsePersistedMessageContent([FUTURE_KIND]);
    expect(entries[0]?.kind).toBe("unknown_part");
    expect(errorSpy).toHaveBeenCalled();
    expect(() =>
      parsePersistedMessageContent([{ type: "decision_answers", answers: "not-an-object" }]),
    ).toThrow();
  });
});

describe("reference roles survive a reload", () => {
  const subject: ImageMediaPart = {
    type: "media",
    kind: "image",
    file_id: "11111111-1111-4111-8111-111111111111",
    mime_type: "image/png",
    role: "subject",
    metadata: { file_name: "sneaker.png" },
  } as ImageMediaPart;

  it("the attachment chip names the role", () => {
    const [item] = normalizeMessagePart(subject, 0, "c1");
    expect(item?.title).toMatch(/^Subject reference · /);
  });

  it("an inline image block carries role and name", () => {
    const block = fromCxMediaPart({ ...subject, role: "style", name: "brand" } as ImageMediaPart);
    expect(block.referenceRole).toBe("style");
    expect(block.referenceName).toBe("brand");
  });

  it("a named video reference keeps role and @name", () => {
    const video = {
      type: "media",
      kind: "video",
      file_id: "22222222-2222-4222-8222-222222222222",
      role: "extend",
      name: "intro",
      metadata: {},
    } as unknown as VideoMediaPart;
    const data = fromCxVideoPart(video);
    expect(data.reference_role).toBe("extend");
    expect(data.reference_name).toBe("intro");
    const [item] = normalizeMessagePart(video, 0, "c1");
    expect(item?.title).toMatch(/^Video to extend · @intro · /);
  });
});
