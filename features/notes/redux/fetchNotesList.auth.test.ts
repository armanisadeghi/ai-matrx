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
      expect.objectContaining({ payload: "idle", type: "notes/setListStatus" }),
    );
  });
});
