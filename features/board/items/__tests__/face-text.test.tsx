/** @jest-environment jsdom */
// Far-zoom cards of Chat, Write-up and Note: the words when there are some, a short line when there are none (never a blank box).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MessagesSquare } from "lucide-react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { FaceLine, faceCopy, plainExcerpt } from "../face-text";

function render(kind: "chat" | "write-up" | "note", raw: string | null, hasRecord: boolean): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  const { text, muted } = faceCopy(kind, raw, hasRecord);
  act(() => root.render(<FaceLine icon={MessagesSquare} text={text} muted={muted} />));
  return host.textContent ?? "";
}

describe("far-zoom faces of text tiles", () => {
  it("empty: each says what it waits for in one short line", () => {
    expect(render("chat", "", false)).toBe("Ask about what is on this board");
    expect(render("chat", "", true)).toBe("Open to read this chat");
    expect(render("write-up", null, true)).toBe("Nothing written yet");
    expect(render("note", "  \n ", false)).toBe("Nothing written yet");
    for (const kind of ["chat", "write-up", "note"] as const) expect(faceCopy(kind, "", false).text.length).toBeLessThanOrEqual(60);
  });
  it("filled: the words themselves, markdown stripped", () => {
    expect(render("chat", "Why did the **hook** work?", true)).toBe("Why did the hook work?");
    expect(render("write-up", "# How to use\n\n1. Paste the link", true)).toBe("How to use 1. Paste the link".replace("1. ", ""));
    expect(render("note", "Hook: first three seconds", true)).toBe("Hook: first three seconds");
    expect(faceCopy("note", "Hook", true).muted).toBe(false);
  });
  it("long text is cut to a short excerpt", () => {
    expect(plainExcerpt("word ".repeat(100)).length).toBeLessThanOrEqual(161);
  });
});
