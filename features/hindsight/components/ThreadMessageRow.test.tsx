/**
 * The reviewer's first turn is the review BUNDLE, not a chat message.
 *
 * Measured 2026-08-22: a 101,520-character message rendered through the
 * markdown pipeline froze the browser tab outright — the review could not be
 * opened at all. The server now caps each message
 * (`discuss.py::THREAD_MESSAGE_MAX_CHARS`), and a cap that does not announce
 * itself is worse than the freeze: it silently misrepresents what the reviewer
 * was given, which is the one thing this panel exists to show.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { ThreadMessageRow } from "./ThreadMessageRow";
import type { ThreadMessage } from "../types";

const base: ThreadMessage = {
  id: "m1",
  role: "user",
  position: 0,
  created_at: "2026-08-20T05:45:39Z",
  text: "",
};

describe("ThreadMessageRow truncation notice", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("states BOTH the shown and the true length when capped", () => {
    const message = {
      ...base,
      text: "x".repeat(6000),
      truncated: true,
      full_chars: 101520,
    };
    act(() => root.render(<ThreadMessageRow message={message} />));
    const text = container.textContent ?? "";
    expect(text).toContain("6,000");
    expect(text).toContain("101,520");
    // It must say WHAT this turn is, or a reader assumes the reviewer was
    // handed a truncated bundle rather than a truncated VIEW of one.
    expect(text).toContain("evidence, not a chat message");
  });

  it("says nothing at all when the message is whole", () => {
    const message = {
      ...base,
      role: "assistant",
      text: "The hosts are voice-interchangeable.",
      truncated: false,
      full_chars: 36,
    };
    act(() => root.render(<ThreadMessageRow message={message} />));
    const text = container.textContent ?? "";
    expect(text).toContain("The hosts are voice-interchangeable.");
    expect(text).not.toContain("Showing the first");
  });

  it("shows the notice in the chat variant too", () => {
    const message = {
      ...base,
      text: "y".repeat(6000),
      truncated: true,
      full_chars: 42397,
    };
    act(() => root.render(<ThreadMessageRow message={message} variant="chat" />));
    expect(container.textContent ?? "").toContain("42,397");
  });

  it("survives a message the server never stamped (older rows)", () => {
    act(() => root.render(<ThreadMessageRow message={base} />));
    expect(container.textContent ?? "").not.toContain("Showing the first");
  });
});
