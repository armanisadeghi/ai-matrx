"use client";

import { useMemo } from "react";
import {
  FileText,
  Frame,
  PanelRight,
  ExternalLink,
  Maximize2,
} from "lucide-react";
import type { ToolRendererProps } from "../../types";
import { isTerminal } from "../_shared";
import { parseDocument } from "./parseDocument";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";
import { EmptyResultCard } from "../_shared-entity/EmptyResultCard";
import { useOpenDocumentCanvas } from "@/features/data-tables/hooks/useOpenDocumentCanvas";

/**
 * Inline renderer for the `document` tool — a polished entity card with a short
 * text preview. The full rendered document lives in the CANVAS (the side-by-side
 * workspace the agent and the user share), and also in the overlay / window /
 * `/documents/[id]` route through the "Open in" menu.
 *
 * Two live defects from 2026-09-14 are pinned here:
 *
 *  1. NO CANVAS DOOR. The agent created a document, said «Created and opened as
 *     a document artifact», and nothing opened — this card's only destinations
 *     were a window, a new tab and the tool overlay. "Open in canvas" is now
 *     the card's primary (hover) action and the first item in the menu, opening
 *     the real document through `useOpenDocumentCanvas`.
 *  2. A COMPLETED CALL THAT RENDERED NOTHING. `create` returns its row nested
 *     under `document`, which the parser did not read, so `!doc.id && !doc.text`
 *     was true and the component returned `null`: a tool call that really
 *     happened left NO trace in the transcript at all. While the call is still
 *     in flight, rendering nothing is right (the shell's shimmering line is the
 *     status). Once it has RESULTED, rendering nothing is a silent failure —
 *     law 4 — so the shared `EmptyResultCard` names what the tool did and what
 *     to do next.
 */
function previewText(text: string, max = 320): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max) + "…" : cleaned;
}

/** What the tool DID, in past tense, for a card with no content to show. */
function actionSummary(action: string | null, appliedOps: number | null): string {
  switch (action) {
    case "create":
      return "Created a document";
    case "edit":
      return appliedOps != null
        ? `Edited a document (${appliedOps} change${appliedOps === 1 ? "" : "s"})`
        : "Edited a document";
    case "read":
      return "Read a document";
    default:
      return "Finished a document action";
  }
}

export function DocumentInline({
  entry,
  onOpenWindowPanel,
  onOpenOverlay,
  expanded,
  onToggleExpanded,
  conversationId,
}: ToolRendererProps) {
  const doc = useMemo(() => parseDocument(entry), [entry]);
  const openInCanvas = useOpenDocumentCanvas();

  const title = doc.title ?? "Document";
  const documentId = doc.id;
  const href = documentId ? `/documents/${documentId}` : undefined;
  const body = doc.text ?? doc.submittedText;
  const chars = doc.text?.length ?? null;

  const canvasAction: EntityAction | null = documentId
    ? {
        label: "Open in canvas",
        icon: Frame,
        onSelect: () =>
          openInCanvas({
            documentId,
            title,
            conversationId: conversationId ?? null,
          }),
      }
    : null;

  const actions: EntityAction[] = [];
  if (canvasAction) actions.push(canvasAction);
  if (onOpenWindowPanel)
    actions.push({
      label: "Open in window",
      icon: PanelRight,
      onSelect: () => onOpenWindowPanel(),
    });
  if (href) actions.push({ label: "Open in new tab", icon: ExternalLink, href });
  if (onOpenOverlay)
    actions.push({
      label: "Expand",
      icon: Maximize2,
      onSelect: () => onOpenOverlay(),
      separatorBefore: true,
    });

  if (!documentId && !body) {
    // Still in flight with nothing yet — the shell's live line IS the status.
    // This is the ONLY silent case, and it ends the moment the tool results.
    if (!isTerminal(entry)) return null;
    // RESULTED and carried neither an id nor any content. Returning null here
    // is what made a real tool call invisible.
    return (
      <EmptyResultCard
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        icon={FileText}
        accent="slate"
        title={title}
        did={actionSummary(doc.action, doc.appliedOps)}
        remedy={
          <>
            Your documents are all listed at{" "}
            <a
              href="/documents"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              /documents
            </a>
            {onOpenOverlay ? ", and the full tool result is under Expand." : "."}
          </>
        }
        actions={actions}
      />
    );
  }

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={FileText}
      accent="slate"
      title={title}
      // The Canvas is the document's home surface, so it is what the subtitle
      // morphs into on hover — one click, not a trip through the menu.
      hoverAction={canvasAction ?? undefined}
      subtitle={
        chars != null ? `${chars.toLocaleString()} chars · Document` : "Document"
      }
      actions={actions}
    >
      {body ? (
        <div className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {previewText(body)}
        </div>
      ) : null}
    </EntityCard>
  );
}
