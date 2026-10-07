// features/spaces/publish/published-media.ts — uploaded covers and icons for a reader with no session (J1, Notion).
//
// The file system's public lane is a file whose visibility is public: the file service moves the object to the
// public CDN bucket, and `content.space_public_view` answers its CDN address (`media`). So publishing a page makes
// the files its cover and icon name (and its included sub-pages') public through the server's ONE change-visibility
// call (PATCH /files/{id} with visibility); unpublishing puts them back — but only the ones publishing made public.
// That is recorded on the file itself, `metadata.spaces_published_by = { <page id>: <visibility before> }`, so a
// file someone made public on purpose is never un-publicised, and a picture two published pages share stays public
// until the last of them is unpublished.

import * as Files from "@/features/files/api/files";
import { supabase } from "@/utils/supabase/client";

/** metadata key on a file: page id → the visibility the file had before publishing made it public. */
export const PUBLISHED_BY_KEY = "spaces_published_by";

type Marker = Record<string, string>;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** The uploaded-file ids a page's stored snapshot names as its cover or icon. */
export function mediaFileIds(snapshot: unknown): string[] {
  const out = new Set<string>();
  const s = snapshot && typeof snapshot === "object" ? (snapshot as Record<string, unknown>) : {};
  for (const key of ["cover", "icon"] as const) {
    const m = s[key];
    if (m && typeof m === "object") {
      const id = (m as Record<string, unknown>).fileId;
      if (typeof id === "string" && UUID.test(id)) out.add(id);
    }
  }
  return [...out];
}

export function readMarker(metadata: unknown): Marker {
  const raw = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[PUBLISHED_BY_KEY] : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"));
}

export type MediaMove =
  | { kind: "none" }
  | { kind: "publish"; before: string; marker: Marker }
  | { kind: "share"; marker: Marker }
  | { kind: "release"; marker: Marker; back: string }
  | { kind: "drop"; marker: Marker };

/** What to do to one file when page `pageId` goes on the web (`on`) or off it. Pure: the rules, in one place. */
export function decideMediaMove(file: { visibility: string; published: boolean; metadata: unknown }, pageId: string, on: boolean): MediaMove {
  const marker = readMarker(file.metadata);
  const isPublic = file.published || file.visibility === "public";
  if (on) {
    // Already public: either someone made it public on purpose (no marker, leave it) or another page did (join them).
    if (isPublic) return Object.keys(marker).length > 0 && !(pageId in marker) ? { kind: "share", marker: { ...marker, [pageId]: Object.values(marker)[0] } } : { kind: "none" };
    return { kind: "publish", before: file.visibility || "personal", marker: { ...marker, [pageId]: file.visibility || "personal" } };
  }
  if (!(pageId in marker)) return { kind: "none" };
  const { [pageId]: back, ...rest } = marker;
  return Object.keys(rest).length > 0 ? { kind: "drop", marker: rest } : { kind: "release", marker: rest, back };
}

async function snapshotsOf(ids: string[]): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase
    .schema("content")
    .from("space_payload")
    .select("document_id, content_version, snapshot")
    .in("document_id", ids)
    .order("content_version", { ascending: false });
  if (error) throw new Error(error.message || "We couldn't read this page's pictures.");
  for (const row of data ?? []) if (!out.has(row.document_id)) out.set(row.document_id, row.snapshot);
  return out;
}

/** A page and every live sub-page under it. */
async function treeOf(rootId: string): Promise<string[]> {
  const seen = new Set<string>([rootId]);
  let level = [rootId];
  for (let depth = 0; depth < 12 && level.length > 0 && seen.size < 400; depth += 1) {
    const next: string[] = [];
    for (const parent of level) {
      const { data, error } = await supabase.schema("content").rpc("space_children", { p_parent_id: parent });
      if (error) throw new Error(error.message || "We couldn't read this page's sub-pages.");
      for (const child of data ?? []) if (!seen.has(child.id)) (seen.add(child.id), next.push(child.id));
    }
    level = next;
  }
  return [...seen];
}

export interface MediaSyncResult {
  changed: number;
  failed: number;
}

/**
 * Make the cover and icon files of a published page (and, when included, its sub-pages) public, or put back the
 * ones publishing made public. Best effort per file: one the person cannot change (someone else's upload) is
 * counted as failed, never thrown, so publishing itself is never undone by a picture.
 */
export async function syncPublishedMedia(rootId: string, opts: { published: boolean; includeSubPages: boolean }): Promise<MediaSyncResult> {
  const tree = await treeOf(rootId);
  const snaps = await snapshotsOf(tree);
  const live = new Set(opts.published ? (opts.includeSubPages ? tree : [rootId]) : []);
  const wanted = new Set<string>();
  const unwanted = new Set<string>();
  for (const id of tree) for (const f of mediaFileIds(snaps.get(id))) (live.has(id) ? wanted : unwanted).add(f);
  // A file named by a live page stays public even if a page that is no longer live names it too.
  for (const f of wanted) unwanted.delete(f);

  // Files this page made public that no current snapshot names any more (a cover that was replaced).
  const { data: stale } = await supabase
    .schema("files")
    .from("files")
    .select("id")
    .is("deleted_at", null)
    .not(`metadata->${PUBLISHED_BY_KEY}->>${rootId}`, "is", null);
  for (const row of stale ?? []) if (!wanted.has(row.id)) unwanted.add(row.id);

  const result: MediaSyncResult = { changed: 0, failed: 0 };
  const run = async (fileId: string, on: boolean) => {
    try {
      const { data } = await Files.getFile(fileId);
      const move = decideMediaMove(
        { visibility: String(data.visibility ?? ""), published: data.published_to_web === true, metadata: data.metadata },
        rootId,
        on,
      );
      if (move.kind === "none") return;
      const body =
        move.kind === "publish"
          ? { visibility: "public" as const, metadata: { [PUBLISHED_BY_KEY]: move.marker } }
          : move.kind === "release"
            ? { visibility: move.back as "personal", metadata: { [PUBLISHED_BY_KEY]: move.marker } }
            : { metadata: { [PUBLISHED_BY_KEY]: move.marker } };
      await Files.patchFile(fileId, body);
      result.changed += 1;
    } catch {
      result.failed += 1;
    }
  };
  for (const id of wanted) await run(id, true);
  for (const id of unwanted) await run(id, false);
  return result;
}
