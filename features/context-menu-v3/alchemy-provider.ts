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
//     target (composite host). Only the agent libraries folded into its
//     "Improve with AI" submenu come from here, in that same named section.
//   • R1: a disabled universal verb (copy, cut, paste, undo, redo, find)
//     greys WITH its sentence; every other unavailable row is absent.
//   • Headings are only names the classic menu already shows ("History",
//     a surface section's own label, the surface's display label).

import type { Action, ActionCategory, ClickTarget, Eligibility } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { richDocumentSectionId } from "@/features/rich-document/actions/provider";
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

/** v3 section group → the action category that lands in the same package group. */
const CATEGORY_OF: Record<MenuSection["group"], ActionCategory> = {
  clipboard: "clipboard",
  tools: "app",
  history: "history",
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

/** One v3 node → one package action (submenus expand to their rows). */
function toAction(node: MenuNode, place: Placement, instanceId: string): Action | null {
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
    const children = node.children;
    return {
      ...base,
      ...(node.emptyLabel ? { emptyLabel: node.emptyLabel } : {}),
      eligible: (t) => (own(t) && !node.disabled && (node.loading || hasRows(children)) ? available : absent),
      expand: async () =>
        children
          .map((child, index) => toAction(child, { ...place, section: undefined, order: index }, instanceId))
          .filter((a): a is Action => a !== null),
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
      // R1 (c): only a universal verb greys, and it says why.
      return verb ? { status: "unavailable-verb", verb: verb.verb, sentence: verb.sentence } : absent;
    },
    run: () => node.onSelect(),
  };
}

function hasRows(nodes: MenuNode[]): boolean {
  return nodes.some((n) => (n.kind === "submenu" ? n.loading || hasRows(n.children) : n.kind !== "separator" && n.kind !== "label"));
}

/**
 * The model → the actions this menu instance contributes. Rich-document rows
 * (`rich:` leaves) are skipped: the rich-document provider supplies them.
 */
export function contextMenuActionsFromModel(model: MenuModel, instanceId: string): Action[] {
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
              section: { id: richDocumentSectionId(node.label), label: node.label },
              order: 5_000 + i * 50 + j,
            },
            instanceId,
          );
          if (a) out.push(a);
        });
      });
      return;
    }
    const named =
      section.group === "history"
        ? { id: "cm-history", label: "History" }
        : section.label
          ? { id: `cm-${section.id}`, label: section.label, ...(section.primary ? { primary: true } : {}) }
          : section.primary
            ? { id: `cm-${section.id}`, label: section.label ?? "", primary: true }
            : undefined;
    section.nodes.forEach((node, i) => {
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
      );
      if (a) out.push(a);
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
