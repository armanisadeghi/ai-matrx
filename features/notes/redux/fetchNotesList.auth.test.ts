import { fetchNotesList } from "./thunks";
import { supabase } from "@/utils/supabase/client";
import { hydrateNoteContextLinks } from "../service/noteContextAssociations";

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    schema: jest.fn(),
  },
}));

jest.mock("../service/noteContextAssociations", () => ({
  hydrateNoteContextLinks: jest.fn(async (rows: unknown[]) => rows),
  syncNoteContextLinks: jest.fn(),
}));

function notesQuery(result: unknown) {
  const chain = {
    from: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(async () => result),
  };
  chain.from.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

describe("fetchNotesList auth boundary", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stops before association hydration when identity disappears in flight", async () => {
    jest
      .mocked(supabase.auth.getSession)
      .mockResolvedValueOnce({
        data: { session: { access_token: "token", user: { id: "user-1" } } },
        error: null,
      } as never)
      .mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    jest
      .mocked(supabase.schema)
      .mockReturnValue(notesQuery({ data: [{ id: "note-1" }], error: null }) as never);

    const dispatch = jest.fn((action) => action);
    const result = await fetchNotesList()(dispatch, () => ({
      userAuth: { id: "user-1" },
    }) as never, undefined);

    expect(result.type).toBe("notes/fetchNotesList/rejected");
    expect(fetchNotesList.rejected.match(result)).toBe(true);
    if (!fetchNotesList.rejected.match(result)) throw new Error("expected rejection");
    expect(result.error.name).toBe("SessionUnavailableError");
    expect(hydrateNoteContextLinks).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: "error", type: "notes/setListStatus" }),
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "notes/setListError",
        payload: expect.stringContaining("sign-in is still loading"),
      }),
    );
  });

  // THE EMPTY SIDEBAR (2026-09-14). On a fresh sign-in Redux names the user
  // before supabase-js has restored the session; the one-shot check used to
  // throw, the list went back to `idle`, the mount guard believed it had
  // fetched, and /notes showed nothing — no folders, no notes, no loading
  // state — until an unrelated dispatch happened to fetch again.
  it("waits for the session to settle on the first read instead of giving up at once", async () => {
    jest.useFakeTimers();
    try {
      jest
        .mocked(supabase.auth.getSession)
        .mockResolvedValueOnce({ data: { session: null }, error: null } as never)
        .mockResolvedValueOnce({ data: { session: null }, error: null } as never)
        .mockResolvedValue({
          data: { session: { access_token: "token", user: { id: "user-1" } } },
          error: null,
        } as never);
      jest
        .mocked(supabase.schema)
        .mockReturnValue(notesQuery({ data: [{ id: "note-1", organization_id: "org-1" }], error: null }) as never);

      const dispatch = jest.fn((action) => action);
      const pending = fetchNotesList()(dispatch, () => ({
        userAuth: { id: "user-1" },
      }) as never, undefined);
      await jest.advanceTimersByTimeAsync(1_000);
      const result = await pending;

      expect(fetchNotesList.fulfilled.match(result)).toBe(true);
      // Two empty polls, then the settled session — and the in-flight recheck.
      expect(supabase.auth.getSession).toHaveBeenCalledTimes(5);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ payload: "loaded", type: "notes/setListStatus" }),
      );
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ payload: "idle", type: "notes/setListStatus" }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("reports the failure on screen when the session never settles", async () => {
    jest.useFakeTimers();
    try {
      jest
        .mocked(supabase.auth.getSession)
        .mockResolvedValue({ data: { session: null }, error: null } as never);
      const dispatch = jest.fn((action) => action);
      const pending = fetchNotesList()(dispatch, () => ({
        userAuth: { id: "user-1" },
      }) as never, undefined);
      await jest.advanceTimersByTimeAsync(7_000);
      const result = await pending;
      expect(fetchNotesList.rejected.match(result)).toBe(true);
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ payload: "error", type: "notes/setListStatus" }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
