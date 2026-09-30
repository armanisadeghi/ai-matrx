import {
  MAX_KEPT_TEXT_KNOB,
  RELOADED_RESUMING,
  RELOADED_WHILE_ADDING,
  reloadedCard,
  resumableInput,
} from "./interrupted";
import type { SourceDraft } from "./types";

/**
 * Never lose input: a Source still landing when the page reloads is picked up
 * again from what the draft kept — or, for a file whose bytes lived only in
 * the tab, says so and keeps the file's name. Before USI-3b every one of these
 * came back as "Add it again" with the input gone.
 */
const draft = (patch: Partial<SourceDraft>): SourceDraft => ({
  kind: "paste",
  label: "Pasted text",
  ref: null,
  ...patch,
});

describe("a Source cut off by a reload", () => {
  it("re-lands pasted text from the kept text", () => {
    const d = draft({ input: { text: "Photosynthesis turns light into sugar.", name: "Notes" } });
    expect(reloadedCard(d, "resolving")).toEqual({ action: "resume", sentence: RELOADED_RESUMING });
    expect(resumableInput(d)?.text).toBe("Photosynthesis turns light into sugar.");
  });

  it("re-lands a web page and a YouTube video from the kept link", () => {
    for (const kind of ["web", "youtube"] as const) {
      const d = draft({ kind, label: "example.com", input: { url: "https://example.com/a" } });
      expect(reloadedCard(d, "pending")?.action).toBe("resume");
    }
  });

  it("re-transcribes a recording that finished uploading, from its stored file", () => {
    const d = draft({ kind: "audio", label: "lecture.m4a", input: { fileId: "f-1" } });
    expect(reloadedCard(d, "resolving")?.action).toBe("resume");
  });

  it("says honestly a file mid-upload did not arrive, keeping its name", () => {
    for (const kind of ["upload", "image", "audio"] as const) {
      const card = reloadedCard(draft({ kind, label: "chapter-3.pdf" }), "resolving");
      expect(card?.action).toBe("reoffer");
      expect(card?.sentence).toContain("chapter-3.pdf");
      expect(card?.sentence).toContain("did not arrive");
    }
  });

  it("falls back to the plain remedy when nothing was kept (text too large to keep)", () => {
    expect(reloadedCard(draft({ input: undefined }), "resolving")).toEqual({
      action: "lost",
      sentence: RELOADED_WHILE_ADDING,
    });
    expect(MAX_KEPT_TEXT_KNOB).toEqual({ feature: "sources", key: "max_kept_draft_chars" });
  });

  it("leaves finished and failed cards exactly as they were", () => {
    const d = draft({ input: { text: "x" } });
    expect(reloadedCard(d, "ready")).toBeNull();
    expect(reloadedCard(d, "error")).toBeNull();
  });

  it("never treats an empty kept input as resumable", () => {
    expect(resumableInput(draft({ input: { text: "   " } }))).toBeNull();
    expect(resumableInput(draft({ kind: "web", input: { url: "" } }))).toBeNull();
    expect(resumableInput(draft({ kind: "notes", input: { text: "x" } }))).toBeNull();
  });
});
