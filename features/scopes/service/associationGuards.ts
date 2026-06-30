// features/scopes/service/associationGuards.ts
//
// Pre-flight VALIDATION for the unified association edge. Every write/read that
// goes through `associationsService` runs these guards BEFORE the RPC fires, so
// the two classes of failure that keep biting us surface as a clean, described
// `invalid_argument` error at the callsite — never as an opaque Postgres error
// (`22P02 invalid input syntax for type uuid`, `23503 foreign key violation`)
// chased through Supabase logs.
//
// The two classes:
//   1. A non-UUID id — e.g. an agent passing a "cute" string literal instead of
//      a real row uuid. The DB column is `uuid`, so this throws `22P02` there;
//      we catch it here first with the exact field + value.
//   2. An unregistered type token — the `source_type`/`target_type` FK to
//      `platform.entity_types.token` is ENFORCED, so a guessed/phantom token
//      throws `23503` there; the generated `isEntityTypeToken` set lets us
//      reject it here with a clear message instead.
//
// LOUD by doctrine: a guard firing means a real code bug got this far, so it is
// logged to the console (not silently swallowed) on its way to becoming an
// `invalid_argument` result.

import type { ScopesRpcError } from "@/features/scopes/types";
import { isEntityTypeToken } from "@/types/generated/entity-types.generated";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a syntactically valid UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return String(value);
  return JSON.stringify(value);
}

function invalid(field: string, value: unknown, reason: string): ScopesRpcError {
  const msg = `association ${field} ${reason} (got ${show(value)})`;
  console.error(`[associations] invalid argument — ${msg}`);
  return { code: "invalid_argument", message: msg };
}

/** A single id must be a real UUID. Kills the "cute text id" class of bug. */
export function checkUuid(field: string, value: unknown): ScopesRpcError | null {
  return isUuid(value) ? null : invalid(field, value, "must be a UUID");
}

/** Every id in an array must be a real UUID. */
export function checkUuidArray(
  field: string,
  values: readonly unknown[],
): ScopesRpcError | null {
  for (let i = 0; i < values.length; i++) {
    if (!isUuid(values[i]))
      return invalid(`${field}[${i}]`, values[i], "must be a UUID");
  }
  return null;
}

/** A type token must be registered in `platform.entity_types`. */
export function checkToken(
  field: string,
  value: unknown,
): ScopesRpcError | null {
  if (typeof value !== "string" || value.length === 0)
    return invalid(field, value, "must be a non-empty entity-type token");
  if (!isEntityTypeToken(value))
    return invalid(
      field,
      value,
      "is not a registered entity type (platform.entity_types) — " +
        "add it to the registry + regenerate, never guess a token",
    );
  return null;
}

/** Return the first failing check, or null if all pass. */
export function firstError(
  ...checks: (ScopesRpcError | null)[]
): ScopesRpcError | null {
  for (const c of checks) if (c) return c;
  return null;
}
