"use client";

import React from "react";
import Link from "next/link";
// DELIBERATE static react-markdown (not the MarkdownCore front door): this is
// an anonymous SEO surface — the markdown body must be in the server-rendered
// HTML, and MarkdownCore is ssr:false.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpRight, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveShareSourceSurface } from "@/features/sharing/lenses/source-surface";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { isForkable } from "@/utils/permissions/shareLinks";
import type { PublicResource } from "../../loadPublicResource";

function Markdown({ content }: { content: string }) {
  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

/** Flashcard set — read-only card list + study/copy CTA. The SEO body. */
function FlashcardSetRenderer({ resource }: { resource: PublicResource }) {
  const cards = resource.cards ?? [];
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center gap-2 text-muted-foreground">
        <Layers className="h-4 w-4" />
        <span className="text-sm font-medium">
          {cards.length} {cards.length === 1 ? "card" : "cards"}
        </span>
      </div>
      {resource.description && (
        <p className="mb-8 text-lg text-muted-foreground">{resource.description}</p>
      )}
      <ol className="space-y-3">
        {cards.map((card, i) => (
          <li
            key={card.id}
            className="rounded-xl border border-border bg-card p-5 sm:flex sm:items-start sm:gap-5"
          >
            <span className="mb-2 block text-xs font-semibold text-muted-foreground sm:mb-0 sm:w-8 sm:shrink-0 sm:pt-0.5">
              {i + 1}
            </span>
            <div className="grid gap-3 sm:flex-1 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Term
                </p>
                <div className="text-foreground">
                  {card.front ? <Markdown content={card.front} /> : "—"}
                </div>
              </div>
              <div className="sm:border-l sm:border-border sm:pl-5">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Definition
                </p>
                <div className="text-foreground">
                  {card.back ? <Markdown content={card.back} /> : "—"}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {cards.length === 0 && (
        <p className="text-muted-foreground">This set has no cards yet.</p>
      )}
    </div>
  );
}

/** Markdown types (note, message_template). */
function MarkdownRenderer({ resource }: { resource: PublicResource }) {
  const content = str(resource.row, "content");
  return (
    <article className="mx-auto w-full max-w-3xl">
      {content ? <Markdown content={content} /> : <p className="text-muted-foreground">This item is empty.</p>}
    </article>
  );
}

function GenericRenderer({ resource }: { resource: PublicResource }) {
  const content = str(resource.row, "content");
  if (content) return <MarkdownRenderer resource={resource} />;
  return (
    <div className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
      <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        {resource.displayLabel}
      </div>
      {resource.description && <p className="text-muted-foreground">{resource.description}</p>}
    </div>
  );
}

function renderBody(resource: PublicResource): React.ReactNode {
  switch (resource.resourceType) {
    case "fc_set":
      return <FlashcardSetRenderer resource={resource} />;
    case "note":
    case "message_template":
      return <MarkdownRenderer resource={resource} />;
    default:
      return <GenericRenderer resource={resource} />;
  }
}

export function PublicResourceView({ resource }: { resource: PublicResource }) {
  const forkable = isForkable(resource.resourceType);
  const returnPath = `/p/e/${resource.resourceType}/${resource.resourceId}`;
  // NEVER /sign-up: the visitor goes to the real feature (workspace when
  // signed in, that feature's marketing landing when not). Same resolver the
  // /s/[token] lane uses — features/sharing/lenses/source-surface.ts.
  const source = resolveShareSourceSurface({
    resourceType: resource.resourceType,
  });

  return (
    <div className="flex min-h-dvh flex-col bg-textured">
      <header className="flex items-center justify-between border-b border-border/60 bg-card/40 px-4 backdrop-blur sm:px-6" style={{ height: "3.5rem" }}>
        <Link href="/" className="flex items-center gap-2 font-semibold text-foreground">
          AI Matrx
        </Link>
        <div className="flex items-center gap-2">
          {forkable && (
            <DuplicateToEditButton
              resourceType={resource.resourceType}
              resourceId={resource.resourceId}
              returnPath={returnPath}
              size="sm"
            />
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={source.href}>
              {source.label}
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto mb-8 w-full max-w-3xl">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            {resource.displayLabel}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{resource.title}</h1>
        </div>
        {renderBody(resource)}
      </main>

      <footer className="border-t border-border/60 px-4 py-6 text-center sm:px-6">
        <p className="text-sm text-muted-foreground">
          Published on{" "}
          <Link href="/" className="font-medium text-primary hover:underline">
            AI Matrx
          </Link>
          {" — "}
          <Link
            href={source.href}
            className="font-medium text-primary hover:underline"
          >
            build and share your own
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
