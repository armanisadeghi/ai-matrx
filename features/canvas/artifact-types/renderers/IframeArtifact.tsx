"use client";

import type { ArtifactRendererProps } from "../types";

import { safeEmbedUrl } from "@/lib/iframe/embed-url";
import { usePageSandbox } from "@/lib/iframe/use-page-sandbox";

/**
 * Unified renderer for `iframe` artifacts — chat, canvas, and artifact-card surfaces.
 *
 * Drafts and app-relative addresses are opaque. A known separate initial
 * HTTP(S) URL retains media-player capabilities after hydration. Redirect
 * custody is separate; this rule never proves an entire navigation chain.
 * Public inline HTML is non-executing, matching the renderer contract.
 */
export default function IframeArtifact({
  mode,
  raw,
  data,
  metadata,
  isPublic = false,
}: ArtifactRendererProps) {
  const payload =
    typeof data === "string"
      ? data
      : ((data as { url?: string })?.url ?? raw ?? "");

  const title = (metadata?.title as string) || "Web View";
  const height = mode === "canvas" ? "100%" : "400px";

  const safeUrl = safeEmbedUrl(payload);
  const sandbox = usePageSandbox(
    safeUrl,
    "allow-scripts allow-same-origin allow-popups allow-forms allow-presentation",
  );

  if (safeUrl) {
    return (
      <iframe
        key={sandbox}
        src={safeUrl}
        sandbox={sandbox}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        className="w-full border-0"
        style={{ height, minHeight: "300px" }}
        title={title}
      />
    );
  }

  // Inline HTML payload (srcDoc) — no allow-same-origin.
  return (
    <iframe
      key={isPublic ? "public-inline" : "private-inline"}
      srcDoc={payload}
      sandbox={isPublic ? "" : "allow-scripts allow-forms"}
      className="w-full border-0"
      style={{ height, minHeight: "300px" }}
      title={title}
    />
  );
}
