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
    expect(mount(<AnswerTextPreview text={SET_JSON} streaming={false} />).textContent).not.toContain("__kind");
    act(() => root?.unmount());
    const arriving = mount(<AnswerTextPreview text={'Hi {"__kind": "quiz_set", "ti'} streaming />);
    expect(arriving.textContent).not.toContain("__kind");
    expect(arriving.querySelector('[data-kind-loader="quiz_set"]')).not.toBeNull();
    act(() => root?.unmount());
    expect(mount(<AnswerTextPreview text="Plain words" streaming={false} />).textContent).toBe("Plain words");
  });

  it("once the stream is over, an unfinished kind is a one-line broken state, not a loader", () => {
    const host = mount(<AnswerTextPreview text={'Hi {"__kind": "quiz_set", "ti'} streaming={false} />);
    expect(host.querySelector("[data-kind-loader]")).toBeNull();
    const broken = host.querySelector('[data-kind-broken="quiz_set"]');
    expect(broken?.textContent).toBe("Quiz set did not finish");
    expect(broken!.textContent!.length).toBeLessThanOrEqual(60);
  });
});

describe("VoiceTranscriptTurn", () => {
  it("an assistant turn never reads out kind JSON", () => {
    const turn = { id: "t", role: "assistant", status: "complete", text: SET_JSON, text_reveal_index: SET_JSON.length };
    expect(mount(<VoiceTranscriptTurn turn={turn as never} />).textContent).not.toContain("__kind");
  });
  it("a finished turn whose kind never completed reads its broken line", () => {
    const text = 'Here {"__kind": "quiz_set", "ti';
    const turn = { id: "t", role: "assistant", status: "complete", text, text_reveal_index: text.length };
    expect(mount(<VoiceTranscriptTurn turn={turn as never} />).textContent).toContain("Quiz set did not finish");
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
  it("a summary whose kind never finished says so, never loads forever", () => {
    const host = mount(<RunRow run={{ ...run, result_summary: 'Done {"__kind": "quiz_set", "ti' } as never} />);
    expect(host.textContent).not.toContain("__kind");
    expect(host.textContent).toContain("Quiz set did not finish");
  });
  it("a kindless summary is unchanged", () => {
    const host = mount(<RunRow run={{ ...run, result_summary: "Sent 3 emails" } as never} />);
    expect(host.textContent).toContain("Sent 3 emails");
  });
});
