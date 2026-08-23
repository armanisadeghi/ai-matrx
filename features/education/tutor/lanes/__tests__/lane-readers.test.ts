/**
 * The tutor lanes' pure readers — `readHelp` (the `live_help_answer` kind the
 * rebuilt `flashcards.help_live` agent emits) and `readTip` (the `study_tip`
 * kind from `flashcards.micro_coach`). Fixtures are the kinds' canonical
 * samples: `__kind` at every level, which the readers must ignore. Also pins
 * `liveHelpAnswerValue`, the round-trip back to the kind value every surface
 * renders through the ONE kind component.
 */

jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({ runHeadlessAgentJson: jest.fn(), livePosture: () => ({}) }),
);
jest.mock("@/features/education/study/service/studyService", () => ({
  studyService: { appendSessionArtifact: jest.fn() },
}));

import { liveHelpAnswerValue, readHelp } from "../helpLive";
import { readTip } from "../microCoach";

const LIVE_HELP = {
  __kind: "live_help_answer",
  answer:
    "Think about which stage actually needs photons hitting chlorophyll. So where does the oxygen come from?",
  hint_level: "partial",
  followups: [
    "What do the light-dependent reactions hand off to the Calvin cycle?",
    "Why does the Calvin cycle not need light directly?",
  ],
  trust: {
    __kind: "trust_envelope",
    confidence: "grounded",
    groundedIn: "Chapter 8, section 8.2 — the light-dependent reactions",
    citations: [
      {
        __kind: "citation",
        sourceId: "chunk_8f2a",
        sourceKind: "chunk",
        locator: "p. 214",
        excerpt: "Water molecules are split (photolysis), releasing oxygen as a byproduct.",
        title: "Biology — Chapter 8",
      },
    ],
  },
};

describe("readHelp (live_help_answer)", () => {
  it("reads the live kind payload", () => {
    const help = readHelp(LIVE_HELP);
    expect(help).not.toBeNull();
    expect(help?.answer).toBe(LIVE_HELP.answer);
    expect(help?.hintLevel).toBe("partial");
    expect(help?.followups).toEqual(LIVE_HELP.followups);
    expect(help?.trust?.confidence).toBe("grounded");
    expect(help?.trust?.citations[0]).toMatchObject({
      sourceId: "chunk_8f2a",
      sourceKind: "chunk",
      locator: "p. 214",
      title: "Biology — Chapter 8",
    });
  });

  it("keeps the honest refusal (not_in_material) and floors a bad hint level", () => {
    const refusal = readHelp({
      __kind: "live_help_answer",
      answer: "That isn't covered in your material.",
      hint_level: "shout",
      followups: [],
      trust: { __kind: "trust_envelope", confidence: "not_in_material", citations: [] },
    });
    expect(refusal?.hintLevel).toBe("partial");
    expect(refusal?.trust?.confidence).toBe("not_in_material");
  });

  it("null without an answer; null trust when the agent sent none", () => {
    expect(readHelp({ hint_level: "nudge" })).toBeNull();
    expect(readHelp(null)).toBeNull();
    expect(readHelp({ answer: "Just a hint." })?.trust).toBeNull();
  });

  it("liveHelpAnswerValue rebuilds the kind value the component renders", () => {
    const value = liveHelpAnswerValue(readHelp(LIVE_HELP)!);
    expect(value.__kind).toBe("live_help_answer");
    expect(value.hint_level).toBe("partial");
    expect(value.followups).toEqual(LIVE_HELP.followups);
    const trust = value.trust as Record<string, unknown>;
    expect(trust.__kind).toBe("trust_envelope");
    expect(trust.confidence).toBe("grounded");
    expect((trust.citations as Record<string, unknown>[])[0]).toMatchObject({
      __kind: "citation",
      sourceId: "chunk_8f2a",
    });
  });
});

describe("readTip (study_tip)", () => {
  it("reads the live kind payload and ignores __kind", () => {
    expect(
      readTip({
        __kind: "study_tip",
        tip: "Picture the thylakoid as a solar panel and the stroma as the kitchen it powers.",
      }),
    ).toBe("Picture the thylakoid as a solar panel and the stroma as the kitchen it powers.");
  });

  it("null on no signal", () => {
    expect(readTip({ __kind: "study_tip", tip: "   " })).toBeNull();
    expect(readTip({})).toBeNull();
    expect(readTip("tip")).toBeNull();
  });
});
