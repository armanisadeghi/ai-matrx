"use client";

/**
 * Share-lens default renderers — the per-type bodies the recipient landing
 * (`/s/[token]`) renders. Moved here from `SharedResourceView.tsx` when the
 * lens registry was extracted (2026-08-13); the registry (`./registry.tsx`)
 * is the only consumer. Add new lenses there, not switch cases anywhere.
 */

import React from "react";
import Link from "next/link";
// DELIBERATE static react-markdown (not the MarkdownCore front door): this is
// an anonymous share/SEO surface — the markdown body must be in the
// server-rendered HTML, and MarkdownCore is ssr:false.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ExternalLink,
  FolderClosed,
  Loader2,
  ScanSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getResourceSharePath } from "@/utils/permissions/registry";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";
import {
  AiVisibilityReport,
  parsePublicVisibilityResult,
} from "@/features/marketing/seo/ai-visibility/AiVisibilityReport";

function str(
  resource: Record<string, unknown> | undefined,
  key: string,
): string {
  const v = resource?.[key];
  return typeof v === "string" ? v : "";
}

export function resourceTitle(result: ResolvedShareToken): string {
  return (
    str(result.resource, "label") ||
    str(result.resource, "title") ||
    str(result.resource, "name") ||
    result.displayLabel ||
    "Shared item"
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

/** Text/markdown types (note, message_template): title + markdown body. */
export function MarkdownRenderer({ result }: { result: ResolvedShareToken }) {
  const content = str(result.resource, "content");
  return (
    <article className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold text-foreground mb-4">
        {resourceTitle(result)}
      </h1>
      {content ? (
        <Markdown content={content} />
      ) : (
        <p className="text-muted-foreground">This item is empty.</p>
      )}
    </article>
  );
}

/** Code file: title + language + monospaced body. */
export function CodeRenderer({ result }: { result: ResolvedShareToken }) {
  const content = str(result.resource, "content");
  const language = str(result.resource, "language");
  return (
    <article className="mx-auto w-full max-w-4xl">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-semibold text-foreground">
          {resourceTitle(result)}
        </h1>
        {language && (
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
            {language}
          </span>
        )}
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-sm">
        <code className="font-mono text-foreground">{content}</code>
      </pre>
    </article>
  );
}

/** A single flashcard: front / back. */
export function FlashcardRenderer({ result }: { result: ResolvedShareToken }) {
  const front = str(result.resource, "front");
  const back = str(result.resource, "back");
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-medium text-muted-foreground mb-2">Front</p>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <Markdown content={front} />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-medium text-muted-foreground mb-2">Back</p>
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <Markdown content={back} />
        </div>
      </div>
    </div>
  );
}

/**
 * Generic renderer for any type without a registered lens — renders `content`
 * as markdown when present (so most content-bearing types Just Work), else a
 * titled card with description + a deep link into the app. This is the FLOOR
 * of the default share path, never the ceiling.
 */
export function GenericRenderer({ result }: { result: ResolvedShareToken }) {
  const title = resourceTitle(result);
  const content = str(result.resource, "content");
  const description =
    str(result.resource, "description") ||
    str(result.resource, "tagline") ||
    str(result.resource, "summary");
  const appPath =
    result.resourceType && result.resourceId
      ? getResourceSharePath(result.resourceType, result.resourceId)
      : null;

  if (content) {
    return (
      <article className="mx-auto w-full max-w-3xl">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
          {result.displayLabel ?? "Shared item"}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-4">{title}</h1>
        <Markdown content={content} />
      </article>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
          {result.displayLabel ?? "Shared item"}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
        {description && (
          <p className="text-muted-foreground mb-6 line-clamp-3">
            {description}
          </p>
        )}
        {appPath && (
          <Button asChild>
            <Link href={appPath}>
              Open in AI Matrx
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// The shared-FILE lens moved to ./file-lens.tsx (2026-08-13) when it became
// a full product surface (canonical PDF viewer + fullscreen + capability
// CTAs) — this file keeps only the lightweight default bodies.

/** Shared folder: metadata card. Contents require sign-in — anonymous child
 * listing is not part of the share-link lane (yet). */
export function FolderRenderer({ result }: { result: ResolvedShareToken }) {
  const name = str(result.resource, "folder_name") || resourceTitle(result);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <FolderClosed className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">{name}</h1>
        <p className="text-muted-foreground">
          A folder was shared with you. Sign in to browse its contents.
        </p>
      </div>
    </div>
  );
}

/** The proven presentation lens: the AI visibility report. */
export function AiVisibilityRenderer({
  result,
  token,
}: {
  result: ResolvedShareToken;
  token: string;
}) {
  const report = parsePublicVisibilityResult(result.resource?.["result"]);
  if (!report) {
    return (
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <ScanSearch className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-2xl font-semibold text-foreground">
          This report isn&apos;t available
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
          No answer engine returned a completed response, so AI Matrx did not
          publish empty or failed results as a report. Run the analysis again
          to create a new shareable report.
        </p>
      </div>
    );
  }
  return (
    <AiVisibilityReport result={report} shareUrl={`/s/${token}`} acquisition />
  );
}

// PublicCanvasRenderer pulls the whole artifact-renderer engine — keep it out
// of the /s route chunk until a canvas share actually renders (React.lazy is
// the in-gate boundary form; this file already sits behind the route's client
// edge).
const PublicCanvasRenderer = React.lazy(() =>
  import("@/features/canvas/shared/PublicCanvasRenderer").then((m) => ({
    default: m.PublicCanvasRenderer,
  })),
);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Canvas lens — a published canvas snapshot (`shared_canvas_item`) or a saved
 * canvas item (`canvas_item`, whose `content` is `{type, data, metadata}`).
 */
export function CanvasRenderer({ result }: { result: ResolvedShareToken }) {
  const r = result.resource ?? {};
  const rawContent = r["content"];
  const content =
    result.resourceType === "shared_canvas_item"
      ? {
          type: str(r, "canvas_type") || "html",
          data: r["canvas_data"],
          metadata: {
            title: str(r, "title"),
            description: str(r, "description"),
          },
        }
      : isRecord(rawContent)
        ? rawContent
        : { type: "html", data: rawContent };

  return (
    <div className="h-[70dvh] min-h-[420px] w-full overflow-hidden rounded-xl border border-border bg-card">
      <React.Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <PublicCanvasRenderer content={content} />
      </React.Suspense>
    </div>
  );
}
