/**
 * Utilities for consuming Supabase RPC return types with safe TypeScript checking.
 *
 * Problem: Supabase generates `Json` for any JSONB/JSON column. `Json` is a
 * wide recursive union (string | number | boolean | null | {...} | Json[]).
 * When your interface field says `settings: LLMParams`, TypeScript rejects the
 * assignment because `Json` is not assignable to `LLMParams` — even though at
 * runtime the data is exactly right.
 *
 * Solution: `DbRpcRow<F>` replaces every `Json` occurrence in the generated
 * return type with `unknown`. This produces a type you can structurally compare
 * against your own interface without fighting the Json union, while still
 * enforcing that every non-Json field (string, number, boolean, string[], etc.)
 * matches exactly.
 *
 * Usage — enforce that your interface matches the DB row at compile time:
 *
 *   import type { DbRpcRow } from "@/types/supabase-rpc";
 *
 *   // In thunks.ts or types.ts, next to the interface:
 *   export interface AgentVersionHistoryItem
 *     extends DbRpcRow<"agx_get_version_history"> {
 *     // No body needed — the extends IS the check.
 *     // Add fields here only when you need to narrow a type beyond what the DB returns.
 *   }
 *
 *   // OR use satisfies for interfaces that already exist:
 *   export interface AgentExecutionFull { ... }
 *   true satisfies AgentExecutionFull extends DbRpcRow<"agx_get_execution_full"> ? true : false;
 *
 * Casting in thunks — zero runtime code:
 *
 *   const row = (data as unknown[])[0] as DbRpcRow<"agx_get_execution_full">;
 *   // or directly as your interface since it extends DbRpcRow:
 *   const row = (data as unknown[])[0] as AgentExecutionFull;
 */

import type { ChatDatabase as Database } from "../host/db-types";

/**
 * Identity type — preserved for historical call sites and docs.
 *
 * The generated `Json` alias is patched to `unknown` (see `scripts/patch-db-types.sh`),
 * so the row types already use `unknown` wherever the DB has a JSON column. No
 * per-field substitution is needed, which means this type is effectively the
 * identity transform. The old recursive `T extends Json` mapping short-circuited
 * to `unknown` for every `T` once `Json` became `unknown`, so keeping it around
 * would silently wipe every field's type — hence the rewrite.
 */
export type JsonToUnknown<T> = T;

/**
 * The single row type returned by a Supabase RPC function,
 * with all `Json` fields replaced by `unknown`.
 *
 * For RPCs that return `Json` directly (not a typed row object),
 * this resolves to `unknown` — which is intentional.
 * Those RPCs have no DB-level schema to enforce.
 */
export type DbRpcRow<F extends keyof Database["public"]["Functions"]> =
  JsonToUnknown<
    Database["public"]["Functions"][F]["Returns"] extends Array<infer Row>
      ? Row
      : Database["public"]["Functions"][F]["Returns"]
  >;
