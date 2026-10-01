/**
 * A hover preview of a `__kind` answer reads as the kind's markdown, never
 * its stored JSON (kind-never-raw R1/R3). Kindless text is shown unchanged.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let fakeState: unknown = {};
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(fakeState),
}));
jest.mock("@/features/agents/redux/execution-system/conversations/conversations.selectors", () => ({
  selectInstance: () => () => null,
}));

import { MessagePreviewContent } from "../MessageHoverPreview";

const SET = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ __kind: "flashcard", front: "Powerhouse?", back: "Mitochondria" }],
};

function stateWith(text: string) {
  return {
    messages: {
      byConversationId: {
        c1: {
          orderedIds: ["m1"],
          byId: {
            m1: { id: "m1", role: "assistant", content: [{ type: "text", text }] },
          },
        },
      },
    },
  };
}

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

describe("MessagePreviewContent", () => {
  it("previews a kind answer as readable markdown, no __kind text", () => {
    fakeState = stateWith(JSON.stringify(SET));
    const host = mount(<MessagePreviewContent conversationId="c1" messageId="m1" />);
    expect(host.textContent).not.toContain("__kind");
    expect(host.textContent).toContain("Cell biology");
  });

  it("previews kindless text unchanged", () => {
    fakeState = stateWith('Plain answer {"a":1}');
    const host = mount(<MessagePreviewContent conversationId="c1" messageId="m1" />);
    expect(host.textContent).toContain('Plain answer {"a":1}');
  });
});
