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
const mockToastWarning = jest.fn();
jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: mockToastError, success: mockToastSuccess, info: jest.fn(), warning: mockToastWarning },
}));

const mockCreateNote = jest.fn();
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { create: (input: unknown) => mockCreateNote(input) },
}));

/**
 * The kind catalog's verdict, with its timing in the test's hands. A check
 * made by the DOOR (its stack runs through the operate engine) is held until
 * the test releases it, so two writes can reach their approval in either order.
 */
type Verdict = { kind: string; checked: boolean; ok: boolean; errors: string[] };
const heldDoorChecks: Array<{ release: () => void }> = [];
let holdDoorChecks = false;
const mockKindVerdict = jest.fn((value: unknown, kind: string): Verdict => {
  const ok = Boolean(value && typeof value === "object" && "mode" in (value as object));
  return { kind, checked: true, ok, errors: ok ? [] : ["mode is required"] };
});
jest.mock("@ai-matrx/chat/host/content-ir-slots", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/content-ir-slots"),
  contentIrKindValidator: () => ({
    validate: (value: unknown, kind: string) => {
      const verdict = mockKindVerdict(value, kind);
      const byDoor = /alchemy[\\/]dist[\\/]operate/.test(new Error().stack ?? "");
      if (!holdDoorChecks || !byDoor) return Promise.resolve(verdict);
      return new Promise<Verdict>((resolve) => heldDoorChecks.push({ release: () => resolve(verdict) }));
    },
    cachedSchema: async () => null,
    invalidate: () => undefined,
  }),
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

const RULEBOOK = "matrx-user/masterwork-rulebook";

function mountRulebookPage(ruleDraft: jest.Mock) {
  return registerSurfaceRuntime(
    {
      surfaceName: RULEBOOK,
      getScope: () => ({ active_rule_draft: null }),
      getWriteHandlers: () => ({ rule_draft: ruleDraft }),
    },
    1,
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  holdDoorChecks = false;
  heldDoorChecks.length = 0;
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockToastWarning.mockReset();
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

describe("an approval belongs to the write that asked for it, never to an equal value", () => {
  it("two conversations writing the SAME value to the same target each get their own card", async () => {
    const ruleDraft = jest.fn();
    const unregister = mountRulebookPage(ruleDraft);
    const value = { __kind: "masterwork_rule_draft", mode: "new", name: "Same rule" };
    // Conversation A's person declines; conversation B's person approves.
    const cardA = jest.fn(async () => ({ kind: "declined" as const }));
    const cardB = jest.fn(async () => ({ kind: "approved" as const }));
    holdDoorChecks = true;
    try {
      const writeA = applySurfaceWrite("rule_draft", value, {
        surfaceName: RULEBOOK,
        origin: "agent",
        conversationId: "conversation-a",
        requestApproval: cardA,
      });
      const writeB = applySurfaceWrite("rule_draft", value, {
        surfaceName: RULEBOOK,
        origin: "agent",
        conversationId: "conversation-b",
        requestApproval: cardB,
      });
      // Release the door's checks newest first whenever both are waiting, so
      // B reaches its approval while A is still waiting for its own.
      let settled = false;
      const both = Promise.all([writeA, writeB]).finally(() => {
        settled = true;
      });
      for (let i = 0; i < 200 && !settled; i += 1) {
        await tick();
        const next = heldDoorChecks.pop();
        next?.release();
      }
      const [resultA, resultB] = await both;

      expect(cardA).toHaveBeenCalledTimes(1);
      expect(cardB).toHaveBeenCalledTimes(1);
      expect(resultA).toMatchObject({ ok: false, declined: true, receipt: { status: "refused", reason: "declined" } });
      expect(resultB).toMatchObject({ ok: true, receipt: { status: "applied" } });
      expect(ruleDraft).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it("a non-seam agent write of the SAME value at the same instant gets its own answer, never the seam write's card", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const ruleDraft = jest.fn();
    const unregister = mountRulebookPage(ruleDraft);
    const value = { __kind: "masterwork_rule_draft", mode: "new", name: "Same rule" };
    const card = jest.fn(async () => ({ kind: "approved" as const }));
    holdDoorChecks = true;
    try {
      const seamWrite = applySurfaceWrite("rule_draft", value, {
        surfaceName: RULEBOOK,
        origin: "agent",
        conversationId: "conversation-a",
        requestApproval: card,
      });
      for (let i = 0; i < 50 && heldDoorChecks.length < 1; i += 1) await tick();
      const outside = createAlchemyDoorPort().write({ surfaceName: RULEBOOK, target: "rule_draft", value, by: "agent" });
      for (let i = 0; i < 50 && heldDoorChecks.length < 2; i += 1) await tick();
      expect(heldDoorChecks).toHaveLength(2);
      // The outside write reaches its approval first, while the seam write waits.
      heldDoorChecks.pop()?.release();
      const outsideReceipt = await outside;
      heldDoorChecks.pop()?.release();
      const seamResult = await seamWrite;

      expect(outsideReceipt).toMatchObject({ status: "refused", reason: "failed" });
      expect(card).toHaveBeenCalledTimes(1);
      expect(seamResult).toMatchObject({ ok: true, receipt: { status: "applied" } });
      expect(ruleDraft).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});

describe("a mounted page's handler is live on the door for as long as the page is mounted", () => {
  it("a write from outside the seam (an Action, a destination) reaches the mounted page's handler", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const noteTitle = jest.fn();
    const unregister = mountNotesPage(noteTitle);
    try {
      const receipt = await createAlchemyDoorPort().write({
        surfaceName: "matrx-user/notes",
        target: "note_title",
        value: "Set from an Action",
        by: "person",
      });
      expect(receipt).toMatchObject({ status: "applied" });
      expect(noteTitle).toHaveBeenCalledWith("Set from an Action");
    } finally {
      unregister();
    }
  });

  it("once the page unmounts, the same write is refused `unapplicable` (no page, no headless handler)", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const noteTitle = jest.fn();
    const unregister = mountNotesPage(noteTitle);
    unregister();
    const receipt = await createAlchemyDoorPort().write({
      surfaceName: "matrx-user/notes",
      target: "note_title",
      value: "Nobody home",
      by: "person",
    });
    expect(noteTitle).not.toHaveBeenCalled();
    expect(receipt).toMatchObject({ status: "refused", reason: "unapplicable" });
  });

  it("Save to Notes reaches the open Notes page's own handler, and the headless one once it closes", async () => {
    mockCreateNote.mockResolvedValue({ id: "note-9", label: "Headless" });
    const { registerHeadlessDestinations, saveNotesThroughDoor } = await import("./alchemy-door");
    registerHeadlessDestinations(state);
    const createOnPage = jest.fn();
    const unregister = registerSurfaceRuntime(
      {
        surfaceName: "matrx-user/notes",
        getScope: () => ({}),
        getWriteHandlers: () => ({ create_notes: createOnPage }),
      },
      1,
    );
    try {
      const onPage = await saveNotesThroughDoor([{ title: "On the page" }]);
      expect(onPage.receipt).toMatchObject({ status: "applied" });
      expect(createOnPage).toHaveBeenCalledWith([{ title: "On the page" }]);
      expect(mockCreateNote).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
    const headless = await saveNotesThroughDoor([{ title: "Headless" }]);
    expect(headless.receipt).toMatchObject({ status: "applied" });
    expect(mockCreateNote).toHaveBeenCalledTimes(1);
  });

  it("a person's write to a target while an agent's write to it waits for approval is applied, not refused", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const noteTitle = jest.fn();
    const unregister = mountNotesPage(noteTitle);
    let approveCard: (decision: { kind: "approved" }) => void = () => undefined;
    const requestApproval = jest.fn(
      () => new Promise<{ kind: "approved" }>((resolve) => {
        approveCard = resolve;
      }),
    );
    try {
      const agentWrite = applySurfaceWrite("note_title", "Agent title", {
        surfaceName: "matrx-user/notes",
        origin: "agent",
        conversationId: "conversation-a",
        requestApproval,
      });
      for (let i = 0; i < 50 && requestApproval.mock.calls.length === 0; i += 1) await tick();
      expect(requestApproval).toHaveBeenCalledTimes(1);

      const receipt = await createAlchemyDoorPort().write({
        surfaceName: "matrx-user/notes",
        target: "note_title",
        value: "Typed by the person",
        by: "person",
      });
      expect(receipt).toMatchObject({ status: "applied" });
      expect(noteTitle).toHaveBeenCalledWith("Typed by the person");

      approveCard({ kind: "approved" });
      await expect(agentWrite).resolves.toMatchObject({ ok: true, receipt: { status: "applied" } });
      expect(noteTitle).toHaveBeenLastCalledWith("Agent title");
    } finally {
      unregister();
    }
  });
});

describe("the value contract: what the door's check covers and what it does not", () => {
  it("an agent's malformed value is refused by the door before any card is shown", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const ruleDraft = jest.fn();
    const unregister = mountRulebookPage(ruleDraft);
    try {
      const receipt = await createAlchemyDoorPort().write({
        surfaceName: RULEBOOK,
        target: "rule_draft",
        value: { __kind: "masterwork_rule_draft", name: "No mode" },
        by: "agent",
      });
      expect(receipt).toMatchObject({ status: "refused", reason: "malformed" });
      expect(ruleDraft).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("rule 10: a person's malformed value is applied with the door's warning and fix, through the door and the seam alike", async () => {
    const { createAlchemyDoorPort } = await import("./alchemy-door");
    const ruleDraft = jest.fn();
    const unregister = mountRulebookPage(ruleDraft);
    const malformed = { __kind: "masterwork_rule_draft", name: "No mode" };
    const warning = "This value isn't shaped like the \"masterwork_rule_draft\" kind: mode is required";
    try {
      const receipt = await createAlchemyDoorPort().write({
        surfaceName: RULEBOOK,
        target: "rule_draft",
        value: malformed,
        by: "person",
      });
      expect(receipt).toMatchObject({ status: "applied", warning, fix: expect.any(String) });
      ruleDraft.mockClear();

      const seam = await applySurfaceWrite("rule_draft", malformed, { surfaceName: RULEBOOK });
      expect(seam).toMatchObject({ ok: true, receipt: { status: "applied", warning, fix: expect.any(String) } });
      expect(ruleDraft).toHaveBeenCalledWith(malformed);
      expect(mockToastWarning).toHaveBeenCalledWith(warning, { description: expect.any(String) });
    } finally {
      unregister();
    }
  });

  it("rule 10: an agent's malformed value through the seam is refused by the door with the reason, before any card", async () => {
    const ruleDraft = jest.fn();
    const unregister = mountRulebookPage(ruleDraft);
    const requestApproval = jest.fn(async () => ({ kind: "approved" as const }));
    try {
      const seam = await applySurfaceWrite("rule_draft", { __kind: "masterwork_rule_draft", name: "No mode" }, {
        surfaceName: RULEBOOK,
        origin: "agent",
        conversationId: "conversation-a",
        requestApproval,
      });
      expect(seam).toMatchObject({ ok: false, receipt: { status: "refused", reason: "malformed" } });
      expect(requestApproval).not.toHaveBeenCalled();
      expect(ruleDraft).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});
