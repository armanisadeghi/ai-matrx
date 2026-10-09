// A built-in starter OWNS its notes: using it files each seeded note in the BOARD's organization and stores the
// new id on the tile, so a board never opens onto a missing / foreign-organization note.
import { BUILTIN_BOARD_TEMPLATES } from "../templates/builtin";
import { materializeStarterNotes, type StarterNoteServices } from "../templates/starter-notes";
import { noteLabelFromText, noteSeed } from "../items/work-sources";

const isNote = (n: { source: { kind: string; entity?: string } }) => n.source.kind === "entity" && n.source.entity === "note";

describe("a starter files its own notes", () => {
  it.each(BUILTIN_BOARD_TEMPLATES.map((t) => [t.key, t] as const))("%s: no note tile names a record before use, every one carries a seed named by its tile", (_k, t) => {
    for (const n of t.build().nodes.filter(isNote)) {
      expect((n.source as { id: unknown }).id).toBeNull();
      const seed = noteSeed(n.source) ?? "";
      expect(noteLabelFromText(seed)).toBe(n.title);
      expect(noteLabelFromText(seed)).not.toMatch(/:$/);
    }
  });

  it("files every seeded note in the board's organization and puts the new id on the tile", async () => {
    const calls: Array<{ label: string; organizationId: string }> = [];
    const services: StarterNoteServices = {
      createNote: async (i) => {
        calls.push({ label: i.label, organizationId: i.organizationId });
        return { id: `note-${calls.length}` };
      },
    };
    const doc = BUILTIN_BOARD_TEMPLATES.find((t) => t.key.endsWith("viral-breakdown"))!.build();
    const out = await materializeStarterNotes(doc, "org-board", services);
    const notes = out.nodes.filter(isNote);
    expect(notes).toHaveLength(1);
    expect((notes[0].source as { id: string }).id).toBe("note-1");
    expect(noteSeed(notes[0].source)).toBeNull();
    expect(calls).toEqual([{ label: "Why it worked", organizationId: "org-board" }]);
  });

  it("a note that cannot be filed now stays a seed (the tile files it on open, in the board's organization)", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const doc = BUILTIN_BOARD_TEMPLATES.find((t) => t.key.endsWith("viral-breakdown"))!.build();
    const out = await materializeStarterNotes(doc, "org", { createNote: async () => Promise.reject(new Error("down")) });
    expect(noteSeed(out.nodes.find(isNote)!.source)).toBeTruthy();
    spy.mockRestore();
  });

  it("with no organization nothing is filed", async () => {
    const createNote = jest.fn();
    const doc = BUILTIN_BOARD_TEMPLATES[0].build();
    expect(await materializeStarterNotes(doc, null, { createNote })).toBe(doc);
    expect(createNote).not.toHaveBeenCalled();
  });
});
