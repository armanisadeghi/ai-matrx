// lib/deep-link/resolveId.ts
//
// THE CLIENT HALF OF `/o/<id>`: ask `platform.resolve_id` and read its answer strictly.
//
// The door decides everything — which screen, which organization, whether this person may
// open it. This module only calls it and refuses to believe an answer it cannot read, because
// a half-read answer is a redirect to somewhere the door never said.
//
// Door: `matrx-frontend/migrations/campaign/openbyid_one_address_opens_any_id.sql`.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { OpenSide } from "./openPath";

/** What the door answers, one shape per state. */
export type ResolvedId =
  /** It opens. `path` already carries `?org=` naming the object's own organization. */
  | { state: "opens"; kind: string; organizationId: string | null; path: string; sides?: { old: boolean; new: boolean } }
  /** It is theirs and archived. Nothing was deleted. */
  | { state: "in_trash"; kind: string; organizationId: string | null; says: string }
  /** It is theirs and has no screen of its own (a column, a rule, a person row). */
  | { state: "no_screen"; kind: string; organizationId: string | null; says: string }
  /** `?side=` asked for a side of the table that is not there. */
  | { state: "no_such_side"; organizationId: string | null; sides: { old: boolean; new: boolean }; says: string }
  /** The address itself asked something that cannot be answered (a side word that is neither). */
  | { state: "refused"; says: string }
  /** No such id, or not theirs — the door says the same words either way. */
  | { state: "not_yours"; says: string }
  /**
   * The door could not be asked, or answered something unreadable. NOT an answer about access.
   * `doorAbsent` = the database does not carry `platform.resolve_id` yet (PostgREST PGRST202 /
   * Postgres 42883) — the one case a caller's fallback link may be used.
   */
  | { state: "unknown"; why: string; doorAbsent?: boolean };

/** The two ways "this function is not in the database" arrives through PostgREST. */
const DOOR_ABSENT_CODES = new Set(["PGRST202", "42883"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `raw` is an id the door can be asked about at all. */
export function isResolvableId(raw: string): boolean {
  return UUID.test(raw.trim());
}

/** Read `?side=`: only the two words mean anything; any other value is passed on for the door to refuse. */
export function readSide(raw: string | string[] | undefined): OpenSide | string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined || value.trim() === "") return undefined;
  return value.trim().toLowerCase();
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sidesOf(value: unknown): { old: boolean; new: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return typeof v.old === "boolean" && typeof v.new === "boolean" ? { old: v.old, new: v.new } : null;
}

/**
 * Parse the door's jsonb answer. Anything that is not exactly one of its shapes is `unknown`
 * with the reason — never guessed into a redirect.
 */
export function readResolvedId(data: unknown): ResolvedId {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { state: "unknown", why: "The door answered something that is not an answer." };
  }
  const d = data as Record<string, unknown>;
  const organizationId = text(d.organization_id);
  const says = text(d.says);
  switch (d.state) {
    case "opens": {
      const kind = text(d.kind);
      const path = text(d.path);
      // A path the door gives is always one of OUR screens. Anything else is refused, so this
      // page can never be turned into a redirect to another site.
      if (!kind || !path || !path.startsWith("/") || path.startsWith("//")) {
        return { state: "unknown", why: "The door said it opens, and gave no screen of ours to open." };
      }
      const sides = sidesOf(d.sides);
      return { state: "opens", kind, organizationId, path, ...(sides ? { sides } : {}) };
    }
    case "in_trash":
    case "no_screen": {
      const kind = text(d.kind);
      if (!kind || !says) return { state: "unknown", why: `The door's "${d.state}" answer was missing its words.` };
      return { state: d.state, kind, organizationId, says };
    }
    case "no_such_side": {
      const sides = sidesOf(d.sides);
      if (!sides || !says) return { state: "unknown", why: "The door's no-such-side answer was missing its words." };
      return { state: "no_such_side", organizationId, sides, says };
    }
    case "not_yours":
      return says
        ? { state: "not_yours", says }
        : { state: "unknown", why: "The door's not-yours answer was missing its words." };
    default:
      return { state: "unknown", why: `The door answered a state this page does not know (${String(d.state)}).` };
  }
}

/** Ask the one door, as the signed-in person the client carries. */
export async function resolveId(
  client: SupabaseClient,
  id: string,
  side?: string,
): Promise<ResolvedId> {
  const answered = await client
    .schema("platform" as never)
    // `platform.resolve_id` is not in the generated types until production carries it
    // (the chair applies it); the answer is read by `readResolvedId`, never trusted by type.
    .rpc("resolve_id" as never, { p_id: id, p_side: side ?? null } as never);
  if (answered.error) {
    // 22023 / 22004: the door refused the QUESTION in its own sentence (a side word that is
    // neither new nor old; no id). That is an answer, and it is said as one.
    if (answered.error.code === "22023" || answered.error.code === "22004") {
      return { state: "refused", says: answered.error.message };
    }
    return {
      state: "unknown",
      why: answered.error.message,
      ...(DOOR_ABSENT_CODES.has(answered.error.code ?? "") ? { doorAbsent: true } : {}),
    };
  }
  return readResolvedId(answered.data);
}
