/**
 * Collection item ORDERING — the admin twin of what "first" means.
 *
 * Three implementations, one meaning, pinned by the language-neutral fixture
 * `collection-ordering-rules.json` (copied verbatim from aidream, never edited
 * here — `pnpm check:collection-ordering` fails on drift):
 *
 *   - `aidream/services/cms/collection_ordering.py`  — CANONICAL, agent surface
 *   - `my-matrx/lib/collections/ordering.js`         — visitor HTTP + SSR
 *   - this file                                      — the admin API
 *
 * Why it exists: my-matrx honoured `site_collections.settings.default_order` on
 * the published page from 2026-08-11, while this repo's `/api/cms/collections`
 * and aidream's service both hardcoded `created_at DESC`. An events collection
 * declaring `starts_at:asc` therefore read chronologically to a visitor and
 * newest-first in the admin grid the author was editing it from — the grid and
 * the page disagreeing about their own data.
 *
 * Precedence: a per-request `order` → `settings.default_order` → the historical
 * `created_at:desc`, so a collection that declares nothing is byte-for-byte
 * unchanged.
 *
 * ALLOWLIST. Public surfaces restrict sort fields to `created_at`/`id` +
 * `public_read_fields` — sorting by a field the caller cannot read is an
 * oracle. The ADMIN surface is privileged (`allowAllFields: true`): it already
 * renders every field of every row, so refusing to sort by one would be theatre.
 *
 * DB-SIDE, ALWAYS, with `id` as the final tiebreak in the same direction —
 * without it rows duplicate across pages and others vanish. `nullsFirst: false`
 * in BOTH directions so a row missing the sort field sorts last; Postgres
 * defaults NULLs FIRST on DESC, which would head an events list with the events
 * that have no date.
 *
 * KNOWN LIMIT — jsonb values compare as TEXT (lexical). Correct for the UTC
 * ISO-8601 datetimes the platform emits; `10` sorts before `9`. Fixed when it
 * bites with a typed expression index, NEVER by sorting in JS: sorting a fetched
 * page returns "the 20 newest, re-shuffled" instead of "the first 20 in this
 * order" — the exact bug this module exists to kill.
 */

/** What every collection ordered before ordering was configurable. */
export const DEFAULT_ORDER = "created_at:desc";

/** Real columns on `site_collection_items`; everything else is a jsonb path. */
const REAL_COLUMNS = new Set(["created_at", "id"]);

const FIELD_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface OrderSpec {
  field: string;
  ascending: boolean;
}

export interface ResolveOrderArgs {
  /** Caller-supplied spec (`?order=`, an API argument). */
  requested?: unknown;
  /** `site_collections.settings`. */
  settings?: unknown;
  /** `public_read_fields` — public surfaces only. */
  allowedFields?: string[] | null;
  /** Privileged surfaces (admin, agent) that already read the whole row. */
  allowAllFields?: boolean;
}

/**
 * Parse a `field[:asc|desc]` spec. Returns null on anything malformed —
 * callers fall back rather than guessing, and the API 400s.
 */
export function parseOrderSpec(spec: unknown): OrderSpec | null {
  if (typeof spec !== "string") return null;
  const trimmed = spec.trim();
  if (!trimmed) return null;
  const [field, direction = "asc", ...rest] = trimmed.split(":");
  if (rest.length > 0) return null;
  if (!FIELD_RE.test(field)) return null;
  const dir = direction.trim().toLowerCase();
  if (dir !== "asc" && dir !== "desc") return null;
  return { field, ascending: dir === "asc" };
}

/** True for a real table column, false for a `data` jsonb path. */
export function isRealColumn(field: string): boolean {
  return REAL_COLUMNS.has(field);
}

/** The PostgREST column expression for a sort field. */
export function orderColumn(field: string): string {
  return isRealColumn(field) ? field : `data->>${field}`;
}

/**
 * Resolve the order for one read.
 *
 * `error` is set ONLY for a CALLER-supplied spec that is malformed or not
 * allowed — a bad `settings.default_order` warns and falls back, because a typo
 * in a collection setting must never 4xx anyone.
 */
export function resolveOrderSpec({
  requested,
  settings,
  allowedFields,
  allowAllFields = false,
}: ResolveOrderArgs = {}): { order: OrderSpec | null; error: string | null } {
  const allowed = (field: string): boolean =>
    allowAllFields ||
    REAL_COLUMNS.has(field) ||
    (Array.isArray(allowedFields) && allowedFields.includes(field));

  if (requested !== undefined && requested !== null && requested !== "") {
    const parsed = parseOrderSpec(requested);
    if (!parsed) return { order: null, error: "invalid_order" };
    if (!allowed(parsed.field)) return { order: null, error: "invalid_order" };
    return { order: parsed, error: null };
  }

  const declared =
    settings && typeof settings === "object" &&
    typeof (settings as Record<string, unknown>).default_order === "string"
      ? ((settings as Record<string, unknown>).default_order as string)
      : null;

  if (declared) {
    const parsed = parseOrderSpec(declared);
    if (parsed && allowed(parsed.field)) return { order: parsed, error: null };
    console.warn(
      `[cms/collections] ignoring unusable settings.default_order ${JSON.stringify(declared)} — ` +
        "must be `field[:asc|desc]` and readable on this surface",
    );
  }

  return { order: parseOrderSpec(DEFAULT_ORDER), error: null };
}

/**
 * Apply a resolved order to a supabase-js query.
 *
 * Both invariants are load-bearing and are explained at the top of this file:
 * `id` is always the final tiebreak in the same direction, and NULLs sort last
 * in both directions.
 */
export function applyOrder<T extends {
  order: (column: string, opts: { ascending: boolean; nullsFirst: boolean }) => T;
}>(query: T, order: OrderSpec | null): T {
  const spec = order ?? (parseOrderSpec(DEFAULT_ORDER) as OrderSpec);
  const q = query.order(orderColumn(spec.field), {
    ascending: spec.ascending,
    nullsFirst: false,
  });
  return spec.field === "id"
    ? q
    : q.order("id", { ascending: spec.ascending, nullsFirst: false });
}
