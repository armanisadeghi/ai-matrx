/**
 * Work items (chat / note / file): the source ↔ record transitions and the
 * file-drop failure reporting.
 */

const uploadMock = jest.fn();
const toastError = jest.fn();

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { upload: (...args: unknown[]) => uploadMock(...args) },
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), info: jest.fn() },
}));

import type { NodeSource } from "../board/document";
import { parseBoardDocument } from "../board/document";
import {
  chatAgentId,
  chatSource,
  entityId,
  fileIdOf,
  fileItem,
  isNoteDraft,
  noteDraftFromText,
  noteDraftSource,
  noteSeed,
  noteSeedEdit,
  noteSource,
  noteTilePlan,
} from "../items/work-sources";
import { BOARD_UPLOAD_FOLDER, filesToBoardItems } from "../items/file-drop";
import { UploadCancelledError } from "@/features/files/handler/errors";

describe("chat source", () => {
  it("a new chat is a null-id entity; a chosen agent rides in meta until the conversation exists", () => {
    expect(chatSource(null, null)).toEqual({ kind: "entity", entity: "chat", id: null });
    const withAgent = chatSource(null, "agent-1");
    expect(withAgent).toEqual({ kind: "entity", entity: "chat", id: null, meta: { agentId: "agent-1" } });
    expect(chatAgentId(withAgent)).toBe("agent-1");
  });

  it("after launch the source carries the conversation id and survives a save/parse round trip", () => {
    const launched = chatSource("conv-1", "agent-1");
    expect(entityId(launched)).toBe("conv-1");
    const { doc, problems } = parseBoardDocument({
      camera: { x: 0, y: 0, z: 1 },
      nodes: [{ id: "t1", rect: { x: 0, y: 0, w: 520, h: 760 }, title: "Chat", source: launched }],
      edges: [],
    });
    expect(problems).toEqual([]);
    expect(doc.nodes[0].source).toEqual(launched);
  });

  it("ignores an agent on any other kind of source", () => {
    expect(chatAgentId({ kind: "entity", entity: "note", id: null, meta: { agentId: "x" } })).toBeNull();
  });
});

describe("note source", () => {
  it("pasted text is a seed only while the note does not exist", () => {
    const draft = noteDraftFromText("Groceries\nmilk\neggs");
    expect(draft.title).toBe("Groceries");
    expect(noteSeed(draft.source)).toBe("Groceries\nmilk\neggs");
    const created = noteSource(draft.source, "note-1");
    expect(created).toEqual({ kind: "entity", entity: "note", id: "note-1" });
    expect(noteSeed(created)).toBeNull();
  });

  it("recording the id keeps other meta and drops only the seed", () => {
    const prev: NodeSource = { kind: "entity", entity: "note", id: null, meta: { seed: "hi", origin: "paste" } };
    expect(noteSource(prev, "n2")).toEqual({ kind: "entity", entity: "note", id: "n2", meta: { origin: "paste" } });
  });

  it("a blank seed is no seed", () => {
    expect(noteSeed({ kind: "entity", entity: "note", id: null, meta: { seed: "   " } })).toBeNull();
  });
});

describe("note tile lifecycle (the notes feature's own paths)", () => {
  const fresh: NodeSource = { kind: "entity", entity: "note", id: null };

  it("a new tile starts a draft the way /notes 'New note' does; the draft is reopened by id", () => {
    expect(noteTilePlan(fresh)).toEqual({ step: "start-draft" });
    const draft = noteDraftSource(fresh, "n1");
    expect(draft).toEqual({ kind: "entity", entity: "note", id: "n1", meta: { draft: "1" } });
    expect(isNoteDraft(draft)).toBe(true);
    expect(noteTilePlan(draft)).toEqual({ step: "draft", noteId: "n1" });
  });

  it("once the draft has a row the tile refers to a real note and opens it", () => {
    const saved = noteSource(noteDraftSource(fresh, "n1"), "n1");
    expect(saved).toEqual({ kind: "entity", entity: "note", id: "n1" });
    expect(isNoteDraft(saved)).toBe(false);
    expect(noteTilePlan(saved)).toEqual({ step: "open", noteId: "n1" });
  });

  it("text (a paste, an agent) is created with that content — before or instead of an untouched draft", () => {
    expect(noteTilePlan(noteDraftFromText("Plan\nstep one").source)).toEqual({
      step: "create-from-seed",
      seed: "Plan\nstep one",
    });
    const onDraft = noteSeedEdit(noteDraftSource(fresh, "n1"), "agent text");
    expect(onDraft).not.toBeNull();
    expect(noteTilePlan(onDraft as NodeSource)).toEqual({ step: "create-from-seed", seed: "agent text" });
  });

  it("an agent's text never replaces a real note from the board — it goes through the note's surface", () => {
    expect(noteSeedEdit({ kind: "entity", entity: "note", id: "n9" }, "overwrite")).toBeNull();
    expect(noteSeed({ kind: "entity", entity: "note", id: "n9", meta: { seed: "stale" } })).toBeNull();
  });

  it("is not a note plan for any other source", () => {
    expect(noteTilePlan({ kind: "entity", entity: "chat", id: null })).toBeNull();
    expect(noteSeedEdit({ kind: "label", text: "x" }, "y")).toBeNull();
  });
});

describe("file source", () => {
  it("reads both the entity form and the older file form", () => {
    expect(fileIdOf({ kind: "entity", entity: "file", id: "f1" })).toBe("f1");
    expect(fileIdOf({ kind: "file", fileId: "f2" })).toBe("f2");
    expect(fileIdOf({ kind: "entity", entity: "note", id: "n" })).toBeNull();
  });

  it("new file items are written in the entity form", () => {
    expect(fileItem("f3", "report.pdf")).toEqual({
      title: "report.pdf",
      source: { kind: "entity", entity: "file", id: "f3" },
    });
    expect(fileItem("f4", "  ").title).toBe("File");
  });
});

describe("filesToBoardItems", () => {
  const a = new File(["a"], "a.png", { type: "image/png" });
  const b = new File(["b"], "b.pdf", { type: "application/pdf" });

  beforeEach(() => {
    uploadMock.mockReset();
    toastError.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("uploads each file through the handler into the board folder and returns one item per file", async () => {
    uploadMock.mockImplementation(async (src: { file: File }) => ({ fileId: `id-${src.file.name}` }));
    const items = await filesToBoardItems([a, b]);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock).toHaveBeenCalledWith({ kind: "file", file: a }, { folderPath: BOARD_UPLOAD_FOLDER });
    expect(items).toEqual([fileItem("id-a.png", "a.png"), fileItem("id-b.pdf", "b.pdf")]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("a failed upload is announced by name with its reason and a remedy — never dropped silently", async () => {
    uploadMock.mockImplementation(async (src: { file: File }) => {
      if (src.file.name === "b.pdf") throw new Error("File too large");
      return { fileId: "id-a" };
    });
    const items = await filesToBoardItems([a, b]);
    expect(items).toEqual([fileItem("id-a", "a.png")]);
    expect(toastError).toHaveBeenCalledTimes(1);
    const message = String(toastError.mock.calls[0][0]);
    expect(message).toContain('"b.pdf"');
    expect(message).toContain("File too large");
    expect(message).toContain("Drop it again");
  });

  it("declining the workspace question is an answer, not a failure: nothing uploaded, no error toast", async () => {
    uploadMock.mockRejectedValue(new UploadCancelledError());
    const items = await filesToBoardItems([a]);
    expect(items).toEqual([]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("no files → no uploads", async () => {
    expect(await filesToBoardItems([])).toEqual([]);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
