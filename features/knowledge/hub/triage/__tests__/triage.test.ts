/**
 * Triage (KNOWLEDGE-HUB §4, H5): one key moves the item; the door is called
 * once per record (a Segment moves its Source); a refusal is said in the
 * server's own sentence; Undo puts each record back where it was; the key
 * map never steals the hub's Linear keys (j/k move, f filter).
 */
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: jest.fn() } }));

import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import {
  HUB_KEY_SHEET,
  nextFocusAfterRemoval,
  triageCommandForKey,
  triageItems,
  undoTriage,
} from "@/features/knowledge/hub/triage/triageActions";
import { refusalMessage, triageRowToHit } from "@/features/knowledge/hub/triage/triageApi";
import { hubStateFromParams, hubStateToParams, selectionQuery, DEFAULT_HUB_STATE } from "@/features/knowledge/hub/hubState";

const inboxSource: KnowledgeHit = { entity: "processed_document", id: "d1", title: "Solicitation", triage_state: "inbox", organization_id: "o1" };
const keptNote: KnowledgeHit = { entity: "note", id: "n1", title: "Budget", triage_state: "kept" };
const segment: KnowledgeHit = {
  entity: "segment",
  id: "g1",
  title: "Solicitation",
  segment: { source_id: "d1", source_title: "Solicitation" },
};

describe("triageItems", () => {
  it("moves each record once (a Segment moves its Source) and remembers where each came from", async () => {
    const door = jest.fn().mockResolvedValue(undefined);
    const out = await triageItems([inboxSource, segment, keptNote], "archived", door);
    expect(door).toHaveBeenCalledTimes(2);
    // The record's own organization rides along — never the active one.
    expect(door).toHaveBeenCalledWith("processed_document", "d1", "archived", "o1");
    expect(door).toHaveBeenCalledWith("note", "n1", "archived", null);
    expect(out.ok).toBe(2);
    expect(out.sentence).toBe("Archived 2 items.");
    expect(out.undo).toEqual([
      { target: expect.objectContaining({ id: "d1" }), prior: "inbox" },
      { target: expect.objectContaining({ id: "n1" }), prior: "kept" },
    ]);
  });

  it("names a single item and says the server's refusal in its own words", async () => {
    const door = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("You cannot open this record."));
    const out = await triageItems([inboxSource, keptNote], "kept", door);
    expect(out.ok).toBe(1);
    expect(out.sentence).toBe('Kept 1 item. "Budget" was not moved: You cannot open this record.');
    const one = await triageItems([inboxSource], "kept", jest.fn().mockResolvedValue(undefined));
    expect(one.sentence).toBe('Kept "Solicitation".');
  });

  it("Undo puts every record back to the state it came from", async () => {
    const door = jest.fn().mockResolvedValue(undefined);
    const out = await triageItems([inboxSource, keptNote], "archived", jest.fn().mockResolvedValue(undefined));
    const undone = await undoTriage(out.undo, door);
    expect(door).toHaveBeenCalledWith("processed_document", "d1", "inbox", "o1");
    expect(door).toHaveBeenCalledWith("note", "n1", "kept", null);
    expect(undone.sentence).toBe("Put back 2 items.");
  });
});

describe("the key map", () => {
  it("answers Reader's triage keys and never the hub's Linear keys", () => {
    expect(triageCommandForKey({ key: "s" })).toBe("keep");
    expect(triageCommandForKey({ key: "e" })).toBe("archive");
    expect(triageCommandForKey({ key: "i" })).toBe("inbox");
    expect(triageCommandForKey({ key: "m" })).toBe("file");
    expect(triageCommandForKey({ key: "t" })).toBe("tag");
    expect(triageCommandForKey({ key: "?" })).toBe("help");
    for (const k of ["j", "k", "f", "x", "a", "/", "Enter"]) expect(triageCommandForKey({ key: k })).toBeNull();
    expect(triageCommandForKey({ key: "e", metaKey: true })).toBeNull();
  });

  it("the ? sheet lists every triage key", () => {
    const listed = HUB_KEY_SHEET.flatMap((g) => g.keys.flatMap((k) => k.keys));
    for (const k of ["s", "e", "i", "m", "t", "j", "k", "f", "?"]) expect(listed).toContain(k);
  });

  it("after the focused item leaves, the next one takes the cursor", () => {
    expect(nextFocusAfterRemoval(["a", "b", "c"], new Set(["b"]), "b")).toBe("c");
    expect(nextFocusAfterRemoval(["a", "b", "c"], new Set(["c"]), "c")).toBe("b");
    expect(nextFocusAfterRemoval(["a"], new Set(["a"]), "a")).toBeNull();
  });
});

describe("triage reads", () => {
  it("an Inbox row becomes a hit carrying its state; a refusal keeps the server's sentence", () => {
    const hit = triageRowToHit({
      entity_token: "processed_document",
      entity_id: "d1",
      title: "  ",
      subtitle: "example.com",
      organization_id: "o1",
      source_kind: "web_page",
      origin_client: "extension",
      triage_state: "inbox",
      filed_at: "2026-09-27T00:00:00Z",
      next_cursor: null,
    });
    expect(hit).toMatchObject({ entity: "processed_document", title: "Untitled", triage_state: "inbox", origin: "extension" });
    expect(refusalMessage({ message: "Sign in to see your inbox." }, "Reading")).toBe("Sign in to see your inbox.");
    expect(refusalMessage(null, "Reading your Inbox")).toBe("Reading your Inbox failed and the server gave no reason.");
  });

  it("Kept and Archived are views in the URL, each filtering by its state", () => {
    for (const kind of ["kept", "archived"] as const) {
      const s = hubStateFromParams(hubStateToParams({ ...DEFAULT_HUB_STATE, view: { kind } }));
      expect(s.view).toEqual({ kind });
      expect(selectionQuery({ kind }).query.state).toEqual([kind]);
    }
  });
});
