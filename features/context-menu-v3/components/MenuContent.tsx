"use client";

// features/context-menu-v3/components/MenuContent.tsx
//
// The DESKTOP renderer (T1) — loaded by the shell via next/dynamic({ssr:false})
// on the first open only. Pure PRESENTATION: every piece of behavior (the
// single deduped fetch, scope resolution, rich-document actions, launch /
// clipboard / compare / overlay handlers) lives in `useContextMenuActions`,
// shared 1:1 with the mobile renderer. Do NOT add a handler here — add it to
// the hook so both renderers inherit it.
//
// Since 2026-08-22 the renderer is MODEL-DRIVEN:
//   engine → `buildMenuModel` (WHAT exists, one declarative tree)
//          → `arrangeMenu` (HOW it is laid out: classic / tiered / command)
//          → this file (draws nodes at the chosen density).
// A layout or density change is a pure function over the model, never a
// second renderer; the menu's behaviour is identical across all of them.
//
// Two failure classes are killed structurally in the hook:
//   1. "Fake menu" — Copy is source-gated on `resolveActionText`, which falls
//      back to the DOM-captured content, so right-clicking read-only content
//      always copies. `reportMenuDiagnostics` SCREAMS in dev if a menu opens
//      with nothing to act on.
//   2. Lost values — `resolveApplicationScope` guarantees the 5 baselines and
//      passes every surface-declared value through; the audit screams on gaps.
//
// Modals/windows are dispatched through the OverlayController (no modal code
// here).

import React, { useEffect, useRef, useState } from "react";
import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuLabel,
} from "@/components/ui/context-menu/context-menu";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronRight, Loader2, Search, Type } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { useContextMenuActions } from "../hooks/useContextMenuActions";
import {
  buildMenuModel,
  type MenuLeafNode,
  type MenuNode,
  type MenuSection,
  type MenuSubmenuNode,
} from "../model/menu-model";
import { arrangeMenu, collectAllLeaves, filterLeaves } from "../model/layouts";
import type { ContextMenuDensity, MenuContentProps } from "../types";

function truncatePreview(text: string): string {
  const t = text.trim();
  if (t.length <= 50) return `"${t}"`;
  return `"${t.substring(0, 20)}...${t.substring(t.length - 20)}"`;
}

// ── Density tokens ──────────────────────────────────────────────────────────
// One object per density; every row / icon / label reads from it so the two
// densities can never drift apart in a single row.
interface DensityTokens {
  row: string;
  icon: string;
  label: string;
  hint: string;
  description: string;
  subWidth: string;
  stripBtn: string;
  stripIcon: string;
  filter: string;
}
const DENSITY: Record<ContextMenuDensity, DensityTokens> = {
  comfortable: {
    row: "",
    icon: "h-4 w-4 mr-2",
    label: "px-2 py-1.5 text-xs text-muted-foreground",
    hint: "ml-auto pl-3 text-xs text-muted-foreground",
    description: "text-xs text-muted-foreground",
    subWidth: "w-60",
    stripBtn: "h-8",
    stripIcon: "h-4 w-4",
    filter: "h-8 text-[13px]",
  },
  compact: {
    row: "py-1 text-[13px] leading-5",
    icon: "h-3.5 w-3.5 mr-2",
    label: "px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/80",
    hint: "ml-auto pl-3 text-[11px] text-muted-foreground",
    description: "text-[11px] text-muted-foreground",
    subWidth: "w-56",
    stripBtn: "h-7",
    stripIcon: "h-3.5 w-3.5",
    filter: "h-7 text-xs",
  },
};

export default function MenuContent(props: MenuContentProps) {
  const { variant, menuLayout, menuDensity } = props;
  const m = useContextMenuActions(props);
  const model = buildMenuModel(m, props);
  const arranged = arrangeMenu(model, menuLayout);
  const d = DENSITY[menuDensity];

  // ── Variant-aware menu primitives ────────────────────────────────────────
  const Item = variant === "context" ? ContextMenuItem : DropdownMenuItem;
  const CheckboxItem =
    variant === "context" ? ContextMenuCheckboxItem : DropdownMenuCheckboxItem;
  const Separator =
    variant === "context" ? ContextMenuSeparator : DropdownMenuSeparator;
  const Sub = variant === "context" ? ContextMenuSub : DropdownMenuSub;
  const SubTrigger =
    variant === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const SubContent =
    variant === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Label = variant === "context" ? ContextMenuLabel : DropdownMenuLabel;

  // ── Generic node renderer ────────────────────────────────────────────────
  const renderIcon = (node: MenuLeafNode | MenuSubmenuNode) => {
    if (!node.icon) return null;
    const Icon = node.icon;
    const iconClassName = "iconClassName" in node ? node.iconClassName : undefined;
    const iconStyle = "iconStyle" in node ? node.iconStyle : undefined;
    return <Icon className={cn(d.icon, iconClassName)} style={iconStyle} />;
  };

  const renderBody = (node: MenuLeafNode) => (
    <>
      {renderIcon(node)}
      {node.description ? (
        <div className="flex min-w-0 flex-col">
          <span className="truncate">{node.label}</span>
          <span className={d.description}>{node.description}</span>
        </div>
      ) : (
        <span className="truncate">{node.label}</span>
      )}
      {node.hint && <span className={d.hint}>{node.hint}</span>}
    </>
  );

  const renderNode = (node: MenuNode): React.ReactElement => {
    switch (node.kind) {
      case "separator":
        return <Separator key={node.id} />;
      case "label":
        return (
          <Label key={node.id} className={d.label}>
            {node.label}
          </Label>
        );
      case "checkbox":
        return (
          <CheckboxItem
            key={node.id}
            checked={node.checked}
            disabled={node.disabled}
            className={d.row}
            // preventDefault keeps the menu OPEN across toggles (checkbox UX).
            onSelect={(e: Event) => e.preventDefault()}
            onCheckedChange={(next: boolean) => node.onCheckedChange(next)}
          >
            {renderBody(node)}
          </CheckboxItem>
        );
      case "link":
        return (
          <Item key={node.id} asChild disabled={node.disabled} className={d.row}>
            <a
              href={node.href}
              target={node.target}
              rel={node.target === "_blank" ? "noopener noreferrer" : undefined}
            >
              {renderBody(node)}
            </a>
          </Item>
        );
      case "submenu": {
        const empty = node.children.length === 0;
        return (
          <Sub key={node.id}>
            <SubTrigger
              disabled={node.disabled}
              className={cn(d.row, node.disabled && "opacity-50 cursor-not-allowed")}
            >
              {renderIcon(node)}
              <span className="truncate">{node.label}</span>
              {node.loading && (
                <Loader2 className="ml-auto h-3 w-3 animate-spin opacity-50" />
              )}
            </SubTrigger>
            <SubContent
              className={cn(
                "z-[9999] max-h-[70dvh] overflow-y-auto",
                node.width ?? d.subWidth,
              )}
            >
              {empty ? (
                <div className="px-2 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {node.emptyLabel ?? "Nothing here"}
                  </p>
                </div>
              ) : (
                node.children.map(renderNode)
              )}
            </SubContent>
          </Sub>
        );
      }
      case "item":
      default:
        return (
          <Item
            key={node.id}
            onSelect={node.onSelect}
            disabled={node.disabled}
            title={node.title}
            className={cn(
              d.row,
              node.destructive && "text-destructive focus:text-destructive",
              node.className,
            )}
          >
            {renderBody(node)}
          </Item>
        );
    }
  };

  const renderSections = (sections: MenuSection[]) => {
    const out: React.ReactElement[] = [];
    sections.forEach((section, idx) => {
      if (section.nodes.length === 0) return;
      if (out.length > 0 && !section.joinPrevious) {
        out.push(<Separator key={`sep:${section.id}:${idx}`} />);
      }
      if (section.label) {
        out.push(
          <Label key={`label:${section.id}`} className={d.label}>
            {section.label}
          </Label>,
        );
      }
      out.push(...section.nodes.map(renderNode));
    });
    return out;
  };

  // ── Strip (tiered / command): icon-only universal verbs in one row ───────
  const strip =
    arranged.strip.length > 0 ? (
      <div className="flex items-stretch gap-0.5 px-1 pb-1" role="group" aria-label="Quick edit">
        {arranged.strip.map((node) =>
          node.kind === "item" ? (
            <Item
              key={node.id}
              onSelect={node.onSelect}
              disabled={node.disabled}
              title={node.hint ? `${node.label} (${node.hint})` : node.label}
              aria-label={node.label}
              className={cn(
                "flex-1 justify-center rounded-md px-0",
                d.stripBtn,
              )}
            >
              {node.icon && (
                <node.icon className={cn(d.stripIcon, node.iconClassName)} />
              )}
            </Item>
          ) : null,
        )}
      </div>
    ) : null;

  // ── Header (selection / content preview) ─────────────────────────────────
  const header = model.header ? (
    <div
      className={cn(
        "border-b border-border bg-primary/5",
        menuDensity === "compact" ? "px-2 py-1.5" : "px-2 py-2",
      )}
    >
      <div className="flex items-start gap-2">
        <Type className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 text-xs font-medium text-primary">
            {model.header.label} ({model.header.text.length} char
            {model.header.text.length !== 1 ? "s" : ""})
          </div>
          {menuDensity !== "compact" && (
            <div className="break-all font-mono text-xs leading-tight text-muted-foreground">
              {truncatePreview(model.header.text)}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  // ── Command layout: type-to-filter over every leaf in the model ──────────
  const isCommand = menuLayout === "command";
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isCommand) return;
    // Radix focuses the menu content on open; take the input after that tick.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isCommand]);

  const menuRoot = () =>
    rootRef.current?.closest<HTMLElement>("[data-radix-menu-content]") ?? null;

  const focusFirstResult = () => {
    const root = menuRoot();
    const first = root?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([data-disabled]), [role="menuitemcheckbox"]:not([data-disabled])',
    );
    first?.focus();
  };

  const onFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape closes the menu (let Radix see it). Everything else stays in the
    // input — Radix's typeahead must not eat the keystrokes.
    if (e.key === "Escape") return;
    if (e.key === "ArrowDown" || (e.key === "Enter" && query.trim())) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Enter") {
        const root = menuRoot();
        const first = root?.querySelector<HTMLElement>(
          '[data-menu-result] [role="menuitem"]:not([data-disabled]), [data-menu-result] [role="menuitemcheckbox"]:not([data-disabled])',
        );
        // Radix runs an item's onSelect from its click handler (Enter is
        // itself implemented as `.click()`), so this goes through Radix's own
        // select path — the menu closes exactly as a mouse click would.
        first?.click();
        return;
      }
      focusFirstResult();
      return;
    }
    e.stopPropagation();
  };

  // Hovering an item moves Radix focus off the input; a printable key then
  // would hit the menu's typeahead instead. Catch it at the root and route it
  // back into the query so "keep typing" always works.
  const onRootKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isCommand) return;
    if (e.target === inputRef.current) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key.length === 1 || e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();
      setQuery((q) => (e.key === "Backspace" ? q.slice(0, -1) : q + e.key));
      inputRef.current?.focus();
    }
  };

  const results = isCommand && query.trim()
    ? filterLeaves(collectAllLeaves(model), query)
    : null;

  const filterBox = isCommand ? (
    <div className="px-1 pb-1">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border bg-background px-2",
          d.filter,
        )}
      >
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFilterKeyDown}
          placeholder="Type to find an action…"
          aria-label="Filter menu actions"
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <span className="text-[10px] text-muted-foreground">
            {results?.length ?? 0}
          </span>
        )}
      </div>
    </div>
  ) : null;

  const resultsList = results ? (
    results.length === 0 ? (
      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
        No actions match “{query.trim()}”
      </div>
    ) : (
      results.map(({ node, path }) => {
        const crumb = path.join(" › ");
        const leaf: MenuLeafNode =
          node.kind === "item"
            ? { ...node, description: crumb || node.description }
            : node;
        return (
          <div key={`result:${node.id}`} data-menu-result="">
            {renderNode(leaf)}
          </div>
        );
      })
    )
  ) : null;

  return (
    <div ref={rootRef} onKeyDownCapture={onRootKeyDownCapture}>
      {header}
      <div className={cn(header && "pt-1")}>
        {filterBox}
        {resultsList ?? (
          <>
            {strip}
            {strip && <Separator />}
            {renderSections(arranged.sections)}
          </>
        )}
      </div>
      {isCommand && !results && (
        <div className="flex items-center gap-1 px-2 pt-1 text-[10px] text-muted-foreground/70">
          <ChevronRight className="h-3 w-3" /> type to filter · ↵ runs the first match
        </div>
      )}
    </div>
  );
}
