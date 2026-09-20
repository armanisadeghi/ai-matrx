const maybeSingle = jest.fn();
const query = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), maybeSingle };
query.select.mockReturnValue(query);
query.eq.mockReturnValue(query);
query.is.mockReturnValue(query);

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => query }) },
}));
jest.mock("./noteContextAssociations", () => ({ hydrateNoteContextLinks: jest.fn(async (rows) => rows) }));

import { fetchNoteById } from "./notesService";

describe("strict note reads", () => {
  it("distinguishes a transport failure from an inaccessible record", async () => {
    const capture = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "Connection interrupted", code: "NETWORK" } });
      await expect(fetchNoteById("guide", { failureMode: "throw" })).rejects.toThrow();
      maybeSingle.mockResolvedValueOnce({ data: null, error: null });
      await expect(fetchNoteById("guide", { failureMode: "throw" })).resolves.toBeNull();
    } finally {
      capture.mockRestore();
    }
  });
});
