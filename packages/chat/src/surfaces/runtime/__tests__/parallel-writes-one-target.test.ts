/**
 * TWO EDITS TO ONE NOTE IN ONE TURN BOTH LAND — NEITHER IS LOST TO A FALSE
 * "CHANGED WHILE YOU WERE REVIEWING".
 *
 * Break this guards (2026-10-02, clone conversation 0c6b021e-…, note
 * f1284c78-… opened from a board tile): the agent emitted two parallel
 * `apply_surface_write` str_replace calls on `note_content` (10:30 line and
 * 3:00 line). Two approval cards opened, both snapshotting the same original.
 * The person applied the first: "'Note content' changed while you were
 * reviewing it. Nothing was applied." Then the second: the same. Nothing else
 * had touched the note. Two causes, one class:
 *
 *  1. The post-approval check compared the RUNTIME OBJECT by identity
 *     (`registry.stack().includes(runtime)`): any re-registration of the same
 *     surface while a card was open (the board adding a tile re-renders the
 *     note tile) refused every pending card with the "changed" sentence.
 *  2. Each card compared its frozen whole-value against the text at approval:
 *     the first edit that applied made every sibling card stale, even though a
 *     str_replace on a different line still applies cleanly.
 *
 * The rule: writes to one target from one turn are QUEUED and applied in
 * order; each anchored edit is resolved against the text at the moment it is
 * applied (rebased when its old text still matches exactly once); the
 * "changed" refusal is said only when the edit truly no longer fits.
 *
 * Drives the REAL notes manifest through the REAL seam. Only the toast, the
 * error capture and the kind schema network hop are faked.
 */
const mockGetManifest = jest.fn();

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  getManifest: mockGetManifest,
}));
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: jest.fn(),
}));

import {
  applySurfaceWrite,
  type SurfaceWriteApprovalProposal,
} from "../surface-writeback";
import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import { notesEditorManifest } from "@host/features/surfaces/manifests/notes-editor.manifest";

const NOTE = [
  "# Thursday 10/16 hygiene — final",
  "",
  "- 8:00 — Marisol Rivera — adult prophy (D1110)",
  "- 10:30 — open",
  "- 1:15 — Dara Whitehorse — new-patient exam + cleaning",
  "- 3:00 — Dana Kowalczyk, RDH — open",
].join("\n");

const EDIT_1030 = {
  command: "str_replace",
  old_str: "- 10:30 — open",
  new_str:
    "- 10:30 — Hieu Tran — new-patient exam + cleaning (D0150, D1110), 60 min",
};
const EDIT_300 = {
  command: "str_replace",
  old_str: "- 3:00 — Dana Kowalczyk, RDH — open",
  new_str: "- 3:00 — Priya Natarajan covering for Dana Kowalczyk, RDH — open",
};

/** A live note editor: `content` is what the editor shows; the handler is the
 * editor's own flush. `renderLagMs` models React re-rendering after setState —
 * the scope reads the old text until the render lands. */
function mountNote(opts: { renderLagMs?: number } = {}) {
  mockGetManifest.mockImplementation((name: string) =>
    name === notesEditorManifest.surfaceName ? notesEditorManifest : undefined,
  );
  const state = { content: NOTE };
  const apply = jest.fn((value: string) => {
    if (opts.renderLagMs) {
      setTimeout(() => {
        state.content = value;
      }, opts.renderLagMs);
    } else {
      state.content = value;
    }
  });
  const runtime = {
    surfaceName: notesEditorManifest.surfaceName,
    getScope: () => ({
      current_note: {
        __kind: "resource_ref",
        resource_type: "note",
        resource_id: "f1284c78-fbaf-4fd3-8567-34d5906c1f65",
      },
      content: state.content,
    }),
    getWriteHandlers: () => ({ note_content: apply }),
  };
  let unregister = registerSurfaceRuntime(runtime, 10);
  return {
    state,
    apply,
    /** The same editor re-registering (a parent re-render / tile remount). */
    reregister() {
      unregister();
      unregister = registerSurfaceRuntime({ ...runtime }, 10);
    },
    unmount: () => unregister(),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("parallel writes to one target from one turn", () => {
  beforeEach(() => jest.clearAllMocks());

  it("two parallel str_replace edits on different lines BOTH apply, in order", async () => {
    const note = mountNote();
    try {
      const proposals: SurfaceWriteApprovalProposal[] = [];
      const approve = async (p: SurfaceWriteApprovalProposal) => {
        proposals.push(p);
        await tick(); // the person reads the card
        return { kind: "approved" as const };
      };
      const [first, second] = await Promise.all([
        applySurfaceWrite("note_content", EDIT_1030, {
          origin: "agent",
          requestApproval: approve,
        }),
        applySurfaceWrite("note_content", EDIT_300, {
          origin: "agent",
          requestApproval: approve,
        }),
      ]);
      expect(first).toMatchObject({ ok: true });
      expect(second).toMatchObject({ ok: true });
      expect(note.apply).toHaveBeenCalledTimes(2);
      expect(note.state.content).toBe(
        NOTE.replace(EDIT_1030.old_str, EDIT_1030.new_str).replace(
          EDIT_300.old_str,
          EDIT_300.new_str,
        ),
      );
      // The second card was presented against the text AFTER the first edit,
      // so its comparison is honest.
      expect(proposals[1]?.currentValue).toContain(EDIT_1030.new_str);
    } finally {
      note.unmount();
    }
  });

  it("the edit still lands when the editor's render lags the write", async () => {
    const note = mountNote({ renderLagMs: 20 });
    try {
      const approve = async () => {
        await tick();
        return { kind: "approved" as const };
      };
      const results = await Promise.all([
        applySurfaceWrite("note_content", EDIT_1030, {
          origin: "agent",
          requestApproval: approve,
        }),
        applySurfaceWrite("note_content", EDIT_300, {
          origin: "agent",
          requestApproval: approve,
        }),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(results.map((r) => r.ok)).toEqual([true, true]);
      expect(note.state.content).toContain(EDIT_1030.new_str);
      expect(note.state.content).toContain(EDIT_300.new_str);
    } finally {
      note.unmount();
    }
  });

  it("the same editor re-registering while the card is open is NOT a change", async () => {
    const note = mountNote();
    try {
      const result = await applySurfaceWrite("note_content", EDIT_300, {
        origin: "agent",
        requestApproval: async () => {
          note.reregister();
          return { kind: "approved" };
        },
      });
      expect(result).toMatchObject({ ok: true });
      expect(note.state.content).toContain(EDIT_300.new_str);
    } finally {
      note.unmount();
    }
  });

  it("an edit whose old text is truly gone is refused honestly; nothing is written", async () => {
    const note = mountNote();
    try {
      const result = await applySurfaceWrite("note_content", EDIT_300, {
        origin: "agent",
        requestApproval: async () => {
          // The person rewrote that line themselves while the card was open.
          note.state.content = NOTE.replace(
            EDIT_300.old_str,
            "- 3:00 — cancelled",
          );
          return { kind: "approved" };
        },
      });
      expect(result).toMatchObject({ ok: false, refused: true });
      expect(!result.ok && result.error).toContain(
        "changed while you were reviewing",
      );
      expect(note.apply).not.toHaveBeenCalled();
    } finally {
      note.unmount();
    }
  });

  it("a declined first card does not block the second", async () => {
    const note = mountNote();
    try {
      let n = 0;
      const [first, second] = await Promise.all([
        applySurfaceWrite("note_content", EDIT_1030, {
          origin: "agent",
          requestApproval: async () =>
            n++ === 0 ? { kind: "declined" as const } : { kind: "approved" as const },
        }),
        applySurfaceWrite("note_content", EDIT_300, {
          origin: "agent",
          requestApproval: async () =>
            n++ === 0 ? { kind: "declined" as const } : { kind: "approved" as const },
        }),
      ]);
      expect(first).toMatchObject({ ok: false, declined: true });
      expect(second).toMatchObject({ ok: true });
      expect(note.state.content).toContain(EDIT_300.new_str);
      expect(note.state.content).not.toContain(EDIT_1030.new_str);
    } finally {
      note.unmount();
    }
  });
});
