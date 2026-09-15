/**
 * THE LIST NEVER CARRIES THE BODY (audit N-24, 2026-09-14). Every route entry
 * and every refresh used to download the full text of every note. The list
 * reads the database-maintained 240-char preview; bodies are read on open
 * (fetchNoteContent) or, for find-across-notes and bulk export, in chunks by
 * ensureNoteBodiesLoaded.
 */
import { ENSURE_BODIES_CHUNK, ensureNoteBodiesLoaded, fetchNotesList } from "./thunks";
import { supabase } from "@/utils/supabase/client";

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    schema: jest.fn(),
    rpc: jest.fn(),
  },
}));
jest.mock("../service/noteContextAssociations", () => ({
  hydrateNoteContextLinks: jest.fn(async (rows: unknown[]) => rows),
  syncNoteContextLinks: jest.fn(),
}));
jest.mock("@/lib/api/organization-context", () => ({
  ...jest.requireActual("@/lib/api/organization-context"),
}));

function listQuery(result: { data: unknown[] | null; error: unknown }) {
  const paged = { ...result, count: result.data?.length ?? 0 };
  const chain = {
    from: jest.fn(), select: jest.fn(), eq: jest.fn(), is: jest.fn(), order: jest.fn(),
    range: jest.fn(async () => paged),
  };
  for (const key of ["from", "select", "eq", "is", "order"] as const) chain[key].mockReturnValue(chain);
  return chain;
}

function bodyQuery(rowsById: Record<string, { id: string; content: string; organization_id: string }>) {
  const chain = {
    from: jest.fn(), select: jest.fn(),
    in: jest.fn(async (_col: string, ids: string[]) => ({ data: ids.map((id) => rowsById[id]).filter(Boolean), error: null })),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

describe("the list read carries the preview, never the body", () => {
  beforeEach(() => jest.clearAllMocks());

  it("selects content_preview and not content", async () => {
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "t", user: { id: "user-1" } } },
      error: null,
    } as never);
    const chain = listQuery({ data: [], error: null });
    jest.mocked(supabase.schema).mockReturnValue(chain as never);
    const dispatch = jest.fn((action) => action);
    await fetchNotesList()(dispatch, () => ({ userAuth: { id: "user-1" } }) as never, undefined);
    // The first select on this client is the scope-registry read; the list
    // read is the one that names the row columns.
    const selected = chain.select.mock.calls
      .map((call) => call[0] as string)
      .find((cols) => cols.includes("label")) as string;
    expect(selected).toContain("content_preview");
    expect(selected.split(",").map((s) => s.trim())).not.toContain("content");
  });
});

describe("ensureNoteBodiesLoaded", () => {
  beforeEach(() => jest.clearAllMocks());

  it("reads only the notes not yet full, in chunks, with ONE batched upsert per chunk", async () => {
    const ids = Array.from({ length: ENSURE_BODIES_CHUNK + 5 }, (_, i) => `n${i}`);
    const rows = Object.fromEntries(ids.map((id) => [id, { id, content: `body ${id}`, organization_id: "org" }]));
    const chain = bodyQuery(rows);
    jest.mocked(supabase.schema).mockReturnValue(chain as never);
    const notes: Record<string, { id: string; _fetchStatus: string }> = Object.fromEntries(
      ids.map((id) => [id, { id, _fetchStatus: id === "n0" ? "full" : "list" }]),
    );
    const dispatch = jest.fn((action) => action);
    await ensureNoteBodiesLoaded(ids)(dispatch, () => ({ notes: { notes } }) as never, undefined);
    // n0 was already full → 104 missing → two chunks (100 + 4).
    expect(chain.in).toHaveBeenCalledTimes(2);
    expect((chain.in.mock.calls[0][1] as string[])).not.toContain("n0");
    expect((chain.in.mock.calls[0][1] as string[])).toHaveLength(ENSURE_BODIES_CHUNK);
    const upserts = dispatch.mock.calls.map((c) => c[0]).filter((a) => a?.type === "notes/upsertNotesFromServer");
    expect(upserts).toHaveLength(2);
    expect(upserts[0].payload.upserts[0].fetchStatus).toBe("full");
  });

  it("reads nothing when every note is already full", async () => {
    const chain = bodyQuery({});
    jest.mocked(supabase.schema).mockReturnValue(chain as never);
    const dispatch = jest.fn((action) => action);
    await ensureNoteBodiesLoaded(["a", "b"])(dispatch, () => ({ notes: { notes: { a: { id: "a", _fetchStatus: "full" }, b: { id: "b", _fetchStatus: "full" } } } }) as never, undefined);
    expect(chain.in).not.toHaveBeenCalled();
  });
});
