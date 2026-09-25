// ─────────────────────────────────────────────────────────────────────────
// WIKILINK RESOLUTION — `[[Page]]` → the real record, through the platform's
// ONE cross-entity search (`@ai-matrx/associations` searchCandidatesAcrossTokens,
// the same sweep the universal association picker runs) and the ONE route
// table (the entity registry's `hrefFor`).
//
//   [[Quarterly plan]]                  exact title match, notes first
//   [[Quarterly plan#Budget]]           …then the #Budget heading on that page
//   [[note:<uuid>]] / [[note:<uuid>|x]] a record named by token + id
//
// Loaded lazily by the wikilink element (never in the core's first chunk).
// Results are cached per target for the page's lifetime; a create primes it.
// ─────────────────────────────────────────────────────────────────────────

import { searchCandidatesAcrossTokens } from "@/features/scopes/service/associationCandidates";
import { createEntityRow } from "@/features/scopes/service/entityRows";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@ai-matrx/associations";

export type WikiResolution =
  | { status: "found"; token: string; id: string; title: string; href: string | null; typeLabel: string }
  | { status: "missing"; title: string }
  | { status: "error"; title: string; message: string };

/** The kinds a bare `[[Title]]` looks for, in preference order. */
const PREFERRED_TOKENS = ["note", "doc", "document", "study_guide", "fc_set", "project", "task", "canvas_item", "file"];

const DIRECT = /^([a-z][a-z0-9_]*):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const cache = new Map<string, Promise<WikiResolution>>();

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
    href: base ? (heading ? `${base}#${slugify(heading)}` : base) : null,
    typeLabel: info?.label ?? token,
  };
}

async function lookup(target: string): Promise<WikiResolution> {
  const { page, heading } = splitHeading(target);
  const direct = DIRECT.exec(page);
  if (direct) {
    const token = (direct[1] ?? "").toLowerCase();
    if (!tryGetEntityInfo(token)) {
      return { status: "error", title: page, message: `"${token}" is not a kind of record this platform knows.` };
    }
    return found(token, direct[2] ?? "", page, heading);
  }
  if (!page) return { status: "missing", title: target };
  const results = await searchCandidatesAcrossTokens({ search: page, perTokenLimit: 5 });
  const wanted = page.toLowerCase();
  const exact = results.filter((r) => r.title.trim().toLowerCase() === wanted);
  if (exact.length === 0) return { status: "missing", title: page };
  exact.sort((a, b) => rank(a.token) - rank(b.token));
  const best = exact[0];
  if (!best) return { status: "missing", title: page };
  return found(best.token, best.id, best.title, heading);
}

function rank(token: string): number {
  const i = PREFERRED_TOKENS.indexOf(token);
  return i < 0 ? PREFERRED_TOKENS.length : i;
}

export function resolveWikiTarget(target: string): Promise<WikiResolution> {
  const key = target.trim().toLowerCase();
  let pending = cache.get(key);
  if (!pending) {
    pending = lookup(target).catch((err: unknown) => {
      cache.delete(key);
      return {
        status: "error" as const,
        title: target,
        message: err instanceof Error ? err.message : "The search did not answer.",
      };
    });
    cache.set(key, pending);
  }
  return pending;
}

/** Create the missing page as a note named `title`; primes the cache so every link to it resolves. */
export async function createWikiPage(
  title: string,
  orgId: string | null,
): Promise<{ ok: true; href: string | null } | { ok: false; error: string }> {
  const token = "note" as EntityTypeToken;
  const result = await createEntityRow(token, { title, orgId });
  if (!result.ok) return { ok: false, error: result.error };
  const resolution = found(token, result.data.id, result.data.title, null);
  cache.set(title.trim().toLowerCase(), Promise.resolve(resolution));
  return { ok: true, href: resolution.status === "found" ? resolution.href : null };
}
