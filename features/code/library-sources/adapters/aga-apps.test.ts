import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { AGA_APP_OWNER_COLUMN, agaAppsAdapter } from "./aga-apps";

describe("agaAppsAdapter ownership query", () => {
  it("filters editable app rows by the canonical created_by column", async () => {
    const eq = jest.fn().mockReturnThis();
    const query = {
      select: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      eq,
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const client = {
      schema: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue(query),
      }),
    };

    await agaAppsAdapter.list(
      client as unknown as SupabaseClient<Database>,
      "viewer-user-id",
    );

    expect(AGA_APP_OWNER_COLUMN).toBe("created_by");
    expect(eq).toHaveBeenCalledWith("created_by", "viewer-user-id");
    expect(eq).not.toHaveBeenCalledWith("user_id", "viewer-user-id");
  });
});
