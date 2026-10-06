"use client";

/**
 * useLinkPreview(url) — URL -> preview card data (title, description, site name,
 * favicon, image) from aidream `GET /web/link-preview`. One hook for every surface
 * (Spaces bookmark blocks and link mentions first). Cached per normalized URL by
 * React Query; the server also caches. Server contract: aidream/services/link_preview/FEATURE.md
 *
 * Image/favicon URLs are external public URLs: render them as `{ url }` media refs
 * through the media client, never persist them as signed URLs.
 */
import { useQuery } from "@tanstack/react-query";

import { getJson } from "@/lib/python-client";

export type LinkPreviewNoPreviewReason =
  | "invalid_url"
  | "blocked_address"
  | "unreachable"
  | "not_html"
  | "http_error";

export interface LinkPreview {
  url: string;
  final_url: string | null;
  available: boolean;
  reason: LinkPreviewNoPreviewReason | null;
  title: string | null;
  description: string | null;
  site_name: string | null;
  favicon_url: string | null;
  image_url: string | null;
  fetched_at: string;
}

export type LinkPreviewStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

export interface UseLinkPreviewResult {
  status: LinkPreviewStatus;
  preview: LinkPreview | null;
}

const STALE_MS = 60 * 60 * 1000;

export function normalizePreviewUrl(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function useLinkPreview(url: string | null | undefined): UseLinkPreviewResult {
  const normalized = normalizePreviewUrl(url);
  const query = useQuery({
    queryKey: ["link-preview", normalized],
    enabled: normalized !== null,
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    retry: 1,
    queryFn: async ({ signal }) => {
      const { data } = await getJson<LinkPreview>(
        `/web/link-preview?url=${encodeURIComponent(normalized as string)}`,
        { signal },
      );
      return data;
    },
  });

  if (normalized === null) return { status: "idle", preview: null };
  if (query.isPending) return { status: "loading", preview: null };
  if (query.isError) return { status: "error", preview: null };
  const preview = query.data ?? null;
  return { status: preview?.available ? "ready" : "unavailable", preview };
}
