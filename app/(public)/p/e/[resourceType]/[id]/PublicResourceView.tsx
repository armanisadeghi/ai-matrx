"use client";

import React from "react";
import Link from "next/link";
// Public text renders through the one rich-content core, statically, so it
// is in the server-rendered HTML (MarkdownCore itself is ssr:false).
import {
  RichContentStaticInline,
  RichContentStaticStandard,
} from "@/components/rich-content/RichContentStaticProse";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveShareSourceSurface } from "@/features/sharing/lenses/source-surface";
import { DuplicateToEditButton } from "@/features/sharing/components/DuplicateToEditButton";
import { PublicHeaderActionsPortal } from "@/components/matrx/PublicHeaderActionsPortal";
import { PublicFlashcardDeck } from "@/features/flashcards/components/public/PublicFlashcardDeck";
import { isForkable } from "@/utils/permissions/shareLinks";
import { RecordFieldsView } from "@/features/sharing/lenses/record-fields-view";
import type { PublicResource } from "../../loadPublicResource";

/** `reading` for a document body; card faces keep the default density. */
function Markdown({
  content,
  reading = false,
}: {
  content: string;
  reading?: boolean;
}) {
  return (
    <RichContentStaticStandard
      source={content}
      variant={reading ? "reading" : "default"}
    />
  );
}

function str(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

/** Markdown types (note, message_template). */
function MarkdownRenderer({ resource }: { resource: PublicResource }) {
  const content = str(resource.row, "content");
  return (
    <article className="mx-auto w-full max-w-3xl">
      {content ? <Markdown content={content} reading /> : <p className="text-muted-foreground">This item is empty.</p>}
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
      {resource.description && (
        <p className="text-muted-foreground">
          <RichContentStaticInline source={resource.description} />
        </p>
      )}
    </div>
  );
}

function renderBody(resource: PublicResource): React.ReactNode {
  switch (resource.resourceType) {
    case "note":
    case "message_template":
      return <MarkdownRenderer resource={resource} />;
    case "record":
      return resource.record ? (
        <RecordFieldsView record={resource.record} />
      ) : (
        <GenericRenderer resource={resource} />
      );
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
  const isDeck = resource.resourceType === "fc_set";

  // The public layout owns the page chrome (PublicHeader / PublicFooter);
  // this view adds its actions to that header, never a second toolbar.
  const headerActions = (
    <PublicHeaderActionsPortal>
      {forkable && !isDeck && (
        <DuplicateToEditButton
          resourceType={resource.resourceType}
          resourceId={resource.resourceId}
          returnPath={returnPath}
          size="sm"
        />
      )}
      <Button asChild size="sm" variant="outline" className="h-7 px-2 sm:px-3">
        <Link href={source.href} aria-label={source.label}>
          <span className="hidden sm:inline">{source.label}</span>
          <ArrowUpRight className="h-4 w-4 sm:ml-1" />
        </Link>
      </Button>
    </PublicHeaderActionsPortal>
  );

  if (isDeck) {
    // Studied in place by anyone, signed in or not (features/flashcards/
    // components/public). Saving a copy needs an account; studying never does.
    return (
      <div className="bg-textured">
        {headerActions}
        <PublicFlashcardDeck
          setId={resource.resourceId}
          title={resource.title}
          description={resource.description}
          label={resource.displayLabel}
          cards={resource.cards ?? []}
          saveAction={
            forkable ? (
              <DuplicateToEditButton
                resourceType={resource.resourceType}
                resourceId={resource.resourceId}
                returnPath={returnPath}
                size="sm"
                variant="outline"
              />
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="bg-textured px-4 py-8 sm:px-6 sm:py-12">
      {headerActions}
      <div className="mx-auto mb-8 w-full max-w-3xl">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {resource.displayLabel}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{resource.title}</h1>
      </div>
      {renderBody(resource)}
    </div>
  );
}
