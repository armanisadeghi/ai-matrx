// Audit N-22 — the trash hydration used to dispatch one `upsertNoteFromServer`
// per deleted row, re-notifying every store subscriber and re-running every
// sorted list selector once per row (the O(N²·log N) freeze shape the owner
// list was fixed for). It must be ONE batch, whatever the row count.
//
// It also used to stamp every trashed row's `created_by` with the VIEWER,
// which under organization scope claimed colleagues' deleted notes as theirs.

import { fetchDeletedNotes } from "./thunks";
import { supabase } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn() }, schema: jest.fn() },
}));

jest.mock("../service/noteContextAssociations", () => ({
  hydrateNoteContextLinks: jest.fn(async (rows: unknown[]) => rows),
  syncNoteContextLinks: jest.fn(),
}));

jest.mock("@/lib/list-scope", () => ({ scopeToOwner: jest.fn(async () => false) }));

function trashQuery(rows: unknown[]) {
  const chain = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    not: jest.fn(),
    order: jest.fn(async () => ({ data: rows, error: null })),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  return chain;
}

describe("fetchDeletedNotes hydration", () => {
  beforeEach(() => jest.clearAllMocks());

  it("hydrates the whole bin in ONE batched dispatch", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `note-${i}`,
      created_by: i % 2 === 0 ? "user-1" : "colleague-9",
      label: `Note ${i}`,
      deleted_at: "2026-09-14T00:00:00Z",
    }));
    jest.mocked(supabase.schema).mockReturnValue(trashQuery(rows) as never);

    const dispatch = jest.fn((action) => action);
    await fetchDeletedNotes()(
      dispatch,
      () => ({ userAuth: { id: "user-1" } }) as never,
      undefined,
    );

    const upsertActions = dispatch.mock.calls
      .map(([action]) => action as { type?: string })
      .filter((action) => typeof action?.type === "string" && action.type.startsWith("notes/upsertNote"));

    expect(upsertActions).toHaveLength(1);
    expect(upsertActions[0]).toEqual(
      expect.objectContaining({ type: "notes/upsertNotesFromServer" }),
    );
    const payload = (upsertActions[0] as { payload: { upserts: { note: { id: string; created_by: string }; fetchStatus: string }[] } }).payload;
    expect(payload.upserts).toHaveLength(25);
    // Trash rows carry the preview, not the body (audit N-24): a "list" read,
    // so opening one from the bin reads its body like any other note.
    expect(payload.upserts.every((u) => u.fetchStatus === "list")).toBe(true);
    // The ROW's owner, never the viewer's id.
    expect(payload.upserts[1].note.created_by).toBe("colleague-9");
  });
});
