import {
  fetchDmUserInfo,
  fetchDmUserInfoMap,
  resetDmUserInfoCache,
} from "@/features/messaging/data/dmUserInfo";

type Client = Parameters<typeof fetchDmUserInfo>[0];

function client(onCall: (id: string) => void): Client {
  return {
    rpc: async (_fn: string, args: { p_user_id: string }) => {
      onCall(args.p_user_id);
      await Promise.resolve();
      return {
        data: [
          {
            user_id: args.p_user_id,
            email: `${args.p_user_id}@example.com`,
            display_name: args.p_user_id,
            avatar_url: null,
          },
        ],
        error: null,
      };
    },
  } as unknown as Client;
}

describe("fetchDmUserInfo", () => {
  beforeEach(() => {
    resetDmUserInfoCache();
  });

  it("collapses a burst for the same user into ONE request", async () => {
    const calls: string[] = [];
    const supabase = client((id) => calls.push(id));

    await Promise.all(
      Array.from({ length: 300 }, () => fetchDmUserInfo(supabase, "u1")),
    );

    expect(calls).toEqual(["u1"]);
  });

  it("serves later reads from the TTL cache", async () => {
    const calls: string[] = [];
    const supabase = client((id) => calls.push(id));

    await fetchDmUserInfo(supabase, "u1");
    const again = await fetchDmUserInfo(supabase, "u1");

    expect(calls).toEqual(["u1"]);
    expect(again?.display_name).toBe("u1");
  });

  it("resolves a message list to one request per distinct sender", async () => {
    const calls: string[] = [];
    const supabase = client((id) => calls.push(id));

    const map = await fetchDmUserInfoMap(supabase, [
      "u1",
      "u2",
      "u1",
      "u2",
      "u1",
    ]);

    expect(calls.sort()).toEqual(["u1", "u2"]);
    expect(map.get("u1")?.email).toBe("u1@example.com");
    expect(map.size).toBe(2);
  });

  it("keeps a transport failure from failing the whole batch", async () => {
    let calls = 0;
    const supabase = {
      rpc: async (_fn: string, args: { p_user_id: string }) => {
        calls += 1;
        if (args.p_user_id === "bad") throw new TypeError("Failed to fetch");
        return {
          data: [
            {
              user_id: args.p_user_id,
              email: null,
              display_name: args.p_user_id,
              avatar_url: null,
            },
          ],
          error: null,
        };
      },
    } as unknown as Client;

    const map = await fetchDmUserInfoMap(supabase, ["good", "bad"]);

    expect(calls).toBe(2);
    expect(map.get("good")?.display_name).toBe("good");
    expect(map.has("bad")).toBe(false);
  });
});
