/**
 * A NOTE OFFERS THE SAME AI ROWS IN EVERY VIEW (page-pass /notes, 2026-09-28 —
 * the blind judge: Clean up and "Help with this…" only in Read).
 *
 * Breaks: an editor menu over a saveable record gets no review callback →
 * "editor" red; a raw / read-only / adapter-without-edit source gets one (an
 * Apply that can't save) → "unsaveable" red; a host's own callback is replaced
 * → "host wins" red.
 */
import { editorTextAgentCallbacks } from "../utils/editor-text-agent";

const request = jest.fn();
const note = { type: "note", noteId: "n1" } as never;
const canEdit = { edit: async () => ({}) } as never;

describe("editor menus and the record's AI rows", () => {
  it("editor: a saveable record gets the review callback", () => {
    expect(editorTextAgentCallbacks(undefined, note, canEdit, request)?.onRequestTextAgentAction).toBe(request);
  });

  it("unsaveable: raw, read-only or no edit adapter get none", () => {
    expect(editorTextAgentCallbacks(undefined, { type: "raw" } as never, canEdit, request)).toBeUndefined();
    expect(editorTextAgentCallbacks(undefined, { type: "note", noteId: "n1", readOnly: true } as never, canEdit, request)).toBeUndefined();
    expect(editorTextAgentCallbacks(undefined, note, {} as never, request)).toBeUndefined();
    expect(editorTextAgentCallbacks(undefined, note, canEdit, undefined)).toBeUndefined();
  });

  it("host wins: a host's own callback is kept", () => {
    const own = jest.fn();
    expect(editorTextAgentCallbacks({ onRequestTextAgentAction: own }, note, canEdit, request)?.onRequestTextAgentAction).toBe(own);
  });
});
