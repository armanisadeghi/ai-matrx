/**
 * Rendered-output standard (PLAN ruling 6): every NON-artifact canvas kind
 * (feature kinds, tool kinds, saved items) records an explicit decision about
 * what the pane menu's Print / Save as PDF / Copy image offers — never a silent
 * inheritance. The artifact kinds decide in `features/canvas/artifact-types/artifact-output.ts`.
 *
 *  - "dom"     : the host's DOM engines print/capture it as drawn (scroll areas are opened to
 *                full height by `@ai-matrx/print`; an iframe prints a notice, a canvas prints as its picture).
 *  - "none"    : nothing to print / capture — `withOutputDecisions` declares `print: false` / `capture: false`.
 *  - "handler" : the kind itself declares a handler (it must, or the guard fails).
 *
 * `why` is one line, about the content — the guard test holds every kind to it.
 */

import type { AnyCanvasKind } from "@ai-matrx/canvas/react";

export type OutputMode = "dom" | "none" | "handler";

export interface KindOutputDecision {
  readonly print: OutputMode;
  readonly capture: OutputMode;
  readonly why: string;
}

const dom = (why: string): KindOutputDecision => ({ print: "dom", capture: "dom", why });
/** A live tool: nothing worth a page, but the screen as drawn is still a true screenshot. */
const noPrint = (why: string): KindOutputDecision => ({ print: "none", capture: "dom", why });

export const KIND_OUTPUT_DECISIONS: Readonly<Record<string, KindOutputDecision>> = {
  // ── Saved items + the Quick Access tools: launchers and live tools ──────────────────────────
  "saved-items": noPrint("A virtualized card grid with filters and menus — its items print from their own tabs."),
  "quick-chat": noPrint("A live composer and thread — a conversation prints from Chat, not from a launcher."),
  "quick-notes": noPrint("The whole Notes workspace in a pane — a note prints from its own editor."),
  "quick-tasks": noPrint("A composer over a virtualized task list — a DOM copy would hold only the rows in view."),
  "global-scratchpad": noPrint("A live scratch editor — the text prints from the chat's working document."),
  "quick-data": noPrint("A table picker over a live grid — the table prints from its own page."),
  "quick-scribe": noPrint("A live recording controller — the transcript prints from its own page."),
  // ── The shell header's Messages and Notifications ───────────────────────────────────────────
  messages: dom("The open thread reads as a page; the composer prints as an empty box."),
  notifications: dom("A dated list of notices reads as a page; its buttons print inert."),
  // ── Conversation and agent side tools: plain DOM lists, diffs and receipts ──────────────────
  "conversation-documents": dom("A list of the chat's documents; plain DOM."),
  "context-preview": dom("What the next message will carry; plain DOM text."),
  "conversation-context": dom("The chat's context entries; plain DOM text."),
  "conversation-lists": dom("The agent's task list; plain DOM rows."),
  "agent-unsaved-changes": dom("A before/after diff of an agent's edits; plain DOM."),
  "context-items": dom("One attached item's details; plain DOM."),
  "message-context-receipt": dom("The values a message was sent with; plain DOM."),
  "context-value": dom("One context value's policy and text; plain DOM."),
  "working-document-history": dom("A working document's version list; plain DOM."),
  "note-knowledge": dom("A note's knowledge assets; plain DOM."),
  // ── Feature kinds: show something about the current item ────────────────────────────────────
  "record-peek": dom("A record's detail sections; plain DOM in one scroll area, opened to full height."),
  "ai-visibility-answer": dom("One engine's answer text; plain DOM."),
  "kg-source-preview": dom("A source document's text with its highlights; plain DOM."),
  "user-journey": dom("A person's timeline; plain DOM in one scroll area."),
  "directive-shape": dom("A directive's shape: tabs and code blocks; plain DOM."),
  "topical-map-topic": dom("One map topic's details; plain DOM."),
  "social-post": dom("One social post: player, stats, tabs; plain DOM (the video is a native element)."),
  "kg-suggestions": dom("The suggestion inbox rows; plain DOM, scroll area opened to full height."),
  "document-history": dom("A document's snapshot list; plain DOM — no Univer surface in this body."),
  "workbook-history": dom("A workbook's snapshot list; plain DOM — no Univer surface in this body."),
  "knowledge-assets": dom("A document's Knowledge Assets builder; plain DOM."),
  "system-context-preview": dom("What agents receive for global system context; plain DOM text."),
  "agent-edit-history": dom("An agent's undo/redo timeline; plain DOM."),
  "note-history": dom("A note's version history and diffs; plain DOM."),
  "cloud-file-editor": {
    print: "handler",
    capture: "handler",
    why: "Monaco draws only the lines in view — print writes the file's full text; capture is the visible editor.",
  },
  "content-plan-payload": dom("What a content plan's agents are handed; plain DOM text."),
  "war-room-resources": dom("A room's or thread's resource list; plain DOM."),
  "comment-thread": dom("A record's comment threads; plain DOM — the composer prints as an empty box."),
  "group-chat-inspector": dom("Who sees what in a room; plain DOM."),
  "page-panel": dom("A page's own panel (row detail, form); an embedded frame in it prints as a notice, a canvas as its picture."),
};

/** Applies the table: a "none" decision becomes `print: false` / `capture: false` on the kind. */
export function withOutputDecisions(kinds: readonly AnyCanvasKind[]): readonly AnyCanvasKind[] {
  return kinds.map((kind) => {
    const decision = KIND_OUTPUT_DECISIONS[kind.id];
    if (!decision) return kind;
    return {
      ...kind,
      ...(decision.print === "none" ? { print: false as const } : {}),
      ...(decision.capture === "none" ? { capture: false as const } : {}),
    };
  });
}
