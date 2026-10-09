import { guidedResultHref, guidedView } from "../guidedJob";
import { parseGuidedStart } from "../guidedApi";

const base = {
  metadata: {} as Record<string, unknown>,
  captured_processed_document_id: null as string | null,
  failure_note: null as string | null,
};

describe("guidedView — the row in the person's words", () => {
  it("maps each status to its label and terminal-ness", () => {
    const cases: [string, string, boolean][] = [
      ["waiting", "Queued", false],
      ["needs_drive", "Waiting for you", false],
      ["claimed", "Capturing", false],
      ["capturing", "Capturing", false],
      ["dismissed", "Skipped", true],
    ];
    for (const [status, label, terminal] of cases) {
      const v = guidedView({ ...base, status } as never);
      expect(v.label).toBe(label);
      expect(v.terminal).toBe(terminal);
    }
  });

  it("captured reads as Done, or Saved-not-read when the extraction needs an agent", () => {
    const done = guidedView({
      ...base,
      status: "captured",
      captured_processed_document_id: "doc-1",
      metadata: { social: { extract: { status: "parsed" } } },
    } as never);
    expect(done).toMatchObject({ phase: "done", label: "Done", terminal: true, sourceId: "doc-1" });
    const partial = guidedView({
      ...base,
      status: "captured",
      metadata: { social: { extract: { status: "partial" } } },
    } as never);
    expect(partial.phase).toBe("done");
    const unread = guidedView({
      ...base,
      status: "captured",
      metadata: { social: { extract: { status: "needs_agent" } } },
    } as never);
    expect(unread).toMatchObject({ phase: "saved_unread", label: "Saved, not read yet" });
  });

  it("failed carries the sentence, with a fallback that never goes blank", () => {
    expect(
      guidedView({ ...base, status: "failed", failure_note: "Login expired." } as never).failure,
    ).toBe("Login expired.");
    expect(guidedView({ ...base, status: "failed" } as never).failure).toMatch(/try again/i);
  });

  it("links a finished capture to its saved page", () => {
    expect(guidedResultHref("abc")).toBe("/knowledge/sources/abc");
  });
});

describe("parseGuidedStart", () => {
  it("refuses an answer without a readable job", () => {
    expect(() => parseGuidedStart({ intro: "x", steps: [] })).toThrow(/not in a shape/);
  });
});
