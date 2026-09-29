/**
 * The Draft agenda / Prepare refusal a person reads.
 *
 * Production, 2026-09-29: "Draft agenda" with nobody assigned showed
 * "Nobody is assigned to write agenda drafts yet. — MeetError: Nobody is
 * assigned…" — aidream's error envelope appends the exception class to
 * `message` for every 5xx (that field is for developers) and carries the
 * person's sentence in `user_message`. This body is the real 503, verbatim.
 */

jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn() }));
jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/features/agents/redux/execution-system/thunks/adopt-foreign-stream", () => ({
  adoptForeignStream: jest.fn(),
}));
jest.mock("@/features/agents/redux/execution-system/active-requests/active-requests.selectors", () => ({
  selectAnswerText: jest.fn(),
}));
jest.mock("@/features/overlays/openers/liveRunWindow", () => ({
  useFloatingLiveRun: jest.fn(),
}));

import { refusalSentence } from "./useMeetPrepStream";

const productionBody = {
  remedy:
    "The job meet.agenda_draft has no agent or workflow assigned for this organization. An administrator assigns one in Administration → Mandates; nothing else changes.",
  error: "meet_error",
  message:
    "Nobody is assigned to write agenda drafts yet. — MeetError: Nobody is assigned to write agenda drafts yet.",
  user_message: "Nobody is assigned to write agenda drafts yet.",
  details: { cause: "MeetError: Nobody is assigned to write agenda drafts yet." },
  request_id: "1332c02c6be24fc4906a6c6538d1ee91",
};

describe("refusalSentence", () => {
  it("reads the person's sentence, never the exception class the server appends for developers", () => {
    const shown = refusalSentence({ status: 503, message: "x", serverDetail: productionBody });
    expect(shown).toBe(`${productionBody.user_message} ${productionBody.remedy}`);
    expect(shown).not.toContain("MeetError");
  });

  it("still reads a body that only has `message` (4xx refusals)", () => {
    expect(
      refusalSentence({ status: 403, serverDetail: { message: "Only the host can do that.", remedy: "Ask the host." } }),
    ).toBe("Only the host can do that. Ask the host.");
  });
});
