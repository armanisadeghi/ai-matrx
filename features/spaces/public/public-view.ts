// features/spaces/public/public-view.ts — the shape `content.space_public_view` answers, read once.
//
// Server-safe (no "use client"): the public route reads it for metadata, the page renders it. A page that
// is not on the web answers null from the database exactly like a page that never existed.

import type { SpaceBlock, SpaceDoc, SpaceMedia } from "../contract";
import {
  readPublishedDatabases,
  readPublishedEntities,
  type PublishedDatabase,
  type PublishedEntity,
} from "../data/published-databases";
import { COVER_PHOTOS, GALLERY_PREFIX } from "../page/gallery";

export interface PublicPageRef {
  id: string;
  slug: string | null;
  title: string;
  icon: string | null;
}

export interface PublicSnapshot {
  settings?: Partial<SpaceDoc["settings"]>;
  icon?: SpaceMedia | null;
  cover?: SpaceDoc["cover"];
  blocks?: SpaceBlock[];
}

export interface PublicSpaceView extends PublicPageRef {
  summary: string | null;
  updatedAt: string | null;
  snapshot: PublicSnapshot;
  children: PublicPageRef[];
  links: PublicPageRef[];
  path: PublicPageRef[];
  allowDuplicate: boolean;
  includeSubPages: boolean;
  indexed: boolean;
  /** Block id → the rows that database block publishes with the page (its own views, read by the door). */
  databases: Record<string, PublishedDatabase>;
  /** Block id → the rows of that built-in module block (tasks, projects, deals, employees), as the publisher may open them. */
  entities: Record<string, PublishedEntity>;
  /** File id → CDN address, for each uploaded image the page names that is a public file. */
  media: Record<string, string>;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

function ref(raw: unknown): PublicPageRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  return id
    ? {
        id,
        slug: str(r.slug),
        title: typeof r.title === "string" ? r.title : "",
        icon: str(r.icon),
      }
    : null;
}

function refs(raw: unknown): PublicPageRef[] {
  return Array.isArray(raw)
    ? raw.map(ref).filter((x): x is PublicPageRef => x !== null)
    : [];
}

/** The door's `media` JSON → file id → address (anything that is not an https address is left out). */
export function readPublishedMedia(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [id, url] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof url === "string" && url.startsWith("https://")) out[id] = url;
    }
  }
  return out;
}

/** The door's JSON → a typed view; null when the page is not on the web. */
export function readPublicView(raw: unknown): PublicSpaceView | null {
  const base = ref(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const snap =
    r.snapshot && typeof r.snapshot === "object" && !Array.isArray(r.snapshot)
      ? (r.snapshot as PublicSnapshot)
      : {};
  return {
    ...base,
    summary: str(r.summary),
    updatedAt: str(r.updated_at),
    snapshot: snap,
    children: refs(r.children),
    links: refs(r.links),
    path: refs(r.path),
    allowDuplicate: r.allow_duplicate === true,
    includeSubPages: r.include_sub_pages !== false,
    indexed: r.indexed === true,
    databases: readPublishedDatabases(r.databases),
    entities: readPublishedEntities(r.entities),
    media: readPublishedMedia(r.media),
  };
}

/** A document's stored icon (JSON of SpaceMedia, or a plain emoji written elsewhere). */
export function parsePublicIcon(
  raw: string | null | undefined,
): SpaceMedia | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SpaceMedia;
  } catch {
    // a plain-text icon
  }
  return { icon: raw };
}

/** The first words of the page, for the description when the page has no summary. */
export function publicDescription(view: PublicSpaceView): string {
  if (view.summary?.trim()) return view.summary.trim().slice(0, 200);
  const out: string[] = [];
  const walk = (blocks: SpaceBlock[] | undefined) => {
    for (const b of blocks ?? []) {
      if (out.join(" ").length > 200) return;
      const text = (b.text ?? [])
        .map((t) => t.text)
        .join("")
        .trim();
      if (text) out.push(text);
      walk(b.children);
    }
  };
  walk(view.snapshot.blocks);
  return out.join(" ").slice(0, 200);
}

/**
 * The cover as a share-card image: a linked picture or a bundled gallery photo (absolute). Colour and
 * gradient covers and uploaded files (private storage) have no public image, so the card has none.
 */
export function publicCoverImage(
  view: PublicSpaceView,
  origin: string,
): string | null {
  const cover = view.snapshot.cover;
  if (!cover || !("url" in cover) || typeof cover.url !== "string") return null;
  if (/^https?:\/\//i.test(cover.url)) return cover.url;
  if (cover.url.startsWith(GALLERY_PREFIX)) {
    const photo = COVER_PHOTOS.find(
      (p) => p.key === cover.url.slice(GALLERY_PREFIX.length),
    );
    return photo ? new URL(photo.src, origin).toString() : null;
  }
  return null;
}
