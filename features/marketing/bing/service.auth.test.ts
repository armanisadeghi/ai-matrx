import { createClient } from "@/utils/supabase/client";
import { listBingConnectionInventory } from "./service";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

describe("listBingConnectionInventory auth boundary", () => {
  it("does not construct an authenticated-only table read without a live session", async () => {
    const from = jest.fn();
    jest.mocked(createClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
      schema: jest.fn(() => ({ from })),
    } as never);

    await expect(listBingConnectionInventory()).resolves.toEqual({
      connections: [],
      resources: [],
    });
    expect(from).not.toHaveBeenCalled();
  });
});
