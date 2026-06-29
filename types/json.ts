/**
 * Canonical JSON value types + narrowing guards.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 * This repo patches the Supabase-generated `Json` alias to `unknown`
 * (scripts/patch-db-types.sh) so that typed objects are freely assignable INTO
 * JSONB columns on the write side. The cost lands on the READ side: a JSONB
 * column comes back as bare `unknown`, and to do anything with it you must
 * narrow it.
 *
 * The lazy/cheating reaction (the #1 source of `as unknown as` in the codebase)
 * is to cast the WHOLE row — `row as unknown as MyTypedRow` — which re-asserts
 * every already-correctly-typed column just to reach the one `unknown` JSON
 * field. That silently discards real type information and is exactly the
 * "type cheating" this system exists to kill.
 *
 * The honest move is to narrow ONLY the JSON field, and to have a real name for
 * "this is just a JSON object, accept it" that is NOT `any` and NOT a bare
 * `unknown`:
 *
 *   import { type JsonObject, isJsonObject } from "@/types/json";
 *
 *   // 1. "It's just an object" — type the ONE field, leave the row typed:
 *   interface MyRow { id: string; name: string; config: JsonObject }
 *
 *   // 2. Narrowing a bare `unknown` DB field honestly (runtime-checked):
 *   const cfg = isJsonObject(row.config) ? row.config : undefined;
 *   //    cfg is JsonObject | undefined — no cast, no `any`, no whole-row nuke.
 *
 *   // 3. Reading a leaf — JsonObject values are JsonValue, narrow as needed:
 *   const label = typeof cfg?.label === "string" ? cfg.label : null;
 *
 * For a concrete, known shape (an API/DB frame), prefer a Zod parse at the
 * boundary (see TYPESCRIPT_STANDARDS.md §4). These types are for the genuinely
 * open / loosely-shaped JSON the standards doc calls "just an object" — they
 * give it an honest name so nobody reaches for `any` or a whole-row cast.
 */

export type JsonPrimitive = string | number | boolean | null;

/**
 * A JSON object. Values are `JsonValue | undefined` so optional keys read
 * cleanly (mirrors Supabase's original generated `Json` object member).
 */
export interface JsonObject {
    [key: string]: JsonValue | undefined;
}

export type JsonArray = JsonValue[];

export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Narrow an `unknown` (e.g. a bare JSONB column) to a `JsonObject`.
 * Plain object only — arrays and `null` return false.
 */
export function isJsonObject(value: unknown): value is JsonObject {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

/** Narrow an `unknown` to a `JsonArray`. */
export function isJsonArray(value: unknown): value is JsonArray {
    return Array.isArray(value);
}

/** Narrow an `unknown` to a JSON primitive (string | number | boolean | null). */
export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
    return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    );
}
