"use client";

// features/context-menu-v3/designs/DesignInstance.tsx
//
// One copy of the target (a Data-home list of four clinic tables) wired to ONE
// design. Right-click a row, or its ⋯, and the same menu opens. Desktop draws
// through the package's ContextMenuPanel whenever it can express the design
// (`packageCanDraw`), else through the demo-local twin; the phone always draws
// through the package's ActionSheet. Each copy has its own Alchemy registry, so
// four copies on one page never share or collide on action ids. Demo-only.

import * as React from "react";
import dynamic from "next/dynamic";
import { MoreHorizontal, MoreVertical } from "lucide-react";
import { createActionRegistry, type ActionProvider } from "@ai-matrx/alchemy/actions";
import { AlchemyActionsProvider, useRegisterActionProvider } from "@ai-matrx/alchemy/react/host";
import { useAlchemyHostPorts } from "@/components/agent-copy/AlchemyHost";
import { resolveAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { toast } from "@/lib/toast";
import { CLINIC_TABLES, buildDesign, type DesignKey, type DesignSpec } from "./catalog";
import { DesignMenuPanel } from "./DesignMenuPanel";
import { demoTarget, designContext, fullModel, packageCanDraw, specActions } from "./model";

// The package's T1 layouts load on first open, as everywhere else in the app.
const ContextMenuPanel = dynamic(() => import("@ai-matrx/alchemy/react/menu").then((m) => m.ContextMenuPanel), { ssr: false });
const ActionSheet = dynamic(() => import("@ai-matrx/alchemy/react/sheet").then((m) => m.ActionSheet), { ssr: false });

const LONG_PRESS_MS = 480;

export function wouldRun(label: string) {
  toast(`Would run: ${label}`);
}

/** The first word of a table's name: what "Text selected" pre-selects. */
export function firstWord(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

function selectFirstWord(el: Element | null) {
  const text = el?.firstChild;
  if (!text || text.nodeType !== Node.TEXT_NODE) return;
  const word = firstWord(text.textContent ?? "");
  const range = document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, word.length);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

interface OpenMenu {
  rowId: string;
  point: { x: number; y: number };
  selection: string | null;
  key: number;
}

function SpecProvider({ spec }: { spec: DesignSpec }) {
  const provider = React.useMemo<ActionProvider>(
    () => ({ id: "context-menu-designs", tier: "T0", actions: () => specActions(spec, wouldRun) }),
    [spec],
  );
  useRegisterActionProvider(provider);
  return null;
}

export interface DesignInstanceProps {
  design: DesignKey;
  textSelected: boolean;
  viewer: boolean;
  phone: boolean;
  /** This copy shows the "Text selected" highlight when the toggle turns on. */
  primary?: boolean;
}

export function DesignInstance({ design, textSelected, viewer, phone, primary }: DesignInstanceProps) {
  const ports = useAlchemyHostPorts();
  const registry = React.useMemo(() => createActionRegistry({ ports }), [ports]);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [menu, setMenu] = React.useState<OpenMenu | null>(null);
  const [open, setOpen] = React.useState(false);
  const press = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (textSelected && primary) selectFirstWord(rootRef.current?.querySelector("[data-table-name]") ?? null);
  }, [textSelected, primary, phone]);

  const row = CLINIC_TABLES.find((t) => t.id === menu?.rowId) ?? null;
  const spec = React.useMemo(
    () => (row && menu ? buildDesign(design, { selection: menu.selection, viewer, name: row.name }) : null),
    [design, menu, row, viewer],
  );
  const target = React.useMemo(() => demoTarget(menu?.selection ?? null), [menu]);

  const openAt = (rowId: string, point: { x: number; y: number }, nameEl: Element | null) => {
    let selection: string | null = null;
    if (textSelected) {
      selectFirstWord(nameEl);
      selection = firstWord(CLINIC_TABLES.find((t) => t.id === rowId)?.name ?? "");
    } else {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && sel?.anchorNode && rootRef.current?.contains(sel.anchorNode)) selection = text;
    }
    setMenu((prev) => ({ rowId, point, selection, key: (prev?.key ?? 0) + 1 }));
    setOpen(true);
  };

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };

  const desktopSpec = spec && !phone ? spec : null;
  const drawn = desktopSpec && !packageCanDraw(desktopSpec) ? fullModel(desktopSpec, wouldRun).model : null;

  return (
    <AlchemyActionsProvider ports={ports} registry={registry}>
      {spec ? <SpecProvider spec={spec} /> : null}
      <div ref={rootRef} className={phone ? "mx-auto w-full max-w-[390px] rounded-xl border border-border bg-background p-2" : "w-full"}>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {CLINIC_TABLES.map((t) => {
            const Icon = resolveAlchemyIcon(t.icon);
            return (
              <li
                key={t.id}
                data-design-row={t.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelPress();
                  openAt(t.id, { x: e.clientX, y: e.clientY }, e.currentTarget.querySelector("[data-table-name]"));
                }}
                onPointerDown={(e) => {
                  if (!phone || e.button !== 0) return;
                  const el = e.currentTarget.querySelector("[data-table-name]");
                  const point = { x: e.clientX, y: e.clientY };
                  cancelPress();
                  press.current = setTimeout(() => openAt(t.id, point, el), LONG_PRESS_MS);
                }}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerMove={(e) => {
                  if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) cancelPress();
                }}
                className={`flex min-w-0 items-center gap-3 px-3 hover:bg-accent/50 ${phone ? "min-h-14 select-none" : "h-12"}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span data-table-name className="truncate text-sm font-medium">
                    {t.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Table · {t.records.toLocaleString()} records · {t.updated}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Actions for ${t.name}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    openAt(t.id, { x: r.right, y: r.bottom }, e.currentTarget.closest("li")?.querySelector("[data-table-name]") ?? null);
                  }}
                  className={`inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground ${phone ? "h-11 w-11" : "h-8 w-8"}`}
                >
                  {phone ? <MoreVertical className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {menu && spec && phone ? (
        <ActionSheet
          key={menu.key}
          target={target}
          open={open}
          onOpenChange={setOpen}
          {...(menu.selection ? {} : { contentLabel: spec.header.label, content: spec.header.text })}
        />
      ) : null}
      {menu && spec && !phone && !drawn ? (
        <ContextMenuPanel
          key={menu.key}
          target={target}
          point={menu.point}
          open={open}
          onOpenChange={setOpen}
          arrangement="command"
          {...(menu.selection ? {} : { contentLabel: spec.header.label, content: spec.header.text })}
        />
      ) : null}
      {menu && spec && drawn ? (
        <DesignMenuPanel
          key={menu.key}
          model={drawn}
          arranged={designContext(drawn, spec.stripAfter)}
          point={menu.point}
          open={open}
          onOpenChange={setOpen}
          onRun={wouldRun}
        />
      ) : null}
    </AlchemyActionsProvider>
  );
}
