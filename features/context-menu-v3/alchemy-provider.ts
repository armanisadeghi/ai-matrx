// features/context-menu-v3/alchemy-provider.ts
//
// The context menu's actions as a provider of the ONE Alchemy action registry
// (Matrx Alchemy ALC-15 S3, LIST A2). The engine hook (`useContextMenuActions`)
// still decides WHAT exists — clipboard verbs, selection-aware listening, the
// agent libraries, history, surface sections, the surface submenu — and
// `buildMenuModel` still binds every handler. This file turns that model into
// package `Action`s; the package's model, layouts and renderers draw it (bar,
// ⋯, right-click, bottom sheet, palette) — the v3 renderers and layouts are
// gone.
//
//   • The rich-document registry tree inside the model is NOT re-emitted: the
//     rich-document provider contributes those actions from the same click
//     target (composite host). Only the agent libraries folded into its AI
//     submenu come from here — inline in the "ai" group, under no heading,
//     like the rich-document AI rows (the group has no approved name).
//   • A surface section's label ("Cell", "Row · Widget A") names the clicked
//     thing: it is declared `kind: "target"`, never a group heading.
//   • R1: a disabled universal verb (copy, cut, paste, undo, redo, find)
//     greys WITH its sentence; every other unavailable row is absent.
//   • Headings are only names the classic menu already shows ("History",
//     a surface section's own label, the surface's display label).

import { fieldPreview } from "./utils/field-menu-header";
import type { Action, ActionCategory, ClickTarget, Eligibility } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { stripTurnTrust } from "@/features/education/tutor/turnTrust";
import { markdownToPlainText } from "@/lib/markdown/plain-text";
import type { MenuModel, MenuNode, MenuSection } from "./model/menu-model";

export interface ContextMenuTargetHost {
  kind: "context-menu";
  /** The menu instance (one open menu = one provider registration). */
  instanceId: string;
}

/** Composite host: a right-click target can carry both providers' halves. */
export interface CompositeTargetHost {
  contextMenu?: ContextMenuTargetHost;
  richDocument?: unknown;
}

export function contextMenuHostOf(target: ClickTarget): ContextMenuTargetHost | null {
  const host = target.host as (CompositeTargetHost & Partial<ContextMenuTargetHost>) | undefined;
  if (!host) return null;
  if (host.kind === "context-menu" && typeof host.instanceId === "string") {
    return host as ContextMenuTargetHost;
  }
  return host.contextMenu ?? null;
}

const VERBS: Record<string, { verb: "copy" | "cut" | "paste" | "undo" | "redo" | "find"; sentence: string }> = {
  copy: { verb: "copy", sentence: "Select text, or right-click content, to copy it." },
  cut: { verb: "cut", sentence: "Cut works on selected text in an editable field." },
  paste: { verb: "paste", sentence: "Paste works in an editable field." },
  undo: { verb: "undo", sentence: "Nothing to undo here." },
  redo: { verb: "redo", sentence: "Nothing to redo here." },
  find: { verb: "find", sentence: "Find works where there is text." },
};

/**
 * Verbs that only mean something where the person can edit: on a read-only
 * target (a table row, rendered content) an unavailable one is ABSENT rather
 * than greyed — Cut / Paste / Undo on a row is noise, and it pushes the row's
 * own section down (page-pass 2026-09-27). Where the target is editable they
 * grey with their sentence as before (R1 c).
 */
const EDIT_ONLY_VERBS = new Set(["cut", "paste", "undo", "redo"]);

/** v3 section group → the action category that lands in the same package group. */
const CATEGORY_OF: Record<MenuSection["group"], ActionCategory> = {
  clipboard: "clipboard",
  tools: "app",
  history: "history",
  share: "share",
  document: "save",
  surface: "edit",
  ai: "ai",
  quick: "feedback",
  editable: "edit",
  admin: "admin",
  "surface-info": "surface-info",
};

/** Clipboard-section rows that are not universal verbs sit with in-place tools. */
const NON_VERB_CLIPBOARD: Record<string, ActionCategory> = {
  "select-all": "edit",
  "insert-reference": "edit",
};

export interface ProviderOptions {
  /**
   * Resolves with the NEXT model the engine hook builds. A library still
   * loading (the first agent fetch) waits on it instead of vanishing.
   */
  nextModel?: () => Promise<MenuModel>;
  /**
   * Whether THIS menu instance edits its surface (`isEditable`). A read-only
   * wrapper over rich content still gets a writable rich-document target
   * (actions may write back to the SOURCE), so `target.readOnly` alone cannot
   * say "the person cannot type here" — this can (live 2026-09-27: a table
   * row's menu still drew Cut / Paste / Undo / Redo).
   */
  editable?: boolean;
}

/** Rows that INSERT content into the surface: absent on a read-only source. */
const INSERTS_CONTENT = new Set(["placement:content-block"]);

function findNodeById(nodes: readonly MenuNode[], id: string): MenuNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kind === "submenu") {
      const hit = findNodeById(n.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

interface Placement {
  category: ActionCategory;
  section?: Action["section"];
  order: number;
}

const available: Eligibility = { status: "available" };
const absent: Eligibility = { status: "absent" };

function icon(node: { icon?: unknown }): string | undefined {
  return node.icon ? registerAlchemyIcon(node.icon) : undefined;
}

/** The row starts a new group: the menu draws a divider above it (alchemy `Action.startsGroup`). */
function startGroup(a: Action): void {
  Object.assign(a, { startsGroup: true });
}

/** One v3 node → one package action (submenus expand to their rows). */
function toAction(node: MenuNode, place: Placement, instanceId: string, opts: ProviderOptions = {}): Action | null {
  if (node.kind === "separator" || node.kind === "label") return null;
  const id = `cm:${node.id}`;
  const own = (t: ClickTarget) => contextMenuHostOf(t)?.instanceId === instanceId;
  const base = {
    id,
    label: node.label,
    category: place.category,
    order: place.order,
    ...(place.section ? { section: place.section } : {}),
    ...(icon(node) ? { icon: icon(node) } : {}),
    ...("iconClassName" in node && node.iconClassName ? { iconTone: node.iconClassName } : {}),
    ...("description" in node && node.description ? { description: node.description } : {}),
    ...("hint" in node && node.hint ? { hint: node.hint } : {}),
  };
  if (node.kind === "submenu") {
    const inserts = INSERTS_CONTENT.has(node.id);
    return {
      ...base,
      // Still loading at the source: every layout shows "Loading…" on the row.
      pending: () => Boolean(node.loading),
      eligible: (t) => {
        if (!own(t)) return absent;
        if (inserts && (t.readOnly || opts.editable === false)) return absent;
        // Still loading: SHOWN (as loading), never silently absent (round 2).
        if (node.loading) return available;
        return !node.disabled && hasRows(node.children) ? available : absent;
      },
      expand: async (t) => {
        let current: MenuNode = node;
        // Wait for the library's first load (bounded), then read its rows
        // from the model that has them.
        for (let i = 0; current.kind === "submenu" && current.loading && opts.nextModel && i < 20; i++) {
          const next = await opts.nextModel();
          const found = next.sections.map((s) => findNodeById(s.nodes, node.id)).find(Boolean);
          if (!found) return [];
          current = found;
        }
        if (current.kind !== "submenu") return [];
        void t;
        // THE SUBMENU KEEPS ITS GROUPS (DATA-V2-BASICS-2): each run of rows between the source's
        // separators is one section, and the menu draws a divider where the section changes
        // (alchemy withGroupDividers) — "Delete row…" in its own group, never beside Highlight.
        const rows: Action[] = [];
        let startsNext = false;
        for (const child of current.children) {
          if (child.kind === "separator") {
            startsNext = rows.length > 0;
            continue;
          }
          // An empty category (or a row that cannot run) is ABSENT (R1) —
          // never a "No items in …" panel, never a dead row.
          if (unusable(child)) continue;
          const a = toAction(child, { ...place, section: undefined, order: rows.length }, instanceId, opts);
          if (!a) continue;
          if (startsNext) startGroup(a);
          startsNext = false;
          rows.push(a);
        }
        return rows;
      },
      run: () => undefined,
    };
  }
  if (node.kind === "link") {
    return { ...base, href: node.href, eligible: (t) => (own(t) && !node.disabled ? available : absent), run: () => undefined };
  }
  if (node.kind === "checkbox") {
    return {
      ...base,
      toggle: true,
      pressed: () => node.checked,
      eligible: (t) => (own(t) && !node.disabled ? available : absent),
      run: () => node.onCheckedChange(!node.checked),
    };
  }
  const verb = place.category === "clipboard" ? VERBS[node.id] : undefined;
  return {
    ...base,
    ...(verb ? { verb: verb.verb } : {}),
    ...(node.destructive ? { destructive: true } : {}),
    eligible: (t) => {
      if (!own(t)) return absent;
      if (!node.disabled) return available;
      if (verb && (t.readOnly || opts.editable === false) && EDIT_ONLY_VERBS.has(verb.verb)) return absent;
      // R1 (c): a universal verb greys, and it says why.
      if (verb) return { status: "unavailable-verb", verb: verb.verb, sentence: verb.sentence };
      // ABSENT OR HONEST (admin pass 2026-09-27): a row that is off FOR A REASON it states
      // ("Manifested surfaces are managed in code") stays, greyed, with the reason. With no
      // reason it is absent.
      const reason = "description" in node && typeof node.description === "string" ? node.description.trim() : "";
      return reason ? { status: "unavailable", sentence: reason } : absent;
    },
    run: () => node.onSelect(),
  };
}

/** A row that can never run here: a disabled leaf, or a submenu with nothing to open. */
function unusable(node: MenuNode): boolean {
  if (node.kind === "separator" || node.kind === "label") return false;
  if (node.kind === "submenu") return !node.loading && (Boolean(node.disabled) || !hasRows(node.children));
  // A disabled row that says why stays (greyed, with its reason); one with no reason cannot run.
  if (!("disabled" in node) || !node.disabled) return false;
  return !("description" in node && typeof node.description === "string" && node.description.trim());
}

function hasRows(nodes: MenuNode[]): boolean {
  return nodes.some((n) => (n.kind === "submenu" ? n.loading || hasRows(n.children) : n.kind !== "separator" && n.kind !== "label"));
}

/**
 * The model → the actions this menu instance contributes. Rich-document rows
 * (`rich:` leaves) are skipped: the rich-document provider supplies them.
 */
export function contextMenuActionsFromModel(model: MenuModel, instanceId: string, opts: ProviderOptions = {}): Action[] {
  const out: Action[] = [];
  model.sections.forEach((section, sectionIndex) => {
    const base = sectionIndex * 100;
    if (section.id === "registry") {
      // Only the agent libraries folded into the registry's AI submenu are ours.
      section.nodes.forEach((node, i) => {
        if (node.kind !== "submenu" || !node.id.startsWith("rich-sub:")) return;
        const libraries = node.children.filter((c) => !c.id.startsWith("rich") && c.kind !== "separator");
        libraries.forEach((lib, j) => {
          const a = toAction(
            lib,
            {
              category: "ai",
              order: 5_000 + i * 50 + j,
            },
            instanceId,
            opts,
          );
          if (a) out.push(a);
        });
      });
      return;
    }
    // A section with no declared label has no heading — never fabricate one
    // (not even ""): the package's own contract is "no declared name → no
    // heading, rows show inline, never folded" (`@ai-matrx/alchemy/menu`
    // `buildMenuModel` doc). The empty-string fallback that used to sit here
    // for a labelless `primary` section (e.g. notes'
    // `buildNoteContextSections`'s unlabeled "note-actions" section) declared
    // a REAL heading of `""`, which is never an approved heading — every menu
    // carrying one threw `UnapprovedHeadingError` and refused to open
    // (2026-09-28). Ordering for a `primary` section is already handled
    // upstream by `liftPrimarySections` on the v3 `MenuSection[]`, so
    // dropping the heading here costs nothing but the (non-existent) label.
    const named =
      section.group === "history"
        ? { id: "cm-history", label: "History" }
        : section.label
          ? {
              id: `cm-${section.id}`,
              label: section.label,
              ...(section.primary ? { primary: true } : {}),
              // A surface section's label is the clicked thing's own name.
              ...(section.group === "surface" ? { kind: "target" as const } : {}),
            }
          : undefined;
    // A separator in the source starts a new group: the next row carries `startsGroup` and the
    // menu draws the divider (alchemy buildMenuModel) — "Delete row…" in its own group (DATA-V2-BASICS-2).
    let groupStarts = false;
    section.nodes.forEach((node, i) => {
      if (node.kind === "separator") {
        groupStarts = true;
        return;
      }
      const category =
        section.group === "clipboard" ? (NON_VERB_CLIPBOARD[node.id] ?? "clipboard") : CATEGORY_OF[section.group];
      // Undo / Redo are universal verbs: they ride the strip, not the History fold.
      const isHistoryVerb = section.group === "history" && (node.id === "undo" || node.id === "redo");
      const a = toAction(
        node,
        {
          category: isHistoryVerb ? "clipboard" : category,
          ...(named && !isHistoryVerb ? { section: named } : {}),
          order: base + i,
        },
        instanceId,
        opts,
      );
      if (a) {
        if (groupStarts) startGroup(a);
        groupStarts = false;
        out.push(a);
      }
    });
  });
  return out;
}

/** A cheap fingerprint of what the menu would draw (re-resolve when it moves). */
export function modelRevision(model: MenuModel): string {
  const walk = (nodes: MenuNode[]): string =>
    nodes
      .map((n) =>
        n.kind === "submenu"
          ? `${n.id}${n.disabled ? "!" : ""}${n.loading ? "~" : ""}[${walk(n.children)}]`
          : `${n.id}${"disabled" in n && n.disabled ? "!" : ""}${n.kind === "checkbox" && n.checked ? "*" : ""}${"label" in n ? `:${n.label}` : ""}`,
      )
      .join(",");
  return model.sections.map((s) => `${s.id}(${walk(s.nodes)})`).join("|");
}

/**
 * The text the menu's "Content: …" header shows for what the menu acts on —
 * without storage plumbing: the tutor's trust comment goes through the ONE
 * strip copies and files use (live 2026-09-26: the header showed
 * `<!--MATRX_TRUST_V1 …-->` on every tutor answer).
 */
export function menuHeaderContent(actionText: { source: string; text: string }): string | null {
  if (actionText.source === "none") return null;
  return headerPreview(stripTurnTrust(actionText.text));
}

/** The transcript store slice `chatMessageSubject` reads (RootState["messages"]). */
interface TranscriptStoreSlice {
  messages?: {
    byConversationId?: Record<
      string,
      { byId?: Record<string, { role?: unknown; createdAt?: string | null } | undefined> } | undefined
    >;
  };
}

/**
 * THE MESSAGE A MENU WAS OPENED ON — one answer for every menu over a chat
 * transcript, so the same message gets the same heading everywhere ("AI answer
 * · Sep 27, 6:50 PM", "Your message · …").
 *
 * Two doors name a message and both land here:
 *   1. the menu's own content source is that message (`chat-message` — the
 *      per-answer registry menu);
 *   2. the menu is the transcript-level one and the right-click resolved the
 *      message under the pointer (`messageId` in the per-open context —
 *      `resolveMarkdownContext` reads the `data-message-id` every message root
 *      carries). Run History's user turns and any answer area outside the
 *      per-answer menu came through here and were headed "Content: <the whole
 *      text>" (2026-09-28).
 */
export function chatMessageSubject(args: {
  state: TranscriptStoreSlice;
  source: { type: string; conversationId?: string; messageId?: string } | null | undefined;
  extensions?: { type?: string; role?: unknown } | null;
  contextData?: Record<string, unknown> | null;
}): { role: string; createdAt: string | null } | null {
  const { state, source, extensions, contextData } = args;
  const read = (conversationId: unknown, messageId: unknown) =>
    typeof conversationId === "string" && typeof messageId === "string"
      ? state.messages?.byConversationId?.[conversationId]?.byId?.[messageId]
      : undefined;
  if (source?.type === "chat-message") {
    const record = read(source.conversationId, source.messageId);
    const role = record?.role ?? (extensions?.type === "chat-message" ? extensions.role : null);
    return role ? { role: String(role), createdAt: record?.createdAt ?? null } : null;
  }
  const record = read(contextData?.conversationId, contextData?.messageId);
  return record?.role ? { role: String(record.role), createdAt: record.createdAt ?? null } : null;
}

/**
 * The header for a menu opened in a FIELD with no selection: the field's name
 * and, when it helps, a short plain preview (`utils/field-menu-header.ts`).
 * Anything else keeps `menuHeaderContent`.
 */
export function menuHeader(
  actionText: { source: string; text: string },
  fieldLabel: string | null,
  /** The chat message the menu opened on, when it did (its role and when it was written). */
  message?: { role: string; createdAt?: string | null } | null,
): { content: string | null; contentLabel: string | null } {
  // A MESSAGE is named, never dumped: "AI answer", not "Content: <the whole answer>"
  // (page-pass 2026-09-27, agent-app Run History). A selection still shows itself.
  if (message && actionText.source !== "selection" && actionText.source !== "none") {
    const who = message.role === "user" ? "Your message" : message.role === "assistant" ? "AI answer" : "Message";
    const at = message.createdAt ? new Date(message.createdAt) : null;
    const when =
      at && !Number.isNaN(at.getTime())
        ? ` · ${at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "";
    return { content: "", contentLabel: `${who}${when}` };
  }
  if (fieldLabel && actionText.source !== "selection") {
    return { content: fieldPreview(headerPreview(stripTurnTrust(actionText.text))), contentLabel: fieldLabel };
  }
  return { content: menuHeaderContent(actionText), contentLabel: null };
}

/**
 * The header is a one-line PREVIEW, so it shows words, never markdown syntax:
 * "Content: # Clinic intake…" on /notes/<id> (page-pass 2026-09-27). Block
 * markers (headings, quotes, list bullets, task boxes, fences) are dropped per
 * line, inline emphasis goes through THE plain-text helper, and lines join
 * with a space. Only the header changes — the actions still act on the text
 * as written.
 */
export function headerPreview(text: string): string {
  const blocks = text
    .replace(/^\s{0,3}(?:```|~~~).*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "");
  return markdownToPlainText(blocks).replace(/\s*\n+\s*/g, " ").trim();
}

/**
 * A target that NAMES itself (`CONTEXT_MENU_HEADING_KEY`: a list row's record)
 * heads the menu with that name — "Quiz: Unit 2 review" — instead of the
 * generic "Content: <agent context>" (page-pass 2026-09-27). A selection still
 * shows itself.
 */
export function namedHeader(
  heading: { label: string; text: string } | null | undefined,
  actionText: { source: string },
): { content: string; contentLabel: string } | null {
  if (!heading || actionText.source === "selection") return null;
  return { content: heading.text, contentLabel: heading.label };
}
