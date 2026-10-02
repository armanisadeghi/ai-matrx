"use client";

// features/context-menu-v3/designs/Round2Menu.tsx
//
// Draws a round-2 menu (round2.ts) at the round-2 sizes (sizing.ts):
//   · R2DesktopPanel — the right-click menu (design-system DropdownMenu). With
//     `container` it renders in place, open, for the "All, rendered" page — the
//     same component, so the static copy is the clickable one.
//   · R2SheetBody / R2Sheet — the phone: the same menu as a drill-down sheet.
// Rows run nothing: every choice reports "Would run: …". Demo-only.

import * as React from "react";
import { createPortal } from "react-dom";
import {
  BottomSheet,
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
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { toast } from "@/lib/toast";
import type { DNode } from "./catalog";
import { round2Leaves, type R2Menu, type R2Node } from "./round2";
import { D, P } from "./sizing";
import type { StripIcon } from "./verbs";

type Run = (label: string) => void;

function Glyph({ icon, className }: { icon?: string; className: string }) {
  if (!icon) return <span aria-hidden className={className} />;
  const C = resolveAlchemyIcon(icon);
  return C ? React.createElement(C, { className }) : <span aria-hidden className={className} />;
}

/** One tooltip shape for every icon and seat: the name, then its shortcut or why it is greyed. */
function TipBody({ label, aside }: { label: string; aside?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span>{label}</span>
      {aside ? <span className="opacity-70">{aside}</span> : null}
    </span>
  );
}

function iconAside(i: StripIcon): string | undefined {
  return i.unavailable ?? i.shortcut;
}

// ── Desktop ───────────────────────────────────────────────────────────────────

function DRows({ nodes, run }: { nodes: readonly (DNode | R2Node)[]; run: Run }) {
  return (
    <>
      {nodes.map((n, i) => (
        <React.Fragment key={n.id}>
          {i > 0 && n.startsGroup ? <DropdownMenuSeparator className={D.separator} /> : null}
          <DRow node={n} run={run} />
        </React.Fragment>
      ))}
    </>
  );
}

function DRow({ node, run }: { node: DNode | R2Node; run: Run }) {
  const description = "description" in node ? node.description : undefined;
  const label = (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate">{node.label}</span>
      {description ? <span className={D.description}>{description}</span> : null}
    </span>
  );
  if (node.children) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-alchemy-node={node.id} className={`${D.row} [&>svg:last-child]:h-[18px] [&>svg:last-child]:w-[18px] [&>svg:last-child]:text-muted-foreground`}>
          <Glyph icon={node.icon} className={D.glyph} />
          {label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent data-alchemy-submenu={node.id} className={`${D.submenu} max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`}>
          <DRows nodes={node.children} run={run} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  const item = (
    <DropdownMenuItem
      data-alchemy-node={node.id}
      aria-disabled={node.viewerReason ? true : undefined}
      onSelect={(e) => {
        if (node.viewerReason) {
          e.preventDefault();
          return;
        }
        run(node.label);
      }}
      className={`${D.row} ${node.viewerReason ? "opacity-45" : ""} ${node.destructive ? "text-destructive" : ""}`}
    >
      <Glyph icon={node.icon} className={D.glyph} />
      {label}
      {node.hint ? <span className={D.shortcut}>{node.hint}</span> : null}
    </DropdownMenuItem>
  );
  if (!node.viewerReason) return item;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="left">{node.viewerReason}</TooltipContent>
    </Tooltip>
  );
}

function iconTone(i: StripIcon): string {
  if (i.unavailable) return "cursor-default opacity-40";
  if (i.destructive) return "text-destructive hover:bg-destructive/10 hover:text-destructive";
  return "text-foreground/80 hover:bg-accent hover:text-foreground";
}

function DIcon({ i, run }: { i: StripIcon; run: Run }) {
  const tone = iconTone(i);
  const tip = <TipBody label={i.label} aside={iconAside(i)} />;
  const gap = i.gapBefore ? <span aria-hidden className="mx-1 h-5 w-px bg-border" /> : null;
  // Menu-only icon: the whole icon opens its menu.
  if (!i.runLabel && i.menu) {
    return (
      <>
        {gap}
        <DropdownMenuSub>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuSubTrigger
                data-alchemy-node={i.id}
                aria-label={i.label}
                className={`${D.iconButton} w-auto justify-center gap-0 px-1.5 ${tone} [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3 [&>svg:last-child]:w-3 [&>svg:last-child]:opacity-60`}
              >
                <Glyph icon={i.icon} className={D.glyph} />
              </DropdownMenuSubTrigger>
            </TooltipTrigger>
            <TooltipContent>{tip}</TooltipContent>
          </Tooltip>
          <DropdownMenuSubContent data-alchemy-submenu={i.id} className={`${D.submenu} max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`}>
            <DRows nodes={i.menu} run={run} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </>
    );
  }
  const button = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-alchemy-node={i.id}
          data-owner={i.owner}
          aria-label={i.label}
          aria-disabled={i.unavailable ? true : undefined}
          onClick={() => {
            if (!i.unavailable && i.runLabel) run(i.runLabel);
          }}
          className={`inline-flex shrink-0 items-center justify-center ${D.iconButton} ${tone}`}
        >
          <Glyph icon={i.icon} className={D.glyph} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
  if (!i.menu) return (
    <>
      {gap}
      {button}
    </>
  );
  // Split: the icon runs; the chevron opens the options (formats, voice, compare).
  return (
    <>
      {gap}
      <span className="inline-flex items-center">
        {button}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger
            data-alchemy-node={`${i.id}:options`}
            aria-label={`${i.label} options`}
            className={`${D.splitChevron} -ml-1 justify-center p-0 text-muted-foreground [&>svg:last-child]:ml-0 [&>svg:last-child]:h-3 [&>svg:last-child]:w-3`}
          />
          <DropdownMenuSubContent data-alchemy-submenu={i.id} className={`${D.submenu} max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`}>
            <DRows nodes={i.menu} run={run} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </span>
    </>
  );
}

function DStrip({ icons, run, label }: { icons: readonly StripIcon[]; run: Run; label: string }) {
  return (
    <div role="toolbar" aria-label={label} className={D.strip}>
      {icons.map((i) => (
        <DIcon key={i.id} i={i} run={run} />
      ))}
    </div>
  );
}

export interface R2DesktopPanelProps {
  menu: R2Menu;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRun: Run;
  /** Right-click point; ignored with `container`. */
  point?: { x: number; y: number };
  /** Render in place, open, inside this element (the "All, rendered" page). */
  container?: HTMLElement | null;
}

export function R2DesktopPanel({ menu, open, onOpenChange, onRun, point, container }: R2DesktopPanelProps) {
  const [query, setQuery] = React.useState("");
  const leaves = round2Leaves(menu);
  const q = query.trim().toLowerCase();
  const hits = q ? leaves.filter((l) => l.label.toLowerCase().includes(q) || l.path.some((p) => p.toLowerCase().includes(q))) : null;
  const isStatic = container !== undefined;
  const run: Run = (label) => {
    onRun(label);
    if (!isStatic) onOpenChange(false);
  };
  const anchor = (
    <DropdownMenuTrigger asChild>
      <span
        aria-hidden
        data-alchemy-anchor="context"
        style={isStatic ? { display: "block", width: 0, height: 0 } : { position: "fixed", left: point?.x ?? 0, top: point?.y ?? 0, width: 0, height: 0, pointerEvents: "none" }}
      />
    </DropdownMenuTrigger>
  );
  if (isStatic && !container) return null;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      {isStatic || typeof document === "undefined" ? anchor : createPortal(anchor, document.body)}
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={2}
        collisionPadding={8}
        {...(isStatic ? { container, avoidCollisions: false, onCloseAutoFocus: (e: Event) => e.preventDefault() } : {})}
        data-alchemy-layout="context-round2"
        data-round2={menu.key}
        onPointerUpCapture={(e) => {
          if (e.button === 2) e.preventDefault();
        }}
        className={`${D.menu} ${isStatic ? "max-h-none max-w-full shadow-sm" : "max-h-[min(var(--radix-dropdown-menu-content-available-height),44rem)] overflow-y-auto shadow-lg"}`}
      >
        <TooltipProvider delayDuration={250}>
          {menu.kindLabel ? <DropdownMenuLabel className={D.heading}>{menu.kindLabel}</DropdownMenuLabel> : null}
          {menu.strips.map((s, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <DropdownMenuSeparator className="my-1" /> : null}
              <DStrip icons={s} run={run} label={i === 0 ? "Actions" : "Content"} />
            </React.Fragment>
          ))}
          <div className="px-1 pb-1 pt-1">
            <input
              aria-label="Filter actions"
              placeholder="Type to filter…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                const first = hits?.find((h) => !h.unavailable);
                if (e.key === "Enter" && first) run(first.label);
              }}
              className={D.search}
            />
          </div>
          {hits ? (
            <>
              <DropdownMenuSeparator className={D.separator} />
              {hits.length ? (
                hits.slice(0, 12).map((h) => (
                  <DropdownMenuItem
                    key={`${h.path.join("/")}/${h.id}`}
                    data-alchemy-node={h.id}
                    aria-disabled={h.unavailable ? true : undefined}
                    onSelect={(e) => (h.unavailable ? e.preventDefault() : run(h.label))}
                    className={`${D.row} ${h.unavailable ? "opacity-45" : ""}`}
                  >
                    <Glyph icon={h.icon} className={D.glyph} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{h.label}</span>
                      {h.path.length ? <span className={D.description}>{h.path.join(" › ")}</span> : null}
                    </span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className={`${D.row} text-muted-foreground`}>No action matches “{query}”</div>
              )}
            </>
          ) : (
            <>
              {menu.sections.map((s, i) => (
                <React.Fragment key={i}>
                  <DropdownMenuSeparator className={D.separator} />
                  {s.heading ? <DropdownMenuLabel className={D.heading}>{s.heading}</DropdownMenuLabel> : null}
                  <DRows nodes={s.nodes} run={run} />
                </React.Fragment>
              ))}
              {menu.footer.length ? (
                <>
                  <DropdownMenuSeparator className={D.separator} />
                  <DStrip icons={menu.footer} run={run} label="Platform" />
                </>
              ) : null}
            </>
          )}
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Phone ─────────────────────────────────────────────────────────────────────

interface Drill {
  label: string;
  nodes: readonly DNode[];
}

function PIcon({ i, run, drill }: { i: StripIcon; run: Run; drill(d: Drill): void }) {
  const tone = iconTone(i);
  const tap = () => {
    if (i.unavailable) {
      toast(i.unavailable);
      return;
    }
    if (i.runLabel) run(i.runLabel);
    else if (i.menu) drill({ label: i.label, nodes: i.menu });
  };
  return (
    <>
      {i.gapBefore ? <span aria-hidden className="mx-1 h-6 w-px bg-border" /> : null}
      <span className="inline-flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-alchemy-node={i.id}
              aria-label={i.label}
              aria-disabled={i.unavailable ? true : undefined}
              onClick={tap}
              className={`inline-flex shrink-0 items-center justify-center ${P.iconButton} ${tone}`}
            >
              <Glyph icon={i.icon} className={P.glyph} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <TipBody label={i.label} aside={iconAside(i)} />
          </TooltipContent>
        </Tooltip>
        {i.runLabel && i.menu ? (
          <button
            type="button"
            aria-label={`${i.label} options`}
            onClick={() => drill({ label: i.label, nodes: i.menu ?? [] })}
            className="-ml-1.5 inline-flex h-12 w-5 items-center justify-center rounded-lg text-muted-foreground active:bg-accent"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </span>
    </>
  );
}

function PRows({ nodes, run, drill }: { nodes: readonly (DNode | R2Node)[]; run: Run; drill(d: Drill): void }) {
  return (
    <>
      {nodes.map((n, i) => {
        const description = "description" in n ? n.description : undefined;
        return (
          <React.Fragment key={n.id}>
            {i > 0 && n.startsGroup ? <div role="separator" className={P.separator} /> : null}
            <button
              type="button"
              data-alchemy-node={n.id}
              aria-disabled={n.viewerReason ? true : undefined}
              onClick={() => {
                if (n.viewerReason) toast(n.viewerReason);
                else if (n.children) drill({ label: n.label, nodes: n.children });
                else run(n.label);
              }}
              className={`${P.row} ${n.viewerReason ? "opacity-45" : ""} ${n.destructive ? "text-destructive" : ""}`}
            >
              <Glyph icon={n.icon} className={P.glyph} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{n.label}</span>
                {description ? <span className={P.description}>{description}</span> : null}
              </span>
              {n.children ? <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" /> : n.hint ? <span className={P.shortcut}>{n.hint}</span> : null}
            </button>
          </React.Fragment>
        );
      })}
    </>
  );
}

export function R2SheetBody({ menu, onRun }: { menu: R2Menu; onRun: Run }) {
  const [trail, setTrail] = React.useState<Drill[]>([]);
  const [query, setQuery] = React.useState("");
  const leaves = round2Leaves(menu);
  const drill = (d: Drill) => setTrail((t) => [...t, d]);
  const here = trail[trail.length - 1];
  const q = query.trim().toLowerCase();
  const hits = q ? leaves.filter((l) => l.label.toLowerCase().includes(q) || l.path.some((p) => p.toLowerCase().includes(q))) : null;
  return (
    <TooltipProvider delayDuration={250}>
      <div data-alchemy-layout="sheet-round2" data-round2={menu.key} className="flex flex-col gap-0.5 px-2 pb-4 pt-2">
        {here ? (
          <>
            <button type="button" onClick={() => setTrail((t) => t.slice(0, -1))} className={`${P.row} font-semibold`}>
              <ChevronLeft aria-hidden className="h-[22px] w-[22px]" />
              <span className="truncate">{here.label}</span>
            </button>
            <div role="separator" className={P.separator} />
            <PRows nodes={here.nodes} run={onRun} drill={drill} />
          </>
        ) : (
          <>
            {menu.kindLabel ? <div className={P.heading}>{menu.kindLabel}</div> : null}
            {menu.strips.map((s, i) => (
              <div key={i} role="toolbar" aria-label={i === 0 ? "Actions" : "Content"} className={`${P.strip} ${i > 0 ? "border-t border-border pt-1" : ""}`}>
                {s.map((icon) => (
                  <PIcon key={icon.id} i={icon} run={onRun} drill={drill} />
                ))}
              </div>
            ))}
            <div className="px-1 py-1">
              <input aria-label="Filter actions" placeholder="Type to filter…" value={query} onChange={(e) => setQuery(e.target.value)} className={P.search} />
            </div>
            {hits ? (
              hits.length ? (
                hits.slice(0, 12).map((h) => (
                  <button key={`${h.path.join("/")}/${h.id}`} type="button" onClick={() => (h.unavailable ? toast(h.unavailable) : onRun(h.label))} className={`${P.row} ${h.unavailable ? "opacity-45" : ""}`}>
                    <Glyph icon={h.icon} className={P.glyph} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{h.label}</span>
                      {h.path.length ? <span className={P.description}>{h.path.join(" › ")}</span> : null}
                    </span>
                  </button>
                ))
              ) : (
                <div className={`${P.row} text-muted-foreground`}>No action matches “{query}”</div>
              )
            ) : (
              <>
                {menu.sections.map((s, i) => (
                  <React.Fragment key={i}>
                    <div role="separator" className={P.separator} />
                    {s.heading ? <div className={P.heading}>{s.heading}</div> : null}
                    <PRows nodes={s.nodes} run={onRun} drill={drill} />
                  </React.Fragment>
                ))}
                <div role="separator" className={P.separator} />
                <div role="toolbar" aria-label="Platform" className={P.strip}>
                  {menu.footer.map((icon) => (
                    <PIcon key={icon.id} i={icon} run={onRun} drill={drill} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export function R2Sheet({ menu, open, onOpenChange, onRun }: { menu: R2Menu; open: boolean; onOpenChange(open: boolean): void; onRun: Run }) {
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} surface="solid" title="Actions">
      <div className="overflow-y-auto" style={{ maxHeight: "80dvh" }}>
        <R2SheetBody
          menu={menu}
          onRun={(label) => {
            onRun(label);
            onOpenChange(false);
          }}
        />
      </div>
    </BottomSheet>
  );
}
