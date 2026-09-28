jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn() },
}));

import { supabase } from "@/utils/supabase/client";
import { fcService } from "../fcService";

function installCard(currentVersion: number) {
  let lastPatch: Record<string, unknown> | null = null;
  function from() {
    let patch: Record<string, unknown> | null = null;
    let expected: number | null = null;
    const query = {
      update(value: Record<string, unknown>) {
        patch = value;
        lastPatch = value;
        return query;
      },
      select() { return query; },
      eq(column: string, value: string | number) {
        if (column === "version") expected = Number(value);
        return query;
      },
      is() { return query; },
      maybeSingle: async () => ({
        data: patch
          ? expected === currentVersion
            ? { id: "card-1", version: currentVersion + 1, ...patch }
            : null
          : { id: "card-1", version: currentVersion },
        error: null,
      }),
    };
    return query;
  }
  jest.mocked(supabase.schema).mockReturnValue({ from } as never);
  return { patch: () => lastPatch };
}

describe("versioned card deletion", () => {
  afterEach(() => jest.clearAllMocks());

  it("archives the loaded revision and advances its version", async () => {
    const db = installCard(4);
    const result = await fcService.deleteCard("card-1", 4);
    expect(result.error).toBeNull();
    expect(db.patch()).toMatchObject({ version: 5, deleted_at: expect.any(String) });
  });

  it("refuses to archive a newer revision", async () => {
    installCard(5);
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const result = await fcService.deleteCard("card-1", 4);
    log.mockRestore();
    expect(result.error).toMatch(/changed elsewhere/);
  });
});
