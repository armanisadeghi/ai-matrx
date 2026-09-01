import { createClient } from "@/utils/supabase/client";
import { listGoogleConnectionInventory } from "./service";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

describe("listGoogleConnectionInventory auth boundary", () => {
  it("does not issue authenticated-only table reads without a live Supabase session", async () => {
    const from = jest.fn();
    jest.mocked(createClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
      from,
    } as never);

    await expect(listGoogleConnectionInventory()).resolves.toEqual({
      connections: [],
      resources: [],
    });
    expect(from).not.toHaveBeenCalled();
  });
});
