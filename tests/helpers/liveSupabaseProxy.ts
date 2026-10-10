/**
 * The supabase client stand-in for `.live` suites that sign in inside `beforeAll`.
 *
 * `features/scopes/host/associationsStore.ts` hands the app client to
 * `@ai-matrx/associations` as its REQUIRED `dataSource` port, and the package refuses a port
 * with no `rpc`/`schema` the moment the store is built (module load, before `beforeAll` has
 * signed anyone in). So the proxy always answers `rpc`/`schema`/`from` with a forwarder that
 * resolves the signed-in client AT CALL TIME; every other member reads straight off the signed-in
 * client. Nothing is faked: a call made before sign-in fails loudly, naming that.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const PORT_METHODS = new Set<string | symbol>(["rpc", "schema", "from"]);

export function liveSupabaseProxy(holder: { client?: SupabaseClient }): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get: (_target, key) => {
      const live = holder.client as unknown as Record<string | symbol, unknown> | undefined;
      if (live) return live[key];
      if (PORT_METHODS.has(key)) {
        return () => {
          throw new Error(`live suite called supabase.${String(key)} before its beforeAll signed in`);
        };
      }
      return undefined;
    },
  });
}
