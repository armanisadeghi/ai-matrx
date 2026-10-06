/**
 * THE ONE WRITE DOOR, as the app binds it (Matrx Alchemy ALC-17).
 *
 * Real: the door (`@ai-matrx/alchemy/operate`), the app's manifest registry
 * (`matrx-user/notes` as `notes-editor.manifest.ts` declares it), the surface
 * writeback seam and its approval flow. Replaced: only what the handlers CALL —
 * the notes service (network) and the toast/diagnostics sinks.
 */

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: mockToastError, success: mockToastSuccess, info: jest.fn(), warning: jest.fn() },
}));

const mockCreateNote = jest.fn();
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { create: (input: unknown) => mockCreateNote(input) },
}));

import { applySurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { registerSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import type { RootState } from "@/lib/redux/rootReducer";

const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const USER = "8f14e45f-ceea-467a-9575-2d3b1c2f7a10";
const state = () =>
  ({ userAuth: { id: USER, isAdmin: false }, appContext: { organization_id: ORG } }) as unknown as RootState;

function mountNotesPage(noteTitle: jest.Mock) {
  return registerSurfaceRuntime(
    {
      surfaceName: "matrx-user/notes",
      getScope: () => ({ current_note_title: "Old title" }),
      getWriteHandlers: () => ({ note_title: noteTitle }),
    },
    1,
  );
}

beforeEach(() => {
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockCreateNote.mockReset();
});

describe("a page write goes through the door and returns a receipt", () => {
  it("a person's write is applied by the page's handler, with an applied receipt", async () => {
    const noteTitle = jest.fn();
    const unregister = mountNotesPage(noteTitle);
    try {
      const result = await applySurfaceWrite("note_title", "Quarterly plan", { surfaceName: "matrx-user/notes" });
      expect(noteTitle).toHaveBeenCalledWith("Quarterly plan");
      expect(result).toMatchObject({
        ok: true,
        receipt: { status: "applied", to: { surfaceName: "matrx-user/notes", target: "note_title" } },
      });
    } finally {
      unregister();
    }
  });

  it("an agent's write to an `ask` target is approved through the existing approval card, once", async () => {
    const noteTitle = jest.fn();
    const requestApproval = jest.fn(async () => ({ kind: "approved" as const }));
    const unregister = mountNotesPage(noteTitle);
    try {
      const result = await applySurfaceWrite("note_title", "Agent title", {
        surfaceName: "matrx-user/notes",
        origin: "agent",
        actorLabel: "Note helper",
        requestApproval,
      });
      expect(requestApproval).toHaveBeenCalledTimes(1);
      expect(requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({ surfaceName: "matrx-user/notes", value: "Agent title", actorLabel: "Note helper" }),
      );
      expect(noteTitle).toHaveBeenCalledWith("Agent title");
      expect(result).toMatchObject({ ok: true, receipt: { status: "applied" } });
    } finally {
      unregister();
    }
  });

  it("a declined agent write never reaches the page, and the receipt says it was not approved", async () => {
    const noteTitle = jest.fn();
    const requestApproval = jest.fn(async () => ({ kind: "declined" as const }));
    const unregister = mountNotesPage(noteTitle);
    try {
      const result = await applySurfaceWrite("note_title", "Unwanted", {
        surfaceName: "matrx-user/notes",
        origin: "agent",
        requestApproval,
      });
      expect(noteTitle).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false, declined: true, receipt: { status: "refused", reason: "declined" } });
    } finally {
      unregister();
    }
  });
});

describe("destinations are headless handlers on declared write targets", () => {
  it("Save to Notes with no Notes page open creates the note through `create_notes` and returns its link", async () => {
    mockCreateNote.mockResolvedValue({ id: "note-7", label: "Prepared content" });
    const { registerHeadlessDestinations, saveNotesThroughDoor } = await import("./alchemy-door");
    registerHeadlessDestinations(state);

    const { receipt, created } = await saveNotesThroughDoor([
      { title: "Prepared content", content: "First line\n\nSecond line", folder: "Alchemy" },
    ]);

    expect(receipt).toMatchObject({
      status: "applied",
      to: { surfaceName: "matrx-user/notes", target: "create_notes" },
      sentence: 'Saved to note "Prepared content".',
    });
    expect(mockCreateNote).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Prepared content", content: "First line\n\nSecond line", folder_name: "Alchemy", organization_id: ORG }),
    );
    expect(created).toEqual([{ kind: "note", id: "note-7", label: "Prepared content", href: "/notes/note-7" }]);
  });

  it("Save to Notes with no handler registered is refused `unapplicable`, with the sentence and remedy", async () => {
    let result: Awaited<ReturnType<typeof import("./alchemy-door")["saveNotesThroughDoor"]>> | undefined;
    await jest.isolateModulesAsync(async () => {
      const door = await import("./alchemy-door");
      result = await door.saveNotesThroughDoor([{ title: "Nowhere to go" }]);
    });
    expect(mockCreateNote).not.toHaveBeenCalled();
    expect(result?.receipt).toMatchObject({
      status: "refused",
      reason: "unapplicable",
      sentence: expect.stringMatching(/can only be saved with matrx-user\/notes open/),
      remedy: "Open matrx-user/notes to apply it.",
    });
  });
});
