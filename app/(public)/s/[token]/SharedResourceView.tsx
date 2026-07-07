"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getResourceSharePath } from "@/utils/permissions/registry";
import type { ResolvedShareToken } from "@/utils/permissions/shareLinks";

function str(resource: Record<string, unknown> | undefined, key: string): string {
  const v = resource?.[key];
  return typeof v === "string" ? v : "";
}

function resourceTitle(result: ResolvedShareToken): string {
  return (
    str(result.resource, "label") ||
    str(result.resource, "title") ||
    str(result.resource, "name") ||
    result.displayLabel ||
    "Shared item"
  );
}

/** Note-specific renderer: title + markdown body. */
function NoteRenderer({ result }: { result: ResolvedShareToken }) {
  const title = resourceTitle(result);
  const content = str(result.resource, "content");
  return (
    <article className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-semibold text-foreground mb-4">{title}</h1>
      {content ? (
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-muted-foreground">This note is empty.</p>
      )}
    </article>
  );
}

/**
 * Generic fallback for any resource type without a bespoke public renderer —
 * ensures "renders anything" holds. Shows the item's name + a deep link into
 * the app (which will gate on sign-in if the type isn't anon-viewable inline).
 */
function GenericRenderer({ result }: { result: ResolvedShareToken }) {
  const title = resourceTitle(result);
  const appPath =
    result.resourceType && result.resourceId
      ? getResourceSharePath(result.resourceType, result.resourceId)
      : null;
  const description =
    str(result.resource, "description") ||
    str(result.resource, "tagline") ||
    str(result.resource, "summary");
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground mb-4">
          {result.displayLabel ?? "Shared item"}
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
        {description && (
          <p className="text-muted-foreground mb-6 line-clamp-3">{description}</p>
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

export function SharedResourceView({ result }: { result: ResolvedShareToken }) {
  const isNote = result.resourceType === "note";
  return (
    <div className="min-h-dvh bg-textured flex flex-col">
      {/* Brand bar — subtle acquisition CTA for logged-out viewers */}
      <header className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-border/60 bg-card/40 backdrop-blur">
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          AI Matrx
        </Link>
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-up">
            Create your own
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-8 sm:py-12">
        {isNote ? (
          <NoteRenderer result={result} />
        ) : (
          <GenericRenderer result={result} />
        )}
      </main>

      <footer className="px-4 sm:px-6 py-6 border-t border-border/60 text-center">
        <p className="text-sm text-muted-foreground">
          Shared with you via{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            AI Matrx
          </Link>
          {" — "}
          <Link href="/sign-up" className="font-medium text-primary hover:underline">
            build and share your own
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
