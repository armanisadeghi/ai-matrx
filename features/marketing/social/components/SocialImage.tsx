"use client";

/**
 * One image of the Socials section: a post thumbnail or an account avatar.
 *
 * Order of truth: the stored copy (a small JPEG behind the signed-in door, fetched as a blob and
 * cached per session) -> the provider's own URL when it is a format a browser can draw and
 * nothing stored exists yet (YouTube / X links never expire) -> the `fallback` node.
 * The box is sized by the caller (fixed aspect or fixed square), so nothing shifts while the
 * bytes arrive; a pulsing skeleton fills it meanwhile.
 */

import { useEffect, useState, type ReactNode } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { cn } from "@/lib/utils";

import { fetchPlaybackUrl } from "../server";

const MAX_PARALLEL = 6;
const MAX_CACHED = 1500;
const cache = new Map<string, Promise<string | null>>();
let running = 0;
const waiting: Array<() => void> = [];

function slot(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(() => { running += 1; resolve(); }));
}

function release(): void {
  running -= 1;
  waiting.shift()?.();
}

/** Blob URL of a stored door image, shared by every card that shows it. null = the door refused. */
export function storedImageUrl(door: string, organizationId: string): Promise<string | null> {
  const key = `${organizationId}|${door}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = (async () => {
    await slot();
    try {
      return await fetchPlaybackUrl(door, { organizationId });
    } catch {
      cache.delete(key); // a refusal is retried by the next card, never remembered
      return null;
    } finally {
      release();
    }
  })();
  cache.set(key, pending);
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      const gone = cache.get(oldest);
      cache.delete(oldest);
      void gone?.then((u) => { if (u) URL.revokeObjectURL(u); });
    }
  }
  return pending;
}

/** A provider URL a browser cannot draw (TikTok serves HEIC) is never put in an <img>. */
export function isDrawableUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return !/\.heic(\?|$)/i.test(url.split("#")[0] ?? "");
}

export interface SocialImageProps {
  /** Stored-copy door path (`postThumbnailDoor` / `profileAvatarDoor`); null when nothing is stored. */
  door: string | null;
  /** Provider URL, used only when nothing is stored. */
  url?: string | null;
  fallback: ReactNode;
  className?: string;
  alt?: string;
}

export function SocialImage({ door, url, fallback, className, alt = "" }: SocialImageProps) {
  const organizationId = useAppSelector(selectOrganizationId) ?? "";
  const [src, setSrc] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">(door || isDrawableUrl(url) ? "loading" : "failed");

  useEffect(() => {
    let alive = true;
    setSrc(null);
    const direct = isDrawableUrl(url) ? url : null;
    if (!door) {
      setSrc(direct);
      setState(direct ? "loading" : "failed");
      return;
    }
    setState("loading");
    if (!organizationId) return;
    void storedImageUrl(door, organizationId).then((blobUrl) => {
      if (!alive) return;
      if (blobUrl) setSrc(blobUrl);
      else if (direct) setSrc(direct);
      else setState("failed");
    });
    return () => { alive = false; };
  }, [door, url, organizationId]);

  // The designed fallback is ALWAYS the bottom layer: whatever the image does (slow, refused, blank),
  // the box is never empty. The picture covers it only once it has really loaded.
  if (state === "failed") return <>{fallback}</>;
  return (
    <>
      {fallback}
      {state === "loading" ? <span aria-hidden className="absolute inset-0 animate-pulse bg-muted/60" /> : null}
      {src ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 h-full w-full object-cover", state === "ready" ? "bg-muted" : "opacity-0", className)}
        />
      ) : null}
    </>
  );
}
