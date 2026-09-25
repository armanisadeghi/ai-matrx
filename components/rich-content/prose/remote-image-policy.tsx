"use client";

// ─────────────────────────────────────────────────────────────────────────
// REMOTE IMAGES ARE A PRIVACY DECISION — ONE RULE FOR EVERY IMAGE THE CORE DRAWS.
//
// An <img> pointing at somebody else's server tells that server who opened the
// text, when, and from where (the tracking-pixel class; verify-RC-B11 low
// finding: a comment carrying `<img src="https://tracker…">` loaded it for
// every reader). The same hole exists wherever people or models write text we
// render: comments, notes shared by link, flashcards, study guides, forms, and
// an AI answer an injected prompt told to embed an image.
//
// THE RULE (every image path in the core renders through RemoteImageGate):
//   - our own files (recognizeOurFileUrl), same-origin paths, blob: and
//     data:image/* always draw — they reach no third party;
//   - a REMOTE image obeys the policy in context:
//       "load" → draws, with referrerPolicy="no-referrer";
//       "ask"  → a placeholder naming the host, a keyboard-reachable
//                "Show image" button (click-to-load) and an "Open" link out.
//   - <RichContent> sets "ask" at the inline and standard levels, and the
//     server/static levels (public share pages) set "ask" too; the full chat /
//     document level keeps "load" until its own knob says otherwise. A surface
//     may pass `remoteImages` explicitly.
//
// Guard: components/rich-content/__tests__/remote-image-policy.test.tsx renders
// the REAL levels and fails if any image path requests a remote URL under "ask".
// ─────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";

export type RemoteImagePolicy = "load" | "ask";

const RemoteImagePolicyContext = createContext<RemoteImagePolicy>("load");

export function RemoteImagePolicyProvider({ value, children }: { value: RemoteImagePolicy; children: ReactNode }) {
  return <RemoteImagePolicyContext.Provider value={value}>{children}</RemoteImagePolicyContext.Provider>;
}

export function useRemoteImagePolicy(): RemoteImagePolicy {
  return useContext(RemoteImagePolicyContext);
}

/** The remote host a URL would contact, or null when drawing it reaches no third party. */
export function remoteImageHost(src: string): string | null {
  const s = src.trim();
  if (!s) return null;
  if (/^(data:image\/|blob:)/i.test(s)) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return null;
  if (recognizeOurFileUrl(s)) return null;
  let url: URL;
  try {
    const base = typeof window !== "undefined" ? window.location.href : "https://localhost/";
    url = new URL(s, base);
  } catch {
    return null; // not a URL the browser would fetch
  }
  if (typeof window !== "undefined" && url.origin === window.location.origin) return null;
  return url.host || null;
}

/**
 * Renders `children` (the real image) when it may load; otherwise the
 * click-to-load placeholder. `block` lays the placeholder out as a line.
 */
export function RemoteImageGate({
  src,
  alt,
  block = false,
  children,
}: {
  src: string;
  alt?: string;
  block?: boolean;
  children: ReactNode;
}) {
  const policy = useRemoteImagePolicy();
  const [shown, setShown] = useState(false);
  const host = remoteImageHost(src);
  if (!host || policy === "load" || shown) return <>{children}</>;
  return (
    <span
      data-content-chrome=""
      data-rc-remote-image={host}
      role="group"
      aria-label={alt ? `Image “${alt}” from ${host}, not loaded` : `Image from ${host}, not loaded`}
      className={
        (block ? "my-2 flex w-full " : "mx-0.5 inline-flex max-w-full ") +
        // wraps in a narrow column: the host name gives way, the controls never get cut
        "flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1 align-middle text-xs text-muted-foreground"
      }
    >
      <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 max-w-full truncate">
        {alt ? `“${alt}” — ` : ""}image from {host}
      </span>
      <button
        type="button"
        onClick={() => setShown(true)}
        className="shrink-0 rounded px-1 font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Show image
      </button>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className="shrink-0 rounded px-1 hover:underline"
      >
        Open
      </a>
    </span>
  );
}
