/**
 * ONE WORD CHANGED ON A LONG NOTE TRAVELS AS ONE WORD, NOT AS THE WHOLE NOTE.
 *
 * Break this guards (Arman, 2026-10-01; production conversations 9fcf3382-…
 * and ceba31ec-…): every `apply_surface_write` on `note_content` carried the
 * WHOLE note as `value`, because the target was never offered an anchored
 * edit — the surface patch envelope existed, but `note_content` was not
 * `patchable` and its description said "REPLACES the entire body". Even a
 * patch could not have landed: the seam read the text to edit from
 * `updatesValue` (`current_note`, a resource reference object), so it refused.
 *
 * Drives the REAL notes manifest through the REAL seam, offer builder and
 * approval-card builder. Only the toast, the error capture and the kind
 * schema network hop are faked.
 */
const mockGetManifest = jest.fn();

jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: jest.fn(),
}));
// The subject still reaches the app's Error Inspector through other host
// modules; both sinks share one mock so no capture escapes the assertions.

jest.mock("@ai-matrx/chat/surfaces/runtime/registry", () => ({
  getManifest: mockGetManifest,
  peekSurfaceBody: (n: string) => (mockGetManifest)(n),
  peekSurfaceValue: (n: string, v: string) => (mockGetManifest)(n)?.values?.find((x: { name: string }) => x.name === v),
  loadSurfaceBody: async (n: string) => (mockGetManifest)(n),
  awaitSurfaceBodies: async () => ({ missing: [], waitedMs: 0 }),
  awaitSendSurfaceBodies: async () => [],
  takeSurfaceWithheldWarning: () => null,
  prefetchSurfaceBodies: () => {},
  isIndexedSurfaceClientToolName: () => false,
  useSurfaceBody: (n: string) => ({ status: "ready", body: (mockGetManifest)(n) }),
  getDeclaringSurface: () => null,
  getSurfaceAncestry: () => [],
  getSurfaceChildren: () => [],
}));

import {
  applySurfaceWrite,
  listAgentWritableTargets,
  type SurfaceWriteApprovalProposal,
} from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { registerSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { describeAgentWritableTargets } from "@ai-matrx/chat/surfaces/runtime/agent-offer";
import { notesEditorManifest } from "@/features/surfaces/manifests/notes-editor.manifest";
import { buildSurfaceWriteApprovalChange } from "@ai-matrx/chat/agents/redux/execution-system/thunks/surface-write-approval-change";

const ROUTING_LINE = "Routing: (pending)";

/** A ~5,000-character note with exactly one routing line in the middle. */
function longNote(): string {
  const filler = Array.from(
    { length: 52 },
    (_, i) =>
      `Paragraph ${i + 1}: crates, inventory, insurance riders and the carrier's dock schedule for week ${i + 1}.`,
  );
  const lines = [
    "# Move 4471 — routing",
    "",
    ...filler.slice(0, 26),
    ROUTING_LINE,
    ...filler.slice(26),
  ];
  return lines.join("\n");
}

function mountNotes(content: string, apply: jest.Mock) {
  mockGetManifest.mockImplementation((name: string) =>
    name === notesEditorManifest.surfaceName ? notesEditorManifest : undefined,
  );
  return registerSurfaceRuntime(
    {
      surfaceName: notesEditorManifest.surfaceName,
      getScope: () => ({
        current_note: {
          __kind: "resource_ref",
          resource_type: "note",
          resource_id: "59678b3b-3620-442d-872b-0331ac74a1cf",
        },
        content,
      }),
      getWriteHandlers: () => ({ note_content: apply }),
    },
    10,
  );
}

describe("note_content: a small change is offered, applied and shown as a patch", () => {
  beforeEach(() => jest.clearAllMocks());

  it("the tool offer marks note_content patchable and leads a small change to str_replace", async () => {
    const unregister = mountNotes(longNote(), jest.fn());
    try {
      const writable = listAgentWritableTargets().filter(
        ({ target }) => target.name === "note_content",
      );
      expect(writable).toHaveLength(1);
      const [line] = await describeAgentWritableTargets(writable);
      expect(line).toContain("[patchable]");
      expect(line).toContain('"command": "str_replace"');
      // The small change is the lead, not an afterthought behind "REPLACES".
      expect(line.indexOf("str_replace")).toBeLessThan(
        line.indexOf("whole body") === -1 ? Infinity : line.indexOf("whole body"),
      );
    } finally {
      unregister();
    }
  });

  it("a one-word str_replace on a 5,000-char note lands that word and the card shows ONE line", async () => {
    const note = longNote();
    expect(note.length).toBeGreaterThan(4500);
    const apply = jest.fn();
    const unregister = mountNotes(note, apply);
    let proposal: SurfaceWriteApprovalProposal | undefined;
    try {
      const result = await applySurfaceWrite(
        "note_content",
        { command: "str_replace", old_str: "(pending)", new_str: "(confirmed)" },
        {
          origin: "agent",
          requestApproval: async (p) => {
            proposal = p;
            return { kind: "approved" };
          },
        },
      );
      expect(result.ok).toBe(true);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(apply.mock.calls[0][0]).toBe(
        note.replace("(pending)", "(confirmed)"),
      );

      expect(proposal).toBeDefined();
      const card = buildSurfaceWriteApprovalChange(proposal!);
      expect(card.fields).toHaveLength(1);
      const [field] = card.fields;
      expect(field.before).toBe(ROUTING_LINE);
      expect(field.after).toBe("Routing: (confirmed)");
    } finally {
      unregister();
    }
  });

  it("an anchor that is not in the note refuses before the card; nothing is written", async () => {
    const apply = jest.fn();
    const ask = jest.fn();
    const unregister = mountNotes(longNote(), apply);
    try {
      const result = await applySurfaceWrite(
        "note_content",
        { command: "str_replace", old_str: "Routing: (shipped)", new_str: "x" },
        { origin: "agent", requestApproval: ask },
      );
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/exactly one place/);
      expect(ask).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("an anchor that matches more than once refuses before the card; nothing is written", async () => {
    const apply = jest.fn();
    const ask = jest.fn();
    const unregister = mountNotes(longNote(), apply);
    try {
      const result = await applySurfaceWrite(
        "note_content",
        { command: "str_replace", old_str: "Paragraph", new_str: "Section" },
        { origin: "agent", requestApproval: ask },
      );
      expect(result.ok).toBe(false);
      expect(ask).not.toHaveBeenCalled();
      expect(apply).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("a plain string is still a whole-body rewrite, diffed against the live text", async () => {
    const note = longNote();
    const apply = jest.fn();
    const unregister = mountNotes(note, apply);
    let proposal: SurfaceWriteApprovalProposal | undefined;
    try {
      const result = await applySurfaceWrite("note_content", "# Rewritten", {
        origin: "agent",
        requestApproval: async (p) => {
          proposal = p;
          return { kind: "approved" };
        },
      });
      expect(result.ok).toBe(true);
      expect(apply).toHaveBeenCalledWith("# Rewritten");
      const [field] = buildSurfaceWriteApprovalChange(proposal!).fields;
      expect(field.before).toBe(note);
      expect(field.after).toBe("# Rewritten");
    } finally {
      unregister();
    }
  });
});
