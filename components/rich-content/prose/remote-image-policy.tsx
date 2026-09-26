"use client";

// ─────────────────────────────────────────────────────────────────────────
// REMOTE IMAGES ARE A PRIVACY AND SECURITY DECISION — ONE RULE FOR EVERY IMAGE THE CORE DRAWS.
//
// An <img> pointing at another website tells that site who opened the text,
// when and from where (a tracking pixel), and an image URL inside an AI answer
// is a data-exfiltration channel: a prompt-injected answer can put private
// data in the query string and the browser sends it the moment it renders.
// Claude.ai and ChatGPT refuse to auto-load arbitrary remote images in answers;
// Gmail and Superhuman gate remote images in mail from others.
//
// THE RULE (chair ruling 2026-09-25; every image path in the core renders
// through RemoteImageGate):
//   - our own files (recognizeOurFileUrl) and same-origin paths always draw;
//   - a REMOTE image loads by itself only when the knob for WHO WROTE the text
//     says so — `rich_content.remote_images.autoload_{self|other|ai}` (org →
//     person; defaults self ON, other OFF, ai OFF) — or its host is in
//     `trusted_hosts` ("Always show images from <host>");
//   - otherwise: a placeholder naming the host, "Show image" (click-to-load),
//     "Always show images from <host>" (signed in), and "Open" (link out);
//   - every remote image that does draw sends no referrer.
//
// WHO WROTE IT is declared by the HOST (`imagePolicy`), never guessed from the
// surface. A render with no declaration is treated as "other" (click-to-load)
// and says so once in development. Guard:
// components/rich-content/__tests__/remote-image-policy.test.tsx and
// components/rich-content/__tests__/image-policy-declared.test.ts (every
// full-level call site declares its policy).
// ─────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { sessionKnobPrincipals } from "@/lib/scoped-config/sessionKnob";
import { setUserKnobMapEntry } from "@/lib/scoped-config/service";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

/** Who wrote the text being rendered: the viewer, someone else, or an AI model. */
export type ImagePolicy = "self" | "other" | "ai";

/**
 * What a render site declares: who wrote it, or "inherit" for a render nested
 * INSIDE a surface that already declared (a kind block or tool renderer inside a
 * chat answer) — it takes the enclosing declaration.
 */
export type ImagePolicyDeclaration = ImagePolicy | "inherit";

/** Wrap `node` in the declaration's provider; "inherit" and undefined add none. */
export function withImagePolicy(declaration: ImagePolicyDeclaration | undefined, node: ReactNode): ReactNode {
  return declaration && declaration !== "inherit" ? <ImagePolicyProvider value={declaration}>{node}</ImagePolicyProvider> : node;
}

/** "self" when the viewer wrote it, otherwise "other" — for records that can be either. */
export function authoredBy(authorId: string | null | undefined, viewerId: string | null | undefined): ImagePolicy {
  return authorId && viewerId && authorId === viewerId ? "self" : "other";
}

export const REMOTE_IMAGE_KNOB_FEATURE = "rich_content.remote_images";

/** What each authorship does when the knob has not answered (and on anonymous pages). */
export const REMOTE_IMAGE_DEFAULTS: Record<ImagePolicy, boolean> = { self: true, other: false, ai: false };

const ImagePolicyContext = createContext<ImagePolicy | null>(null);

export function ImagePolicyProvider({ value, children }: { value: ImagePolicy; children: ReactNode }) {
  return <ImagePolicyContext.Provider value={value}>{children}</ImagePolicyContext.Provider>;
}

/** The declared authorship, or null when no host declared one. */
export function useImagePolicy(): ImagePolicy | null {
  return useContext(ImagePolicyContext);
}

let warnedUndeclared = false;
function warnUndeclared(host: string) {
  if (warnedUndeclared || process.env.NODE_ENV === "production") return;
  warnedUndeclared = true;
  console.warn(
    `[rich-content] A remote image (${host}) rendered where no surface declared who wrote the text, ` +
      'so it waits for a click. Pass imagePolicy="self" | "other" | "ai" on the RichContent / ' +
      "RichDocument / MarkdownStream that renders it (components/rich-content/prose/remote-image-policy.tsx).",
  );
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

function asHostMap(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
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
  const declared = useImagePolicy();
  const authorship: ImagePolicy = declared ?? "other";
  const { organizationId, userId } = sessionKnobPrincipals();
  const autoload = useEffectiveKnob(organizationId, userId, { feature: REMOTE_IMAGE_KNOB_FEATURE, key: `autoload_${authorship}` });
  const trusted = asHostMap(useEffectiveKnob(organizationId, userId, { feature: REMOTE_IMAGE_KNOB_FEATURE, key: "trusted_hosts" }));
  const [shown, setShown] = useState(false);
  const [trusting, setTrusting] = useState<"idle" | "saving" | string>("idle");
  const host = remoteImageHost(src);
  if (!host) return <>{children}</>;
  if (!declared) warnUndeclared(host);
  const loadsByItself = typeof autoload === "boolean" ? autoload : REMOTE_IMAGE_DEFAULTS[authorship];
  if (shown || loadsByItself || trusted[host] === true) return <>{children}</>;

  const why = authorship === "ai" ? "written by AI" : "written by someone else";
  const canTrust = !!organizationId && !!userId;
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
      {/* Icon and words wrap as one unit: a narrow column never strands the icon on a line of its own. */}
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5" title={`Images from other websites in text ${why} wait for you to show them.`}>
        <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          {alt ? `“${alt}” — ` : ""}image from {host}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setShown(true)}
        className="shrink-0 rounded px-1 font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        Show image
      </button>
      {canTrust ? (
        <button
          type="button"
          disabled={trusting === "saving"}
          onClick={async () => {
            setTrusting("saving");
            try {
              const r = await setUserKnobMapEntry({
                feature: REMOTE_IMAGE_KNOB_FEATURE,
                key: "trusted_hosts",
                entryKey: host,
                entryValue: true,
                userId: userId!,
                organizationId: organizationId!,
                note: "Always show images from this website (image placeholder)",
              });
              if (r.ok) {
                setShown(true);
                setTrusting("idle");
              } else setTrusting(r.reason);
            } catch (e) {
              console.error("[rich-content] saving a trusted image host failed", e);
              setTrusting("That choice could not be saved. Show image still works for this one.");
            }
          }}
          className="shrink-0 rounded px-1 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {trusting === "saving" ? "Saving…" : `Always show from ${host}`}
        </button>
      ) : null}
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer nofollow"
        referrerPolicy="no-referrer"
        className="shrink-0 rounded px-1 hover:underline"
      >
        Open
      </a>
      {trusting !== "idle" && trusting !== "saving" ? (
        <ErrorNotice size="inline" className="basis-full" message={trusting} />
      ) : null}
    </span>
  );
}
