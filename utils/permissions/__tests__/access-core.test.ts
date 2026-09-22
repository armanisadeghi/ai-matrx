import { createClient } from "@supabase/supabase-js";
import { NO_ACCESS, resolveResourceAccess } from "../access-core";

const RESOURCE_TYPE = "research_topic";
const RESOURCE_ID = "0d59c395-8c19-43df-90df-8ca384f3edc3";

function unavailableAccessClient() {
  return createClient("http://localhost:54321", "test-publishable-key", {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

const client = unavailableAccessClient();
const rpc = jest.spyOn(client, "rpc");

describe("resolveResourceAccess strict failures", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("keeps the default no-access fallback for existing callers", async () => {
    rpc.mockRejectedValue(new Error("access resolver transport unavailable"));

    await expect(
      resolveResourceAccess(client, RESOURCE_TYPE, RESOURCE_ID),
    ).resolves.toEqual(NO_ACCESS);
  });

  it("propagates a transport failure when the caller requests strict resolution", async () => {
    const failure = new Error("access resolver transport unavailable");
    rpc.mockRejectedValue(failure);

    await expect(
      resolveResourceAccess(client, RESOURCE_TYPE, RESOURCE_ID, {
        strict: true,
      }),
    ).rejects.toBe(failure);
  });

  it("propagates an RPC failure when the caller requests strict resolution", async () => {
    const failure = {
      code: "PGRST002",
      message: "schema cache unavailable",
      details: "",
      hint: "",
    };
    rpc.mockResolvedValue({
      data: null,
      error: failure,
      count: null,
      status: 503,
      statusText: "Service Unavailable",
    } as never);

    await expect(
      resolveResourceAccess(client, RESOURCE_TYPE, RESOURCE_ID, {
        strict: true,
      }),
    ).rejects.toBe(failure);
  });

  it("propagates a malformed authority response in strict mode", async () => {
    rpc.mockResolvedValue({
      data: { level: "unexpected" },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
      success: true,
    });

    await expect(
      resolveResourceAccess(client, RESOURCE_TYPE, RESOURCE_ID, {
        strict: true,
      }),
    ).rejects.toThrow("get_resource_access returned a malformed response");
  });

  it("does not invent authority fields when a response is incomplete", async () => {
    rpc.mockResolvedValue({
      data: { level: "view" },
      error: null,
      count: null,
      status: 200,
      statusText: "OK",
      success: true,
    });

    await expect(
      resolveResourceAccess(client, RESOURCE_TYPE, RESOURCE_ID, {
        strict: true,
      }),
    ).rejects.toThrow("get_resource_access returned a malformed response");
  });
});
