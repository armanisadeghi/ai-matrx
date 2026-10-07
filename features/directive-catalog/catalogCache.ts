/**
 * THE client cache of the directive catalog (`GET /directives/catalog`).
 *
 * The catalog is ~2.4 MB and the server answers in 5–7 s (measured
 * 2026-10-07), so a surface that fetches it on demand makes a person wait.
 * G11A review (2026-10-07): "Change…" in the reference picker showed skeletons
 * for 4–8 s on every open. Two layers fix that:
 *
 *   1. ONE in-flight/resolved promise per base URL for the tab's lifetime
 *      (`loadDirectiveCatalog`, `prefetchDirectiveCatalog`), so a surface can
 *      start the fetch the moment it opens and every later reader shares it;
 *   2. a SLIM persisted copy of what the action list needs — which writes each
 *      record type supports — so the actions are known instantly on the next
 *      visit (`cachedNounActions`). Every full load rewrites it, so it is the
 *      server's own last answer, refreshed each time a picker opens.
 *
 * The catalog is public and non-sensitive (no auth), so caching it in the
 * browser leaks nothing. Schemas (the write forms) are never persisted — only
 * the three yes/no flags per type.
 */

import { fetchDirectiveCatalog } from "@/features/directive-catalog/service";
import type {
  DirectiveCatalog,
  NounDirectives,
} from "@/features/directive-catalog/types";

/** The writes a record type supports, as the action list needs them. */
export interface NounActions {
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface Entry {
  promise: Promise<DirectiveCatalog>;
  resolved: DirectiveCatalog | null;
}

const entries = new Map<string, Entry>();

const STORAGE_PREFIX = "matrx:directive-catalog-actions:v1:";

interface SlimCatalog {
  savedAt: number;
  nouns: Record<string, NounActions>;
  aliases: Record<string, string>;
}

function readSlim(baseUrl: string): SlimCatalog | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + baseUrl);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SlimCatalog;
    return parsed && typeof parsed.nouns === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSlim(baseUrl: string, catalog: DirectiveCatalog): void {
  if (typeof window === "undefined") return;
  const nouns: Record<string, NounActions> = {};
  for (const n of catalog.nouns) nouns[n.noun] = actionsOf(n);
  const slim: SlimCatalog = {
    savedAt: Date.now(),
    nouns,
    aliases: (catalog.aliases ?? {}) as Record<string, string>,
  };
  try {
    window.localStorage.setItem(STORAGE_PREFIX + baseUrl, JSON.stringify(slim));
  } catch (error) {
    // Quota or privacy mode: the in-memory layer still works; say so once.
    console.warn("[directive-catalog] could not persist the action flags", error);
  }
}

export function actionsOf(noun: NounDirectives): NounActions {
  return {
    create: noun.create === "yes",
    update: noun.update === "yes",
    delete: noun.delete === "yes",
  };
}

/** The shared load: one request per base URL; a failure is retried next call. */
export function loadDirectiveCatalog(baseUrl: string): Promise<DirectiveCatalog> {
  const existing = entries.get(baseUrl);
  if (existing) return existing.promise;
  const entry: Entry = { promise: null as unknown as Promise<DirectiveCatalog>, resolved: null };
  entry.promise = fetchDirectiveCatalog(baseUrl).then(
    (catalog) => {
      entry.resolved = catalog;
      writeSlim(baseUrl, catalog);
      return catalog;
    },
    (err: unknown) => {
      entries.delete(baseUrl);
      throw err;
    },
  );
  entries.set(baseUrl, entry);
  return entry.promise;
}

/** Start the load now so the first reader does not wait; never throws. */
export function prefetchDirectiveCatalog(baseUrl: string | null | undefined): void {
  if (!baseUrl) return;
  loadDirectiveCatalog(baseUrl).catch((err: unknown) => {
    console.error("[directive-catalog] prefetch failed", err);
  });
}

/** The full catalog if it has already arrived in this tab — synchronously. */
export function peekDirectiveCatalog(baseUrl: string): DirectiveCatalog | null {
  return entries.get(baseUrl)?.resolved ?? null;
}

/** A real noun wins over an alias of the same name (`document` is both). */
export function findCatalogNoun(
  catalog: DirectiveCatalog,
  token: string,
  aliases: Readonly<Record<string, string>>,
): NounDirectives | null {
  const exact = catalog.nouns.find((n) => n.noun === token);
  if (exact) return exact;
  const canonical = aliases[token] ?? token;
  return catalog.nouns.find((n) => n.noun === canonical) ?? null;
}

/**
 * What a type supports, known WITHOUT waiting: from this tab's loaded catalog,
 * else from the persisted copy of the last one. `undefined` = not known yet
 * (show loading); `null` = known, and the catalog has no such type.
 */
export function cachedNounActions(
  baseUrl: string,
  token: string,
  aliases: Readonly<Record<string, string>>,
): NounActions | null | undefined {
  const full = peekDirectiveCatalog(baseUrl);
  if (full) {
    const noun = findCatalogNoun(full, token, aliases);
    return noun ? actionsOf(noun) : null;
  }
  const slim = readSlim(baseUrl);
  if (!slim) return undefined;
  const exact = slim.nouns[token];
  if (exact) return exact;
  const canonical = aliases[token] ?? slim.aliases[token] ?? token;
  return slim.nouns[canonical] ?? null;
}
