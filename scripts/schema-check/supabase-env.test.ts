import { resolveSupabaseEnv } from "./supabase-env";

// Break this guards: the refresher picking a key by its position in a .env file.
// `.env.local` lists the publishable key above the secret key; the snapshot RPC is
// granted to service_role only, so position-order sends the wrong key, the RPC
// returns 42501, and a degraded fallback snapshot is written instead.

const ENV_LOCAL_ORDER = [
  "NEXT_PUBLIC_SUPABASE_URL=https://db.example.test",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_x",
  "SUPABASE_SECRET_KEY=sb_secret_y",
].join("\n");

describe("resolveSupabaseEnv", () => {
  it("prefers the secret key even when the publishable key is listed first in the file", () => {
    const env = resolveSupabaseEnv({}, [ENV_LOCAL_ORDER]);
    expect(env).toEqual({
      url: "https://db.example.test",
      key: "sb_secret_y",
      keyName: "SUPABASE_SECRET_KEY",
    });
  });

  it("prefers a secret key from a later file over a publishable key in an earlier file", () => {
    const env = resolveSupabaseEnv({}, [
      "NEXT_PUBLIC_SUPABASE_URL=https://db.example.test\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pub",
      "SUPABASE_SECRET_KEY=sec",
    ]);
    expect(env?.keyName).toBe("SUPABASE_SECRET_KEY");
  });

  it("degrades to the publishable key only when no secret key exists", () => {
    const env = resolveSupabaseEnv({}, [
      "NEXT_PUBLIC_SUPABASE_URL=https://db.example.test\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=pub",
    ]);
    expect(env?.keyName).toBe("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });

  it("process env beats files for the same name", () => {
    const env = resolveSupabaseEnv({ SUPABASE_SECRET_KEY: "from_process" }, [ENV_LOCAL_ORDER]);
    expect(env?.key).toBe("from_process");
  });

  it("returns null without a URL", () => {
    expect(resolveSupabaseEnv({}, ["SUPABASE_SECRET_KEY=sec"])).toBeNull();
  });
});
