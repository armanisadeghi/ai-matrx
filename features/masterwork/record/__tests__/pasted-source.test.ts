/**
 * CENSUS DEFECT D5 GUARD — a paste is a source you can see again.
 *
 * Two things must stay true or the Rulebook's Sources list starts lying again:
 *
 * 1. The identity the client computes for a paste is BYTE-IDENTICAL to the one
 *    the server stamps on every rule it distils from that paste (aidream
 *    `services/distillation/source_identity.py::text_source_key`). The vector
 *    below was produced by running that exact Python function — if this test
 *    fails, the two implementations have drifted and the "N rules so far" line
 *    on a pasted source silently reads zero forever.
 *
 * 2. A paste lands as a real `note` attached to the Rulebook with the
 *    `distillation_source` role the Resources list reads. Remove either write
 *    and these tests fail.
 */
import { webcrypto } from "node:crypto";
import { TextEncoder as NodeTextEncoder } from "node:util";

// jsdom ships neither WebCrypto nor TextEncoder; a browser has both.
if (typeof globalThis.TextEncoder === "undefined") {
  Object.defineProperty(globalThis, "TextEncoder", {
    value: NodeTextEncoder,
    configurable: true,
  });
}

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

const createNote = jest.fn();
jest.mock("@/features/notes/service/notesService", () => ({
  createNote: (...args: unknown[]) => createNote(...args),
}));

const add = jest.fn();
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: (...args: unknown[]) => add(...args) },
}));

import {
  DISTILLATION_SOURCE_ROLE,
  pastedSourceTitle,
  recordPastedSource,
  textSourceKey,
} from "../pastedSource";

beforeEach(() => {
  createNote.mockReset();
  add.mockReset();
  createNote.mockResolvedValue({ id: "note-1" });
  add.mockResolvedValue({ ok: true, data: { id: "edge-1" } });
});

describe("the paste lane's source identity", () => {
  /**
   * python3 -c "import hashlib;n=' '.join(TEXT.split());
   *   print('text:'+hashlib.sha256(n.encode()).hexdigest()[:32])"
   */
  it("matches the server's text_source_key, character for character", async () => {
    const text = "These are my rules.\nAlways reply within one business day.";
    expect(await textSourceKey(text)).toBe(
      "text:10113490f17e0209b7134a81a2c175a3",
    );
  });

  it("collapses whitespace, so a re-paste with different wrapping is the same source", async () => {
    const a = "These are my rules.\nAlways reply within one business day.";
    const b =
      "  These are my rules.   Always   reply within one business day.  ";
    expect(await textSourceKey(b)).toBe(await textSourceKey(a));
  });
});

describe("what the source is called", () => {
  it("uses the Expert's own note when they wrote one", () => {
    expect(pastedSourceTitle("Chapter one\nrest", "My HR handbook")).toBe(
      "My HR handbook",
    );
  });

  it("falls back to the first real line of what they pasted", () => {
    expect(pastedSourceTitle("\n\n  How we answer refunds  \nmore text")).toBe(
      "How we answer refunds",
    );
  });
});

describe("recordPastedSource", () => {
  const text =
    "How we answer refunds\nAlways acknowledge the delay before anything else.";

  it("keeps the pasted text as a note and attaches it to the Rulebook", async () => {
    const result = await recordPastedSource({
      rulebookId: "rb-1",
      orgId: "org-1",
      text,
      sourceNote: "",
      approach: "source",
    });

    // the text itself is kept, verbatim — this is what "reopen it" means
    expect(createNote).toHaveBeenCalledTimes(1);
    const noteInput = createNote.mock.calls[0][0];
    expect(noteInput.content).toBe(text);
    expect(noteInput.label).toBe("How we answer refunds");
    expect(noteInput.organization_id).toBe("org-1");

    // and it is LISTED — the role the Resources panel filters on
    expect(add).toHaveBeenCalledTimes(1);
    const edge = add.mock.calls[0][0];
    expect(edge).toMatchObject({
      sourceType: "note",
      sourceId: "note-1",
      targetType: "rulebook",
      targetId: "rb-1",
      role: DISTILLATION_SOURCE_ROLE,
    });
    expect(edge.metadata.pasted).toBe(true);
    expect(edge.metadata.approach).toBe("source");
    expect(edge.metadata.words).toBe(11);
    expect(edge.metadata.source_key).toBe(await textSourceKey(text));
    expect(result?.sourceKey).toBe(await textSourceKey(text));
  });

  it("screams but never throws when the edge cannot be written", async () => {
    const scream = jest.spyOn(console, "error").mockImplementation(() => {});
    add.mockResolvedValue({ ok: false, error: "denied" });

    await expect(
      recordPastedSource({
        rulebookId: "rb-1",
        orgId: "org-1",
        text,
        approach: "exemplar",
      }),
    ).resolves.toBeNull();
    expect(scream).toHaveBeenCalled();
    scream.mockRestore();
  });

  it("writes nothing for an empty paste", async () => {
    await recordPastedSource({
      rulebookId: "rb-1",
      orgId: "org-1",
      text: "   ",
      approach: "source",
    });
    expect(createNote).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });
});
