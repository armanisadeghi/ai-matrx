// ─────────────────────────────────────────────────────────────────────────
// WIKILINK RESOLUTION — `[[Page]]` → the real record, BATCHED.
//
//   [[Quarterly plan]]                  a note with that title (case-insensitive)
//   [[Quarterly plan#Budget]]           …then the #Budget heading on that page
//   [[note:<uuid>]] / [[project:<uuid>|x]] a record named by token + id — VERIFIED
//                                        to exist and be readable before it links
//
// Every link rendered in the same tick joins ONE batch: one read of the
// registry-backed notes table for all titles and note ids (plus one read per
// OTHER token named by id), under the viewer's own session and RLS. (Before:
// one search RPC per entity type per link — 341 calls for 4 links.)
//
// Honest states:
//   found        a real link (registry `hrefFor`)
//   missing      signed in, the search ran, no page by that title → Create
//   unavailable  signed out, refused, or the named record does not exist /
//                is not readable → "not available", never Create, never a link
//
// Loaded lazily by the wikilink element (never in the core's first chunk).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/client";
import { createEntityRow } from "@/features/scopes/service/entityRows";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@ai-matrx/associations";

export type WikiResolution =
  | { status: "found"; token: string; id: string; title: string; href: string | null; typeLabel: string }
  | { status: "missing"; title: string }
  | { status: "unavailable"; title: string; message: string };

const DIRECT = /^([a-z][a-z0-9_]*):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const TITLE_TOKEN = "note";

const cache = new Map<string, Promise<WikiResolution>>();
let pending: Map<string, { target: string; settle: (r: WikiResolution) => void }> | null = null;

/** Test hook: how many batches ran (a batch is one resolver round). */
export const wikiResolverStats = { batches: 0 };

export function splitHeading(target: string): { page: string; heading: string | null } {
  const hash = target.indexOf("#");
  if (hash < 0) return { page: target.trim(), heading: null };
  return { page: target.slice(0, hash).trim(), heading: target.slice(hash + 1).trim() || null };
}

function slugify(text: string): string {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-");
}

function found(token: string, id: string, title: string, heading: string | null): WikiResolution {
  const info = tryGetEntityInfo(token);
  const base = info?.hrefFor?.(id) ?? null;
  return {
    status: "found",
    token,
    id,
    title,
    href: base ? (heading ? `${base}#user-content-${slugify(heading)}` : base) : null,
    typeLabel: info?.label ?? token,
  };
}

function unavailable(title: string, message: string): WikiResolution {
  return { status: "unavailable", title, message };
}

/** A PostgREST `or` filter value, quoted and escaped (commas, parens, quotes, wildcards). */
function quoted(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

type Row = { id: string; title: string };

async function readRows(
  token: string,
  titles: string[],
  ids: string[],
): Promise<{ rows: Row[] } | { error: string }> {
  const info = tryGetEntityInfo(token);
  if (!info || !info.titleColumn) return { error: `"${token}" records cannot be linked by name.` };
  const col = info.titleColumn;
  const filters = [
    ...(ids.length ? [`id.in.(${ids.join(",")})`] : []),
    ...titles.map((t) => `${col}.ilike.${quoted(t)}`),
  ];
  if (filters.length === 0) return { rows: [] };
  const supabase = createClient();
  const query = supabase
    .schema(info.schema as "public")
    .from(info.table as never)
    .select(`id, ${col}`)
    .or(filters.join(","))
    .limit(Math.max(50, (titles.length + ids.length) * 5));
  const { data, error } = await query;
  if (error) return { error: error.message };
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      title: String(r[col] ?? ""),
    })),
  };
}

async function runBatch(batch: Map<string, { target: string; settle: (r: WikiResolution) => void }>): Promise<void> {
  wikiResolverStats.batches++;
  const entries = [...batch.values()];
  const settleAll = (fn: (target: string) => WikiResolution) => entries.forEach((e) => e.settle(fn(e.target)));

  const supabase = createClient();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    settleAll((t) => unavailable(splitHeading(t).page, "Sign in to open linked pages."));
    return;
  }

  // Group: titles (notes) and direct ids per token.
  const titles = new Set<string>();
  const idsByToken = new Map<string, Set<string>>();
  for (const { target } of entries) {
    const { page } = splitHeading(target);
    const direct = DIRECT.exec(page);
    if (direct) {
      const token = (direct[1] ?? "").toLowerCase();
      const set = idsByToken.get(token) ?? new Set<string>();
      set.add((direct[2] ?? "").toLowerCase());
      idsByToken.set(token, set);
    } else if (page) {
      titles.add(page);
    }
  }

  const results = new Map<string, { rows: Row[] } | { error: string }>();
  const tokens = new Set<string>([...idsByToken.keys(), ...(titles.size ? [TITLE_TOKEN] : [])]);
  await Promise.all(
    [...tokens].map(async (token) => {
      const ids = [...(idsByToken.get(token) ?? [])];
      const names = token === TITLE_TOKEN ? [...titles] : [];
      results.set(token, await readRows(token, names, ids).catch((e: unknown) => ({ error: String(e) })));
    }),
  );

  settleAll((target) => {
    const { page, heading } = splitHeading(target);
    const direct = DIRECT.exec(page);
    if (direct) {
      const token = (direct[1] ?? "").toLowerCase();
      const id = (direct[2] ?? "").toLowerCase();
      const res = results.get(token);
      if (!res || "error" in res) return unavailable(page, res && "error" in res ? res.error : "This link could not be checked.");
      const row = res.rows.find((r) => r.id.toLowerCase() === id);
      return row ? found(token, row.id, row.title || page, heading) : unavailable(page, "This record does not exist or you cannot open it.");
    }
    const res = results.get(TITLE_TOKEN);
    if (!res || "error" in res) return unavailable(page, res && "error" in res ? res.error : "This link could not be checked.");
    const row = res.rows.find((r) => r.title.trim().toLowerCase() === page.toLowerCase());
    return row ? found(TITLE_TOKEN, row.id, row.title, heading) : { status: "missing", title: page };
  });
}

export function resolveWikiTarget(target: string): Promise<WikiResolution> {
  const key = target.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = new Promise<WikiResolution>((resolve) => {
    if (!pending) {
      pending = new Map();
      // Every link rendered in this tick joins the same batch.
      setTimeout(() => {
        const batch = pending;
        pending = null;
        if (!batch) return;
        runBatch(batch).catch((err: unknown) => {
          batch.forEach((e) => e.settle(unavailable(splitHeading(e.target).page, err instanceof Error ? err.message : String(err))));
        });
      }, 0);
    }
    pending.set(key, { target, settle: resolve });
  });
  // A refusal is not cached: signing in or gaining access re-checks.
  cache.set(key, promise);
  promise.then((r) => {
    if (r.status === "unavailable") cache.delete(key);
  });
  return promise;
}

/** Create the missing page as a note named `title`; primes the cache so every link to it resolves. */
export async function createWikiPage(
  title: string,
  orgId: string | null,
): Promise<{ ok: true; href: string | null } | { ok: false; error: string }> {
  const token = TITLE_TOKEN as EntityTypeToken;
  const result = await createEntityRow(token, { title, orgId });
  if (!result.ok) return { ok: false, error: result.error };
  const resolution = found(token, result.data.id, result.data.title, null);
  cache.set(title.trim().toLowerCase(), Promise.resolve(resolution));
  return { ok: true, href: resolution.status === "found" ? resolution.href : null };
}
