/**
 * unregistered-format-announces-itself (CPM-009b, slice P20).
 *
 * A message widget or tool-call card the host never registered is never blank and never silent:
 * it draws one labelled line naming the widget (`data-chat-slot-fallback`) and reports itself
 * ONCE to the host diagnostics port. A registered widget draws as itself, with no marker.
 */
import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  MessageFilesStrip,
  RulebookNudge,
  SpeakerButton,
  GmailReviewCard,
  RecordChangeApprovalCard,
  ShareButton,
  registerChatUi,
  resetChatUiForTests,
} from "../ui-slots";
import { _resetAnnouncements } from "../errors";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function draw(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

describe("an unregistered widget announces itself", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetChatUiForTests();
    _resetAnnouncements();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each([
    ["MessageFilesStrip", MessageFilesStrip],
    ["RulebookNudge", RulebookNudge],
    ["SpeakerButton", SpeakerButton],
    ["GmailReviewCard", GmailReviewCard],
    ["RecordChangeApprovalCard", RecordChangeApprovalCard],
    ["ShareButton", ShareButton],
  ] as const)("%s draws a labelled line, never a blank", (name, Widget) => {
    const el = draw(<Widget />);
    const marker = el.querySelector("[data-chat-slot-fallback]");
    expect(marker?.getAttribute("data-chat-slot-fallback")).toBe(name);
    expect(el.textContent).toContain(name);
  });

  it("reports once per widget, to diagnostics", () => {
    draw(<SpeakerButton />);
    draw(<SpeakerButton />);
    const lines = warn.mock.calls.filter((c) => String(c[0]).includes('The host registered no "SpeakerButton"') && !String(c[0]).includes("before the chat host"));
    expect(lines).toHaveLength(1);
  });

  it("a registered widget draws as itself, with no marker", () => {
    registerChatUi({ SpeakerButton: () => <button>speak</button> });
    const el = draw(<SpeakerButton />);
    expect(el.textContent).toBe("speak");
    expect(el.querySelector("[data-chat-slot-fallback]")).toBeNull();
  });
});
