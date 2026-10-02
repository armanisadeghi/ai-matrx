"use client";

// features/context-menu-v3/designs/ClinicTableList.tsx
//
// The demo's target: a Data-home list of four clinic tables. Right-click a row,
// long-press it (phone), or press its ⋯ — each calls `onOpen`. Shared by the
// round-1 and round-2 instances. Demo-only.

import * as React from "react";
import { MoreHorizontal, MoreVertical } from "lucide-react";
import { resolveAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { CLINIC_TABLES } from "./catalog";

const LONG_PRESS_MS = 480;

/** The first word of a table's name: what "Text selected" pre-selects. */
export function firstWord(name: string): string {
  return name.split(/\s+/)[0] ?? name;
}

export function selectFirstWord(el: Element | null) {
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

export interface ClinicTableListProps {
  phone: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onOpen(rowId: string, point: { x: number; y: number }, nameEl: Element | null): void;
}

export function ClinicTableList({ phone, rootRef, onOpen }: ClinicTableListProps) {
  const press = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  return (
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
                onOpen(t.id, { x: e.clientX, y: e.clientY }, e.currentTarget.querySelector("[data-table-name]"));
              }}
              onPointerDown={(e) => {
                if (!phone || e.button !== 0) return;
                const el = e.currentTarget.querySelector("[data-table-name]");
                const point = { x: e.clientX, y: e.clientY };
                cancelPress();
                press.current = setTimeout(() => onOpen(t.id, point, el), LONG_PRESS_MS);
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
                  onOpen(t.id, { x: r.right, y: r.bottom }, e.currentTarget.closest("li")?.querySelector("[data-table-name]") ?? null);
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
  );
}
