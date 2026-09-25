/**
 * @jest-environment node
 */
/**
 * THE ADMIN LANE on a REAL supabase-js client: the header rides exactly the
 * requests made while the lane is open, through every PostgREST door
 * (`.from()`, `.rpc()`, `.schema().from()`), and never otherwise.
 */
import { createClient } from "@supabase/supabase-js";
import {
  ADMIN_LANE_HEADER,
  installAdminLane,
  isAdminLanePath,
} from "./adminLane";

function recordingClient() {
  const seen: Array<{ url: string; lane: string | null }> = [];
  const fetchStub = async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      lane: new Headers(init?.headers).get(ADMIN_LANE_HEADER),
    });
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = createClient("http://lane.test", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub as typeof fetch },
  });
  return { client, seen };
}

describe("isAdminLanePath", () => {
  it.each([
    ["/administration", true],
    ["/administration/users", true],
    ["/api/admin/admins", true],
    ["/api/sms/admin/numbers", true],
    ["/notes", false],
    ["/agents", false],
    ["/administrationx", false],
    ["/reports/admin", true],
    ["/agents/admin", true],
    ["/organizations/abc/admin", false],
    ["/agents/administrator", false],
    ["/api/agents", false],
    [null, false],
  ])("%s → %s", (path, expected) => {
    expect(isAdminLanePath(path)).toBe(expected);
  });
});

describe("installAdminLane", () => {
  it("adds the header only while the lane is open, on every PostgREST door", async () => {
    const { client, seen } = recordingClient();
    let open = false;
    installAdminLane(client, () => open);

    await client.from("notes").select("id");
    await client.rpc("admin_lane_open");
    open = true;
    await client.from("notes").select("id");
    await client.rpc("admin_lane_open");
    await client.schema("platform").from("x").select("id");
    open = false;
    await client.rpc("admin_lane_open");

    expect(seen.map((r) => r.lane)).toEqual([null, null, "1", "1", "1", null]);
  });

  it("is idempotent — installing twice never double-wraps", async () => {
    const { client, seen } = recordingClient();
    installAdminLane(client, () => true);
    installAdminLane(client, () => false);
    await client.rpc("admin_lane_open");
    expect(seen[0].lane).toBe("1");
  });

  it("refuses loudly when a real client loses the transport it wraps", () => {
    expect(() => installAdminLane({ supabaseUrl: "x", rest: {} }, () => true)).toThrow(
      /rest\.fetch/,
    );
  });
});
