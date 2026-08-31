"use client";

/**
 * THE CX DASHBOARD ROW'S ACTIONS — ONE definition of "what you can do to a CX
 * record" (a user request, a conversation, an API iteration, a tool call),
 * shared by every table in the CX dashboard.
 *
 * Mirrors `features/crm/components/crm-row-actions.tsx`: a CX table adds a
 * right-click menu by calling `useCxRowMenu(...)` once, handing the pane's
 * `NonEditableContextMenu` its `resolveContextOnOpen` and putting its
 * `sections` in `extraSections`. Every surface then offers the same doors and
 * the same readable content — never a bespoke per-page menu.
 *
 * 🚨 NO NEW WRITE PATH LIVES HERE — this dashboard is read-only debug tooling;
 * every item here is a door (open/copy), never a mutation.
 */

import { useState } from "react";
import { Copy, ExternalLink, Hash, MessageSquare, Send, SquareArrowOutUpRight } from "lucide-react";

import { toast } from "@/lib/toast";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuEntityRef,
  type ContextMenuExtraItem,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import {
  withAvailability,
  type AvailabilityMap,
} from "@/features/context-menu-v3/utils/availability";
import {
  formatCost,
  formatTokens,
} from "@/features/cx-dashboard/utils/format";
import type {
  CxConversation,
  CxRequest,
  CxToolCall,
  CxUserRequest,
} from "@/features/cx-dashboard/types/cxDashboardTypes";

// ---------------------------------------------------------------------------
// The one thing every CX surface can say about a right-clicked row.
// ---------------------------------------------------------------------------

export type CxMenuTargetKind =
  | "user_request"
  | "conversation"
  | "api_request"
  | "tool_call";

export interface CxMenuTarget {
  kind: CxMenuTargetKind;
  /** The record's own id. */
  id: string;
  /** What the row calls itself, exactly as shown. */
  title: string;
  /** The record's door. `null` when this row has no detail route. */
  href: string | null;
  /** The record as readable text — what Copy / AI actions carry. */
  lines: string[];
  /** The conversation this record belongs to, when it isn't the row itself. */
  conversationId?: string | null;
  /** The user request this record belongs to, when it isn't the row itself. */
  requestId?: string | null;
}

const detailHref = (id: string) =>
  `/administration/chat/cx-dashboard/requests/${id}`;
const conversationHref = (id: string) =>
  `/administration/chat/cx-dashboard/conversations/${id}`;

/**
 * THE ROW'S OWN ENTITY — what a delegated table menu hands v3 so **Attach To**
 * targets the record that was right-clicked. `tool_call` has no registered
 * entity type (no `cx_tool_call` token in the platform registry), so it stays
 * a raw fragment — Attach/Share correctly hide rather than target the wrong
 * record.
 */
export function cxEntityRef(
  target: CxMenuTarget | null,
): ContextMenuEntityRef | null {
  if (!target) return null;
  switch (target.kind) {
    case "user_request":
      return { type: "cx_user_request", id: target.id, title: target.title };
    case "conversation":
      return { type: "conversation", id: target.id, title: target.title };
    case "api_request":
      return { type: "cx_request", id: target.id, title: target.title };
    case "tool_call":
      return null;
  }
}

/** The record as readable text — the menu's `content` value. */
export function cxMenuContent(target: CxMenuTarget | null): string {
  if (!target) return "";
  return [target.title, ...target.lines.filter(Boolean)].join("\n");
}

// ---------------------------------------------------------------------------
// Target builders — one per CX row shape. Each is a pure description.
// ---------------------------------------------------------------------------

export function cxUserRequestMenuTarget(r: CxUserRequest): CxMenuTarget {
  return {
    kind: "user_request",
    id: r.id,
    title: r.conversation_title?.trim() || "Untitled request",
    href: detailHref(r.id),
    conversationId: r.conversation_id,
    lines: [
      `Status: ${r.status}${r.finish_reason ? ` (${r.finish_reason})` : ""}`,
      `Tokens: ${formatTokens(r.total_tokens)}`,
      `Cost: ${formatCost(Number(r.total_cost))}`,
      r.error ? `Error: ${r.error}` : "",
    ],
  };
}

export function cxConversationMenuTarget(c: CxConversation): CxMenuTarget {
  return {
    kind: "conversation",
    id: c.id,
    title: c.title?.trim() || "Untitled conversation",
    href: conversationHref(c.id),
    lines: [
      `Status: ${c.status}`,
      `Messages: ${c.message_count}`,
      c.last_model_id ? `Model: ${c.last_model_id}` : "",
    ],
  };
}

export function cxApiRequestMenuTarget(r: CxRequest): CxMenuTarget {
  return {
    kind: "api_request",
    id: r.id,
    title: `Iteration ${r.iteration}`,
    href: null,
    conversationId: r.conversation_id,
    requestId: r.user_request_id,
    lines: [
      r.ai_model_id ? `Model: ${r.ai_model_id}` : "",
      `Cost: ${formatCost(Number(r.cost))}`,
      r.finish_reason ? `Finish: ${r.finish_reason}` : "",
    ],
  };
}

export function cxToolCallMenuTarget(t: CxToolCall): CxMenuTarget {
  return {
    kind: "tool_call",
    id: t.id,
    title: t.tool_name,
    href: null,
    conversationId: t.conversation_id,
    requestId: t.user_request_id,
    lines: [
      `Type: ${t.tool_type}`,
      t.error_type
        ? `Error: ${t.error_type}${t.error_message ? ` — ${t.error_message}` : ""}`
        : "",
    ],
  };
}

// ---------------------------------------------------------------------------
// The resolver every CX table hands `resolveContextOnOpen`.
// ---------------------------------------------------------------------------

const SECTION_LABEL: Record<CxMenuTargetKind, string> = {
  user_request: "This request",
  conversation: "This conversation",
  api_request: "This iteration",
  tool_call: "This tool call",
};

function copyToClipboard(text: string, done: string) {
  void navigator.clipboard
    .writeText(text)
    .then(() => toast.success(done))
    .catch(() => toast.error("Could not copy to the clipboard"));
}

export interface CxRowMenu {
  /** Hand straight to `NonEditableContextMenu.resolveContextOnOpen`. */
  resolveContextOnOpen: (
    element: HTMLElement | null,
  ) => ResolvedContextMenuContext | null;
  /** Hand straight to `NonEditableContextMenu.extraSections`. */
  sections: ContextMenuExtraSection[];
  /** The row the menu is open on — for a surface that needs it directly. */
  target: CxMenuTarget | null;
}

export interface CxRowMenuOptions<T> {
  /** The rows currently on screen, read at open time (never captured). */
  rows: () => T[];
  toTarget: (row: T) => CxMenuTarget;
  /** Section heading. Defaults to the record's own noun. */
  label?: string;
  /** THE CONSISTENCY STEP — what this surface cannot do, and why. */
  unavailable?: AvailabilityMap;
  /** Anything genuinely local to ONE surface. */
  extraItems?: (target: CxMenuTarget) => ContextMenuExtraItem[];
}

/**
 * ONE MENU PER PANE. `MatrxDataTable` stamps `data-row-id` on every row, so
 * the pane's single menu reads the right-clicked row off the DOM, records it
 * in STATE (not a ref — `resolveContextOnOpen` fires before `MenuContent`
 * mounts, and the state write is what lets the section's items describe the
 * row that was actually clicked), and answers with that row's content +
 * entity.
 */
export function useCxRowMenu<T extends { id: string }>(
  opts: CxRowMenuOptions<T>,
): CxRowMenu {
  const [target, setTarget] = useState<CxMenuTarget | null>(null);

  const resolveContextOnOpen = (element: HTMLElement | null) => {
    const id = element?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? opts.rows().find((r) => String(r.id) === id) : undefined;
    const next = row ? opts.toTarget(row) : null;
    setTarget(next);
    if (!next) return null;
    return {
      content: cxMenuContent(next),
      [CONTEXT_MENU_ENTITY_KEY]: cxEntityRef(next),
    };
  };

  const withTarget = (fn: (t: CxMenuTarget) => void) => () => {
    if (!target) {
      toast.error("Right-click a row to act on it.");
      return;
    }
    fn(target);
  };

  const items: ContextMenuExtraItem[] = [];

  // THE DOOR LAW: every identity this row names must open.
  if (target?.href) {
    items.push({
      kind: "link",
      id: "cx-open",
      label: "Open",
      icon: ExternalLink,
      href: target.href,
    });
    items.push({
      kind: "link",
      id: "cx-open-new-tab",
      label: "Open in a new tab",
      icon: SquareArrowOutUpRight,
      href: target.href,
      target: "_blank",
    });
  }
  if (target?.requestId && target.kind !== "user_request") {
    items.push({
      kind: "link",
      id: "cx-open-request",
      label: "Open request",
      icon: Send,
      href: detailHref(target.requestId),
    });
  }
  if (target?.conversationId && target.kind !== "conversation") {
    items.push({
      kind: "link",
      id: "cx-open-conversation",
      label: "Open conversation",
      icon: MessageSquare,
      href: conversationHref(target.conversationId),
    });
  }
  items.push({
    kind: "item",
    id: "cx-copy-id",
    label: "Copy ID",
    icon: Hash,
    onSelect: withTarget((t) => copyToClipboard(t.id, "ID copied")),
  });
  items.push({
    kind: "item",
    id: "cx-copy-record",
    label: "Copy record as text",
    icon: Copy,
    onSelect: withTarget((t) => copyToClipboard(cxMenuContent(t), "Record copied")),
  });

  if (target && opts.extraItems) items.push(...opts.extraItems(target));

  const section: ContextMenuExtraSection = {
    id: "cx-row",
    label: opts.label ?? SECTION_LABEL[target?.kind ?? "user_request"],
    icon: Hash,
    anchor: "after-compare",
    items,
  };

  return {
    resolveContextOnOpen,
    target,
    sections: [withAvailability(section, opts.unavailable)],
  };
}
