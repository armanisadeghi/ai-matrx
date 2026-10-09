// lib/supabase/sharedRpcReads.ts — lane SHELL-DEDUPE
//
// A Supabase client whose NAMED read RPCs are shared per (person, function, arguments).
//
// For a package that owns its own reads (`@ai-matrx/messaging` asks `get_dm_conversations_with_details`
// and `get_dm_pending_soft_expiries` from inside its engine, once per engine start) the app cannot edit
// the call site, but it hands the package its client. Everything not named passes straight through, so
// the client's identity (session, auth, realtime) is exactly the original's.

import { createSharedReads } from "@/lib/sharedReads";

interface PostgrestAnswer {
  error?: unknown;
}

export function withSharedRpcReads<C extends object>(
  client: C,
  options: { rpcs: readonly string[]; person: () => string | null; ttlMs?: number },
): C {
  const named = new Set(options.rpcs);
  const reads = createSharedReads(options.ttlMs ?? 5_000);

  const wrapRpc = (schemaName: string, rpc: (...a: unknown[]) => unknown) =>
    (fn: string, args?: unknown, opts?: unknown) => {
      if (!named.has(fn)) return rpc(fn, args, opts);
      return reads.read(
        options.person(),
        `${schemaName}.${fn}:${JSON.stringify(args ?? null)}`,
        () => Promise.resolve(rpc(fn, args, opts) as PromiseLike<PostgrestAnswer>),
        { isFailure: (answer) => Boolean(answer?.error) },
      );
    };

  const passThrough = (target: object, prop: string | symbol) => {
    const value = Reflect.get(target, prop, target);
    return typeof value === "function" ? value.bind(target) : value;
  };

  return new Proxy(client, {
    get(target, prop) {
      if (prop === "schema") {
        return (name: string) => {
          const scoped = (target as unknown as { schema: (n: string) => object }).schema(name);
          return new Proxy(scoped, {
            get(inner, p) {
              if (p === "rpc") return wrapRpc(name, (inner as { rpc: (...a: unknown[]) => unknown }).rpc.bind(inner));
              return passThrough(inner, p);
            },
          });
        };
      }
      if (prop === "rpc") return wrapRpc("public", (target as { rpc: (...a: unknown[]) => unknown }).rpc.bind(target));
      return passThrough(target, prop);
    },
  });
}
