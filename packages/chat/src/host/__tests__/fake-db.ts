/**
 * A structural Supabase stand-in for host tests: records every rpc call and
 * lets a test choose the session. Only the surface the host defaults touch.
 */

import type { ChatDb } from "../contract";

export interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

export interface FakeDb {
  db: ChatDb;
  rpcCalls: RpcCall[];
  setSession(user: { id: string; email?: string } | null): void;
  rpcError: { message: string } | null;
}

export function createFakeDb(): FakeDb {
  let session: {
    user: { id: string; email?: string; user_metadata: object };
    access_token: string;
  } | null = null;
  const fake: FakeDb = {
    db: null as unknown as ChatDb,
    rpcCalls: [],
    rpcError: null,
    setSession(user) {
      session = user
        ? {
            user: { ...user, user_metadata: {} },
            access_token: `token-${user.id}`,
          }
        : null;
    },
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
  };
  const db = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      fake.rpcCalls.push({ fn, args });
      return { data: null, error: fake.rpcError };
    },
    from: () => query,
    schema: () => ({ from: () => query }),
  };
  fake.db = db as unknown as ChatDb;
  return fake;
}
