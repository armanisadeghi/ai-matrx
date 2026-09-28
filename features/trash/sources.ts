/**
 * TRASH SOURCES — personal Trash is the merge of every place archived rows live.
 *
 *   #1 main   the main-DB registry (`trash_list` / `trash_counts` / `entity_undelete`). Every
 *             kind registered in `platform.entity_types` arrives here with no code change.
 *   #2 cms    the CMS database (a separate Postgres, CMS migration 0041), through
 *             `/api/cms/trash`. A main-DB function cannot read it, so it can never join #1.
 *
 * A new database that holds user content becomes source #3 here; TrashList never learns its name.
 * A source that is "not live" (its archive column has not landed) contributes no kind, no row and
 * no error — nothing is archived there yet, so there is nothing to show and nothing to apologise for.
 *
 * Organization Trash (org settings → Trash) stays on the main-DB org doors only: its restore is
 * audited in the organization's log and tells the item's owner, which the CMS door does not do.
 * An org admin already reaches every org site they may restore from personal /trash, because the
 * CMS access rule gives org admins the site's admin level.
 */

import {
  getTrashCounts,
  listTrash,
  restoreFromTrash,
  type TrashCount,
  type TrashItem,
} from "@/features/trash/service";
import {
  isCmsTrashToken,
  type CmsRestoreNotice,
  type CmsTrashListResponse,
  type CmsTrashRestoreResponse,
} from "@/features/trash/cmsKinds";

export interface TrashRestoreOutcome {
  /** Sentences the restore wants the person to read (a CMS door's `notices`), shown as written. */
  notices: string[];
}

export interface TrashSourceListOptions {
  kinds?: string[];
  /** Per kind, as `trash_list` pages. */
  limit: number;
  offset: number;
}

export interface TrashSource {
  id: string;
  /** True when this source restores rows of this entity token. */
  owns(entityToken: string): boolean;
  /** Per-kind totals, or `null` when the source is not live (contributes nothing). */
  counts(): Promise<TrashCount[] | null>;
  list(opts: TrashSourceListOptions): Promise<TrashItem[]>;
  restore(item: TrashItem): Promise<TrashRestoreOutcome>;
}

export const mainTrashSource: TrashSource = {
  id: "main",
  owns: (token) => !isCmsTrashToken(token),
  counts: () => getTrashCounts(),
  list: (opts) => listTrash(opts),
  restore: async (item) => {
    await restoreFromTrash(item.entity_token, item.id);
    return { notices: [] };
  },
};

const CMS_TRASH_URL = "/api/cms/trash";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Not JSON; the fallback says what failed.
  }
  return `${fallback} (${res.status})`;
}

async function cmsList(params: URLSearchParams): Promise<CmsTrashListResponse> {
  const qs = params.toString();
  const res = await fetch(qs ? `${CMS_TRASH_URL}?${qs}` : CMS_TRASH_URL, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(await readError(res, "Could not load archived site content"));
  return (await res.json()) as CmsTrashListResponse;
}

/** Each notice's own sentence, verbatim; a notice without one is named by its kind. */
export function noticeSentences(notices: readonly CmsRestoreNotice[] | undefined): string[] {
  return (notices ?? [])
    .map((n) => (typeof n?.message === "string" && n.message.trim() ? n.message.trim() : n?.kind))
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

export const cmsTrashSource: TrashSource = {
  id: "cms",
  owns: (token) => isCmsTrashToken(token),
  counts: async () => {
    const res = await cmsList(new URLSearchParams({ limit: "0" }));
    return res.live ? res.counts : null;
  },
  list: async (opts) => {
    const kinds = opts.kinds?.filter(isCmsTrashToken);
    if (opts.kinds && (!kinds || kinds.length === 0)) return [];
    const params = new URLSearchParams({ limit: String(opts.limit), offset: String(opts.offset) });
    if (kinds) params.set("kinds", kinds.join(","));
    const res = await cmsList(params);
    return res.live ? res.items : [];
  },
  restore: async (item) => {
    const res = await fetch(CMS_TRASH_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: item.entity_token, id: item.id }),
    });
    if (!res.ok) throw new Error(await readError(res, "Could not restore"));
    const body = (await res.json()) as CmsTrashRestoreResponse;
    return { notices: noticeSentences(body.notices) };
  },
};

/** Personal Trash, in order. */
export const PERSONAL_TRASH_SOURCES: readonly TrashSource[] = [mainTrashSource, cmsTrashSource];

export interface MergedTrashCounts {
  counts: TrashCount[];
  /** artifact_kind → the source that lists it. */
  kindSource: Map<string, TrashSource>;
}

/**
 * Every live source's counts, as one list. The main source failing throws (the page's own error);
 * another source failing is reported through `onSourceError` and leaves the rest standing — a
 * CMS outage must never hide a person's archived notes.
 */
export async function mergeTrashCounts(
  sources: readonly TrashSource[],
  onSourceError?: (source: TrashSource, error: unknown) => void,
): Promise<MergedTrashCounts> {
  const settled = await Promise.allSettled(sources.map((s) => s.counts()));
  const counts: TrashCount[] = [];
  const kindSource = new Map<string, TrashSource>();
  settled.forEach((result, i) => {
    const source = sources[i];
    if (result.status === "rejected") {
      if (i === 0) throw result.reason;
      onSourceError?.(source, result.reason);
      return;
    }
    for (const c of result.value ?? []) {
      if (kindSource.has(c.artifact_kind)) continue;
      counts.push(c);
      kindSource.set(c.artifact_kind, source);
    }
  });
  return { counts, kindSource };
}

/**
 * One page of rows. With a kind, only the source that lists it is asked. Without one (the
 * "Recent" overview) every source that has anything is asked and the rows merge newest first.
 */
export async function listMergedTrash(
  sources: readonly TrashSource[],
  kindSource: Map<string, TrashSource>,
  opts: TrashSourceListOptions,
): Promise<TrashItem[]> {
  if (opts.kinds && opts.kinds.length > 0) {
    const owner = kindSource.get(opts.kinds[0]) ?? sources[0];
    return (await owner.list(opts)).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  }
  const listed = new Set(kindSource.values());
  const asked = sources.filter((s, i) => i === 0 || listed.has(s));
  const pages = await Promise.all(asked.map((s) => s.list(opts)));
  return pages.flat().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
}

export function sourceForItem(sources: readonly TrashSource[], item: TrashItem): TrashSource {
  return sources.find((s) => s.owns(item.entity_token)) ?? sources[0];
}
