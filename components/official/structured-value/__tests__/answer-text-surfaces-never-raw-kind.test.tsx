/**
 * kind-never-raw S4/S9/S10/S13: compact answer-text surfaces never print a
 * `__kind` region as JSON — AnswerTextPreview (code editor list, assist card
 * fallback), the scheduled-run summary, the voice transcript turn.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("motion/react", () => ({
  motion: { div: ({ children }: { children: React.ReactNode }) => <div>{children}</div> },
}));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));
jest.mock("@/features/scheduling/components/shared/OutputRefLink", () => ({ OutputRefLink: () => null }));
jest.mock("@/components/official/structured-value/AnswerValueView", () => ({
  AnswerValueView: () => <div data-testid="answer-value-view" />,
}));

import { AnswerTextPreview } from "../AnswerTextPreview";
import { VoiceTranscriptTurn } from "@/features/voice-agent/components/VoiceTranscriptTurn";
import { RunRow } from "@/features/scheduling/components/detail/RunRow";

const SET_JSON = JSON.stringify({
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
});

let root: Root | null = null;
function mount(el: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
});

describe("AnswerTextPreview", () => {
  it("complete kind → markdown; arriving kind → loader; kindless unchanged", () => {
    expect(mount(<AnswerTextPreview text={SET_JSON} />).textContent).not.toContain("__kind");
    act(() => root?.unmount());
    const arriving = mount(<AnswerTextPreview text={'Hi {"__kind": "quiz_set", "ti'} />);
    expect(arriving.textContent).not.toContain("__kind");
    expect(arriving.querySelector('[data-kind-loader="quiz_set"]')).not.toBeNull();
    act(() => root?.unmount());
    expect(mount(<AnswerTextPreview text="Plain words" />).textContent).toBe("Plain words");
  });
});

describe("VoiceTranscriptTurn", () => {
  it("an assistant turn never reads out kind JSON", () => {
    const turn = { id: "t", role: "assistant", status: "complete", text: SET_JSON, text_reveal_index: SET_JSON.length };
    expect(mount(<VoiceTranscriptTurn turn={turn as never} />).textContent).not.toContain("__kind");
  });
});

describe("RunRow", () => {
  const run = {
    id: "r1",
    status: "succeeded",
    created_at: "2026-09-30T10:00:00Z",
    due_at: "2026-09-30T10:00:00Z",
    started_at: null,
    finished_at: null,
    result_summary: SET_JSON,
    result_metadata: null,
  };
  it("a kind result summary reads as markdown, never JSON", () => {
    const host = mount(<RunRow run={run as never} />);
    expect(host.textContent).not.toContain("__kind");
    expect(host.textContent).toContain("Cell biology");
  });
  it("a kindless summary is unchanged", () => {
    const host = mount(<RunRow run={{ ...run, result_summary: "Sent 3 emails" } as never} />);
    expect(host.textContent).toContain("Sent 3 emails");
  });
});
