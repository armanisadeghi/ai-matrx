/**
 * The db seam (P6) reaches the database only through the host's `db`, lazily:
 * importing it reads nothing, every access resolves the host configured NOW,
 * and an access before any host is configured throws the named, remedied
 * error — never a silent `undefined`, never a client the package built itself.
 */

import { AuthError, AuthSessionMissingError } from "@supabase/supabase-js";
import {
  ChatHostNotConfiguredError,
  _resetChatHostForTests,
  configureChat,
} from "../index";
import type { ChatDb } from "../contract";
import { createClient, getClaimsUser, schedulerDb, supabase } from "../db";
import { createFakeDb } from "../../testing/fake-db";

afterEach(() => _resetChatHostForTests());

/** The seam with untyped rpc names — the fake db records any call. */
type LooseRpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;
const loose = supabase as unknown as { rpc: LooseRpc };

describe("the db seam is lazy", () => {
  it("importing the seam read no host (this file imported it before any configureChat)", () => {
    // Reaching this line at all proves the import did not resolve the host.
    expect(typeof supabase).toBe("object");
  });

  it("every access reaches the host configured at that moment, with methods bound to it", async () => {
    const first = createFakeDb();
    configureChat({ db: first.db });
    await loose.rpc("ping", { n: 1 });
    expect(first.rpcCalls).toEqual([{ fn: "ping", args: { n: 1 } }]);
    expect(createClient()).toBe(first.db);

    // A reference captured before a new host is configured follows the new host.
    const { rpc } = loose;
    const second = createFakeDb();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    configureChat({ db: second.db });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/different `db`/));
    warn.mockRestore();
    await loose.rpc("pong", {});
    expect(second.rpcCalls).toEqual([{ fn: "pong", args: {} }]);
    expect(first.rpcCalls).toHaveLength(1);
    // The destructured method stays bound to the client it was read from.
    await rpc("late", {});
    expect(first.rpcCalls.map((c) => c.fn)).toEqual(["ping", "late"]);
  });

  it("methods run with the client itself as `this`, even when read off the seam", () => {
    const client = {
      auth: {},
      rpc() {},
      from(this: unknown) {
        return this === client;
      },
    };
    configureChat({ db: client as unknown as ChatDb });
    const from = (supabase as unknown as { from(): boolean }).from;
    expect(from()).toBe(true);
  });

  it("schedulerDb scopes the given client to the scheduler schema", () => {
    const schema = jest.fn(() => "scoped");
    expect(schedulerDb({ schema } as unknown as ChatDb)).toBe("scoped");
    expect(schema).toHaveBeenCalledWith("scheduler");
  });
});

describe("the db seam is loud", () => {
  it("a member access before any host is configured throws ChatHostNotConfiguredError with the remedy", () => {
    expect(() => supabase.from).toThrow(ChatHostNotConfiguredError);
    expect(() => supabase.from).toThrow(/configureChat\(\{ db \}\)/);
    expect(() => createClient()).toThrow(ChatHostNotConfiguredError);
    expect(() => "from" in supabase).toThrow(ChatHostNotConfiguredError);
  });
});

describe("getClaimsUser reads the caller from the token, never the auth server", () => {
  const client = (result: unknown) => ({
    auth: { getClaims: jest.fn(async () => result) },
  });

  it("no session is a settled signed-out, not an error", async () => {
    const missing = new AuthSessionMissingError();
    await expect(
      getClaimsUser(client({ data: null, error: missing }) as never),
    ).resolves.toEqual({ data: { user: null }, error: null });
    await expect(
      getClaimsUser(client({ data: { claims: undefined }, error: null }) as never),
    ).resolves.toEqual({ data: { user: null }, error: null });
  });

  it("verified claims become a user whose id is sub", async () => {
    const { data, error } = await getClaimsUser(
      client({ data: { claims: { sub: "u-1", email: "a@b.c" } }, error: null }) as never,
    );
    expect(error).toBeNull();
    expect(data.user).toMatchObject({
      id: "u-1",
      email: "a@b.c",
      app_metadata: {},
      user_metadata: {},
    });
  });

  it("an unreachable authority keeps its error, so a retry still fires", async () => {
    const outage = new AuthError("fetch failed", 0);
    const result = await getClaimsUser(client({ data: null, error: outage }) as never);
    expect(result).toEqual({ data: { user: null }, error: outage });
  });

  it("a verified token without sub is malformed, not signed out", async () => {
    const { data, error } = await getClaimsUser(
      client({ data: { claims: { email: "x@y.z" } }, error: null }) as never,
    );
    expect(data.user).toBeNull();
    expect(error?.code).toBe("bad_jwt");
  });
});
