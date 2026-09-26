"use client";

// features/context-menu-v3/components/MobileMenuContent.tsx
//
// The MOBILE renderer (T1m) — loaded by the shell via next/dynamic on first
// open, inside a 70dvh bottom-sheet Drawer. Same engagement-gated cost model as
// the desktop MenuContent.
//
// Pure PRESENTATION: every piece of behavior lives in `useContextMenuActions`
// (shared 1:1 with desktop), so the agent menus (My / Org / System / Default)
// and the values that flow to a launched agent are identical to desktop by
// construction — the old "handlers ported 1:1, keep in lockstep" debt is paid.
// This file only builds and renders the iPhone-style multi-tier DRILL-DOWN
// (tap a category → slide to its list with a back button) at a constant 70%
// height with one internal scroll area.
// It renders the SAME model the desktop menu renders (buildMenuModel) —
// only node shapes are converted here, never a parallel tree (RC-B6).

import React, { useState } from "react";
import {
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import {
  useContextMenuActions,
} from "../hooks/useContextMenuActions";
import {
  buildMenuModel,
  type MenuNode,
} from "../model/menu-model";
import type {
  MenuContentProps,
} from "../types";

export interface MobileMenuContentProps
  extends Omit<MenuContentProps, "variant"> {
  /** Close the bottom sheet (run after any terminal action). */
  onClose: () => void;
}

// ── Drill-down node model ────────────────────────────────────────────────────
type Icon = React.ComponentType<{ className?: string }>;

type MobileNode =
  | {
      kind: "action";
      id: string;
      label: string;
      icon: Icon;
      iconClass?: string;
      onSelect: () => void;
      disabled?: boolean;
      destructive?: boolean;
      hint?: string;
      sublabel?: string;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      icon: Icon;
      iconClass?: string;
      disabled?: boolean;
      loading?: boolean;
      children: MobileNode[];
      emptyLabel?: string;
    }
  | { kind: "section"; id: string; label: string }
  | { kind: "separator"; id: string };

function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 60) return t;
  return `${t.substring(0, 30)}…${t.substring(t.length - 20)}`;
}

export default function MobileMenuContent(props: MobileMenuContentProps) {
  const {
    onClose,
  } = props;

  const m = useContextMenuActions(props);
  const {
    actionText,
    loading,
  } = m;

  // Wrap a terminal action so it closes the sheet after firing.
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  // ── The drill-down model IS the desktop model ──────────────────────────────
  // One engine (`useContextMenuActions`) → one model (`buildMenuModel`) → both
  // renderers. The sheet used to assemble its own parallel tree, which is how
  // the phone drifted from the desktop menu and from the ⋯ menu (RC-B6: one
  // registry tree behind every menu). Now it only converts node shapes.
  const model = buildMenuModel(m, props);
  const NoIcon: Icon = () => null;
  const toMobile = (node: MenuNode): MobileNode | null => {
    const icon = (node as { icon?: Icon }).icon ?? NoIcon;
    const iconClass = (node as { iconClassName?: string }).iconClassName;
    switch (node.kind) {
      case "separator":
        return { kind: "separator", id: node.id };
      case "label":
        return { kind: "section", id: node.id, label: node.label };
      case "submenu":
        return {
          kind: "submenu",
          id: node.id,
          label: node.label,
          icon,
          iconClass,
          disabled: node.disabled,
          loading: node.loading,
          emptyLabel: node.emptyLabel,
          children: node.children
            .map(toMobile)
            .filter((n): n is MobileNode => n !== null),
        };
      case "checkbox":
        return {
          kind: "action",
          id: node.id,
          label: node.label,
          icon,
          disabled: node.disabled,
          hint: node.hint,
          sublabel: node.description,
          onSelect: close(() => node.onCheckedChange(!node.checked)),
        };
      case "link":
        return {
          kind: "action",
          id: node.id,
          label: node.label,
          icon,
          disabled: node.disabled,
          hint: node.hint,
          sublabel: node.description,
          onSelect: close(() => {
            if (node.target === "_blank") window.open(node.href, "_blank", "noopener,noreferrer");
            else window.location.assign(node.href);
          }),
        };
      case "item":
      default:
        return {
          kind: "action",
          id: node.id,
          label: node.label,
          icon,
          iconClass,
          disabled: node.disabled,
          destructive: node.destructive,
          hint: node.hint,
          sublabel: node.description,
          onSelect: close(node.onSelect),
        };
    }
  };
  const rootNodes: MobileNode[] = [];
  model.sections.forEach((section, index) => {
    if (index > 0 && !section.joinPrevious) {
      rootNodes.push({ kind: "separator", id: `sep:${section.id}` });
    }
    if (section.label) {
      rootNodes.push({ kind: "section", id: `label:${section.id}`, label: section.label });
    }
    for (const node of section.nodes) {
      const mobile = toMobile(node);
      if (mobile) rootNodes.push(mobile);
    }
  });

  // ── Drill-down navigation ───────────────────────────────────────────────────
  // The path is a list of submenu ids. The current page is re-derived from the
  // freshly-built rootNodes every render, so a page reflects LIVE data (agents
  // finishing loading, debug toggling) instead of a stale snapshot.
  const [path, setPath] = useState<string[]>([]);
  let levelNodes: MobileNode[] = rootNodes;
  let currentTitle: string | null = null;
  let currentEmpty: string | undefined;
  const validPath: string[] = [];
  for (const id of path) {
    const found = levelNodes.find(
      (n): n is Extract<MobileNode, { kind: "submenu" }> =>
        n.kind === "submenu" && n.id === id,
    );
    if (!found) break;
    levelNodes = found.children;
    currentTitle = found.label;
    currentEmpty = found.emptyLabel;
    validPath.push(id);
  }
  // THE NO-DEAD-CONTROLS RULE (law 4, same as the desktop layouts'
  // `pruneUnavailable`): an unavailable row is absent, never greyed; a
  // submenu with nothing usable inside disappears with it.
  const usable = (list: MobileNode[]): MobileNode[] => {
    const kept: MobileNode[] = [];
    for (const n of list) {
      if (n.kind === "action" && n.disabled) continue;
      if (n.kind === "submenu") {
        if (n.disabled && !n.loading) continue;
        const kids = usable(n.children);
        const actionable = kids.some((k) => k.kind === "action" || k.kind === "submenu");
        if (!actionable && !n.loading && !n.emptyLabel) continue;
        kept.push({ ...n, children: kids });
        continue;
      }
      kept.push(n);
    }
    // No leading, trailing or doubled separators.
    return kept.filter(
      (n, i, arr) =>
        n.kind !== "separator" ||
        (i > 0 && i < arr.length - 1 && arr[i - 1].kind !== "separator"),
    );
  };
  const nodes = usable(levelNodes);
  const atRoot = validPath.length === 0;

  // The sheet names the surface in the person's words (the same label the
  // surface row carries, e.g. "Assistant Message") — never a registry id like
  // "matrx-user/assistant-message".
  const surfaceRow = m.surfaceSection.items.find((item) => "label" in item && item.label);
  const sheetTitle =
    (surfaceRow && "label" in surfaceRow ? surfaceRow.label : null) ?? "Actions";

  const headerLabel =
    actionText.source === "selection"
      ? "Selected"
      : actionText.source === "content"
        ? "Content"
        : null;

  const renderRow = (node: MobileNode): React.ReactElement => {
    if (node.kind === "separator")
      return <div key={node.id} className="my-1 h-px bg-border" />;
    if (node.kind === "section")
      return (
        <div
          key={node.id}
          className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {node.label}
        </div>
      );
    const Icon = node.icon;
    if (node.kind === "submenu") {
      const disabled = node.disabled;
      return (
        <button
          key={node.id}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setPath((p) => [...p, node.id])}
          className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px] transition-colors active:bg-accent disabled:opacity-40 min-h-[48px]"
        >
          <Icon className={`h-5 w-5 shrink-0 ${node.iconClass ?? ""}`} />
          <span className="flex-1 truncate">{node.label}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      );
    }
    return (
      <button
        key={node.id}
        type="button"
        disabled={node.disabled}
        onClick={node.onSelect}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-[15px] transition-colors active:bg-accent disabled:opacity-40 min-h-[48px] ${
          node.destructive ? "text-destructive" : ""
        }`}
      >
        <Icon className={`h-5 w-5 shrink-0 ${node.iconClass ?? ""}`} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{node.label}</span>
          {node.sublabel && (
            <span className="truncate text-xs text-muted-foreground">
              {node.sublabel}
            </span>
          )}
        </span>
        {node.hint && (
          <span className="ml-auto text-xs text-muted-foreground">
            {node.hint}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header — back / title / close. Constant chrome; the list scrolls. */}
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        {!atRoot ? (
          <button
            type="button"
            onClick={() => setPath((p) => p.slice(0, -1))}
            className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-primary active:bg-accent"
          >
            <ChevronLeft className="h-5 w-5" />
            Back
          </button>
        ) : (
          <span className="px-2 text-sm font-semibold text-foreground">
            {sheetTitle}
          </span>
        )}
        <span className="flex-1 truncate text-center text-sm font-semibold">
          {currentTitle ?? ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1.5 text-muted-foreground active:bg-accent"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Selection / content preview — root level only. */}
      {atRoot && headerLabel && (
        <div className="border-b border-border bg-primary/5 px-3 py-2">
          <div className="text-[11px] font-medium text-primary">
            {headerLabel} ({actionText.text.length} char
            {actionText.text.length !== 1 ? "s" : ""})
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {truncatePreview(actionText.text)}
          </div>
        </div>
      )}

      {/* The single internal scroll area. Height stays constant (70dvh shell). */}
      <div className="flex-1 overflow-y-auto px-1 py-1 pb-safe">
        {nodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {currentEmpty ?? "Nothing here"}
          </div>
        ) : (
          nodes.map(renderRow)
        )}
      </div>
    </div>
  );
}
