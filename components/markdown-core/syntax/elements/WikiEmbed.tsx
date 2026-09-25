"use client";

// `![[Page]]` — the record, embedded. A note's body renders through the
// nested rich-content renderer (one level deeper, depth-capped like every
// nested section); any other record shows as a card with its real page link.
// A missing target shows the wikilink's own "Create" affordance.

import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { useWikiResolution, WikiLink } from "./WikiLink";

const NestedRichContent = lazy(() =>
  import("@/components/rich-content/standard/NestedRichContent").then((m) => ({ default: m.NestedRichContent })),
);

function useNoteBody(id: string | null): { body: string | null; error: string | null } {
  const [state, setState] = useState<{ id: string; body: string | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    import("@/features/notes/service/notesService")
      .then((m) => m.fetchNoteById(id, { failureMode: "throw" }))
      .then((note) => {
        if (live) setState({ id, body: note?.content ?? "", error: note ? null : "This note is not available to you." });
      })
      .catch((err: unknown) => {
        if (live) setState({ id, body: null, error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [id]);
  return state && state.id === id ? { body: state.body, error: state.error } : { body: null, error: null };
}

export function WikiEmbed(props: { "data-target"?: string; "data-alias"?: string; "data-block"?: unknown; children?: ReactNode }) {
  const target = String(props["data-target"] ?? "");
  const resolution = useWikiResolution(target);
  // Only an embed on its own line shows the record's body — inside running
  // text it is a compact reference (block content cannot sit in a paragraph).
  const isBlock = props["data-block"] !== undefined && props["data-block"] !== false;
  const noteId = isBlock && resolution?.status === "found" && resolution.token === "note" ? resolution.id : null;
  const { body, error } = useNoteBody(noteId);

  if (!resolution || resolution.status !== "found") {
    return (
      <span
        className={isBlock ? "my-2 block rounded-md border border-dashed border-border px-3 py-2 text-sm" : "inline-block rounded-md border border-dashed border-border px-1.5"}
        data-wiki-embed={resolution?.status ?? "resolving"}
      >
        <WikiLink {...props} />
      </span>
    );
  }

  return (
    <span
      data-wiki-embed="found"
      className={isBlock ? "my-3 block overflow-hidden rounded-md border border-border bg-card" : "inline-block overflow-hidden rounded-md border border-border bg-card align-middle"}
    >
      <span className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 truncate font-medium text-foreground">{resolution.title}</span>
        <span className="text-muted-foreground">{resolution.typeLabel}</span>
        {resolution.href && (
          <a href={resolution.href} className="ml-auto shrink-0 text-primary hover:underline">
            Open
          </a>
        )}
      </span>
      {noteId && (
        <span className="block px-3 py-2">
          {error ? (
            <span className="text-sm text-muted-foreground">{error}</span>
          ) : body === null ? (
            <span className="block h-10 animate-pulse rounded bg-muted/60" aria-label="Loading the embedded note" />
          ) : body.trim() ? (
            <Suspense fallback={<span className="block whitespace-pre-wrap text-sm">{body}</span>}>
              <NestedRichContent source={body} />
            </Suspense>
          ) : (
            <span className="text-sm text-muted-foreground">This note is empty.</span>
          )}
        </span>
      )}
    </span>
  );
}
