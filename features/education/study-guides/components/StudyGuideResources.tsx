"use client";

import { useContainerLinks } from "@ai-matrx/associations/react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { GeneratedFromChips } from "@/features/education/convert/GeneratedFromChips";
import { MadeFromSource } from "@/features/education/convert/MadeFromSource";
import type { Note } from "@/features/notes/types";
import { StudyFlashcardLinks } from "./StudyFlashcardLinks";

export function StudyGuideResources({ guide, onChanged }: { guide: Note; onChanged: () => void }) {
  const links = useContainerLinks({ containerType: "note", containerId: guide.id, orgId: guide.organization_id });
  const decks = links.linksFor("fc_set");
  return <div role="tabpanel" aria-label="Resources" className="scroll-page-end-space min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
    <div>
      <h2 className="text-xs font-semibold text-foreground">Linked flashcards</h2>
      {links.status === "error" ? <ErrorNotice size="inline" className="mt-2 text-xs" message={links.error ?? "Could not load linked flashcards."} /> : null}
      {links.status === "ready" && decks.length ? <ul className="mt-2 space-y-1.5">{decks.map((deck) => <li key={deck.edgeId} className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"><EntityRef token="fc_set" id={deck.resourceId} name={deck.label ?? "Flashcard deck"} fill /></li>)}</ul> : links.status === "ready" ? <p className="mt-1 text-xs leading-5 text-muted-foreground">No decks linked to this guide yet.</p> : links.status !== "error" ? <p className="mt-1 text-xs text-muted-foreground">Loading linked flashcards…</p> : null}
      <div className="mt-2"><StudyFlashcardLinks guide={guide} onChanged={() => { void links.reload(); onChanged(); }} /></div>
    </div>
    <div className="border-t border-border pt-3">
      <h2 className="mb-2 text-xs font-semibold text-foreground">Related study material</h2>
      <div className="space-y-2"><MadeFromSource entityType="note" entityId={guide.id} className="[&>div:first-child]:flex-wrap" /><GeneratedFromChips entityType="note" entityId={guide.id} /></div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Resources made from this guide or its original material appear here when they are connected.</p>
    </div>
  </div>;
}
