"use client";

// features/context-menu-v3/designs/DesignMenuPanel.tsx
//
// The demo-local twin of `@ai-matrx/alchemy/react/menu`'s ContextMenuPanel, for
// the one arrangement the package cannot express: the icon strip drawn AFTER
// the clicked object's rows (Designs 1 and 3), and greyed rows inside a
// submenu. Same design-system primitives, same classes, same MenuModel (built
// by the package's `buildMenuModel`), same filter (`palette` + `filterPalette`).
// Every other case is drawn by the package itself. Demo-only — nothing in
// production imports this.

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@ai-matrx/design-system";
import { filterPalette, palette, type MenuLeafNode, type MenuModel, type MenuNode, type MenuSection } from "@ai-matrx/alchemy/menu";
import { resolveAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import type { DesignArranged } from "./model";

function Glyph({ icon, tone }: { icon?: string; tone?: string }) {
  if (!icon) return null;
  const icon_ = resolveAlchemyIcon(icon);
  return icon_ ? React.createElement(icon_, { className: `h-4 w-4 shrink-0 ${tone ?? ""}` }) : null;
}

interface RowProps {
  node: MenuNode;
  run(node: MenuLeafNode): void;
}

function Row({ node, run }: RowProps): React.ReactElement | null {
  switch (node.kind) {
    case "separator":
      return <DropdownMenuSeparator />;
    case "label":
      return <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{node.label}</DropdownMenuLabel>;
    case "submenu":
      return (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-alchemy-node={node.id} className="gap-2">
            <Glyph icon={node.icon} />
            <span className="truncate">{node.label}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            data-alchemy-submenu={node.id}
            className="w-72 max-w-[calc(100vw-1rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto"
          >
            {node.children.map((c) => (
              <Row key={c.id} node={c} run={run} />
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    case "checkbox":
    case "link":
      return (
        <DropdownMenuItem data-alchemy-node={node.id} onSelect={() => run(node)} className="gap-2">
          <Glyph icon={node.icon} />
          <span className="truncate">{node.label}</span>
        </DropdownMenuItem>
      );
    case "item": {
      const row = (
        <DropdownMenuItem
          data-alchemy-node={node.id}
          aria-disabled={node.unavailable ? true : undefined}
          onSelect={(event) => {
            if (node.unavailable) {
              event.preventDefault();
              return;
            }
            run(node);
          }}
          className={`gap-2 ${node.unavailable ? "opacity-50" : ""} ${node.destructive ? "text-destructive" : ""}`}
        >
          <Glyph icon={node.icon} tone={node.iconTone} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{node.label}</span>
          </span>
          {node.hint ? <span className="ml-auto text-xs text-muted-foreground">{node.hint}</span> : null}
        </DropdownMenuItem>
      );
      if (!node.unavailable) return row;
      return (
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent>{node.unavailable.sentence}</TooltipContent>
        </Tooltip>
      );
    }
  }
}

function Sections({ sections, run, leadingSeparator }: { sections: readonly MenuSection[]; run: RowProps["run"]; leadingSeparator: boolean }) {
  return (
    <>
      {sections.map((s, i) => (
        <React.Fragment key={s.id}>
          {i > 0 || leadingSeparator ? <DropdownMenuSeparator /> : null}
          {s.label ? <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{s.label}</DropdownMenuLabel> : null}
          {s.nodes.map((n) => (
            <Row key={n.id} node={n} run={run} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

function StripButton({ node, run }: { node: MenuLeafNode; run: RowProps["run"] }) {
  const unavailable = node.kind === "item" ? node.unavailable : undefined;
  const tone = node.kind === "item" ? node.iconTone : undefined;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-alchemy-node={node.id}
          aria-label={node.label}
          aria-disabled={unavailable ? true : undefined}
          onClick={() => {
            if (!unavailable) run(node);
          }}
          className={`inline-flex h-7 min-w-7 pointer-coarse:h-11 pointer-coarse:min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${
            unavailable ? "cursor-default opacity-50 hover:bg-transparent" : ""
          }`}
        >
          <Glyph icon={node.icon} tone={tone} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{unavailable ? unavailable.sentence : node.label}</TooltipContent>
    </Tooltip>
  );
}

export interface DesignMenuPanelProps {
  model: MenuModel;
  arranged: DesignArranged;
  point: { x: number; y: number };
  open: boolean;
  onOpenChange(open: boolean): void;
  onRun(label: string): void;
}

export function DesignMenuPanel({ model, arranged, point, open, onOpenChange, onRun }: DesignMenuPanelProps) {
  // One panel per open (the caller keys it), so the filter starts empty every time.
  const [query, setQuery] = React.useState("");
  const filtered = query.trim() ? filterPalette(palette(model), query) : null;
  const run = (node: MenuLeafNode) => {
    onRun(node.label);
    onOpenChange(false);
  };
  const anchor = (
    <DropdownMenuTrigger asChild>
      <span aria-hidden data-alchemy-anchor="context" style={{ position: "fixed", left: point.x, top: point.y, width: 0, height: 0, pointerEvents: "none" }} />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      {typeof document === "undefined" ? anchor : createPortal(anchor, document.body)}
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        data-alchemy-layout="context-design"
        onPointerUpCapture={(event) => {
          if (event.button === 2) event.preventDefault();
        }}
        className="w-72 max-h-[min(var(--radix-dropdown-menu-content-available-height),32rem)] overflow-y-auto"
      >
        <TooltipProvider>
          {model.header ? (
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground" title={model.header.text}>
              {model.header.label}
              {model.header.text.trim() ? `: ${model.header.text}` : null}
            </DropdownMenuLabel>
          ) : null}
          <div className="px-1 pb-1">
            <input
              aria-label="Filter actions"
              placeholder="Type to filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                const first = filtered?.leaves[0]?.node;
                if (e.key === "Enter" && first && first.kind !== "submenu") run(first);
              }}
              className="h-7 w-full rounded-md border border-border bg-transparent px-2 text-sm outline-none"
            />
          </div>
          {filtered ? (
            <>
              <DropdownMenuSeparator />
              {filtered.leaves.length ? (
                filtered.leaves.map(({ node, breadcrumb }) => (
                  <DropdownMenuItem
                    key={node.id}
                    data-alchemy-node={node.id}
                    onSelect={() => {
                      if (node.kind !== "submenu") run(node);
                    }}
                    className="flex-col items-start gap-0"
                  >
                    <span>{node.label}</span>
                    <span className="text-xs text-muted-foreground">{breadcrumb.join(" › ")}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No action matches “{query}”.</div>
              )}
            </>
          ) : (
            <>
              <Sections sections={arranged.before} run={run} leadingSeparator />
              {arranged.strip.length ? (
                <>
                  <DropdownMenuSeparator />
                  <div role="toolbar" aria-label="Clipboard" className="flex items-center gap-0.5 px-1 py-1">
                    {arranged.strip.map((n) => (
                      <StripButton key={n.id} node={n} run={run} />
                    ))}
                  </div>
                </>
              ) : null}
              <Sections sections={arranged.after} run={run} leadingSeparator />
            </>
          )}
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
