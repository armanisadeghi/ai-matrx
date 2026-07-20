import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  authenticatedWebDb,
  requireAuthenticatedSupabaseSession,
  WebAuthenticationRequiredError,
} from "@/utils/supabase/webDb";

function testClient(getSession: jest.Mock) {
  const schema = jest.fn().mockReturnValue({ marker: "web-db" });
  const client = {
    auth: { getSession },
    schema,
  } as unknown as SupabaseClient<Database>;
  return { client, schema };
}

describe("authenticatedWebDb", () => {
  it("waits for a usable session before creating the web query builder", async () => {
    const getSession = jest.fn().mockResolvedValue({
      data: { session: { access_token: "signed-user-token" } },
      error: null,
    });
    const { client, schema } = testClient(getSession);

    await expect(authenticatedWebDb(client)).resolves.toEqual({
      marker: "web-db",
    });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(schema).toHaveBeenCalledWith("web");
    expect(getSession.mock.invocationCallOrder[0]).toBeLessThan(
      schema.mock.invocationCallOrder[0],
    );
  });

  it("returns the authenticated session for non-web Supabase calls", async () => {
    const session = { access_token: "signed-user-token" };
    const { client, schema } = testClient(
      jest.fn().mockResolvedValue({ data: { session }, error: null }),
    );

    await expect(requireAuthenticatedSupabaseSession(client)).resolves.toBe(
      session,
    );
    expect(schema).not.toHaveBeenCalled();
  });

  it("does not construct a query when no authenticated session exists", async () => {
    const { client, schema } = testClient(
      jest.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
    );

    await expect(authenticatedWebDb(client)).rejects.toBeInstanceOf(
      WebAuthenticationRequiredError,
    );
    expect(schema).not.toHaveBeenCalled();
  });

  it("does not construct a query when session verification fails", async () => {
    const authError = new Error("storage unavailable");
    const { client, schema } = testClient(
      jest.fn().mockResolvedValue({
        data: { session: null },
        error: authError,
      }),
    );

    await expect(authenticatedWebDb(client)).rejects.toMatchObject({
      name: "WebAuthenticationRequiredError",
      cause: authError,
    });
    expect(schema).not.toHaveBeenCalled();
  });

  it("does not construct a query when session lookup rejects", async () => {
    const authError = new Error("session storage failed");
    const { client, schema } = testClient(
      jest.fn().mockRejectedValue(authError),
    );

    await expect(authenticatedWebDb(client)).rejects.toMatchObject({
      name: "WebAuthenticationRequiredError",
      cause: authError,
    });
    expect(schema).not.toHaveBeenCalled();
  });
});
