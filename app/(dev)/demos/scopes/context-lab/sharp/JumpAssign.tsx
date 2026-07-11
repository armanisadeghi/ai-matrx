"use client";

// INSIDE 5 — Jump Assign. A strict SINGLE-SELECT two-step palette.
//
// Step 1: type-to-find exactly one scope (any org — the org is derived,
// shown dimly on the right). Step 2: optionally land one level deeper on a
// context field of that scope, or take the scope itself. Picking closes.
// This is the "put this file in Ava's current_school slot" move in two
// keystrokes — the single-select case the multi pickers must not dilute.

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  CornerDownRight,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { useTypeItems, type FlatScope, type PickerData } from "./engine";

export interface JumpAssignResult {
  scope: FlatScope;
  /** null → the scope itself was picked. */
  item: { id: string; label: string } | null;
}

interface JumpAssignProps {
  data: PickerData;
  onDone: (result: JumpAssignResult) => void;
  height?: number;
  autoFocus?: boolean;
}

export function JumpAssign({
  data,
  onDone,
  height = 240,
  autoFocus = false,
}: JumpAssignProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<FlatScope | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemState = useTypeItems(scope ? scope.type.id : null);

  const q = query.trim().toLowerCase();

  const scopeRows = useMemo(
    () =>
      scope
        ? []
        : data.flatScopes.filter(
            (fs) => !q || fs.scope.name.toLowerCase().includes(q),
          ),
    [data.flatScopes, q, scope],
  );

  const itemRows = useMemo(
    () =>
      scope
        ? (itemState.items ?? []).filter(
            (i) => !q || i.display_name.toLowerCase().includes(q),
          )
        : [],
    [scope, itemState.items, q],
  );

  // step 2 has one extra virtual row at index 0: "the scope itself"
  const rowCount = scope ? itemRows.length + 1 : scopeRows.length;

  // Adjust-during-render: a new query/step resets the highlight instantly.
  const resetKey = `${q}|${scope?.scope.id ?? ""}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (lastResetKey !== resetKey) {
    setLastResetKey(resetKey);
    setActiveIdx(0);
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-ja-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function pickAt(idx: number) {
    if (!scope) {
      const fs = scopeRows[idx];
      if (fs) {
        setScope(fs);
        setQuery("");
      }
      return;
    }
    if (idx === 0) {
      onDone({ scope, item: null });
      return;
    }
    const item = itemRows[idx - 1];
    if (item)
      onDone({ scope, item: { id: item.id, label: item.display_name } });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, Math.max(rowCount - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickAt(activeIdx);
    } else if (e.key === "Backspace" && query === "" && scope) {
      e.preventDefault();
      setScope(null);
    }
  }

  return (
    <div className="flex w-full flex-col text-sm" onKeyDown={onKeyDown}>
      <div className="relative border-b border-border">
        {scope ? (
          <button
            onClick={() => setScope(null)}
            aria-label="Back to scopes"
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        )}
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            scope ? `Where on ${scope.scope.name}?` : "Jump to a scope…"
          }
          className="h-9 w-full bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground/70"
          style={{ fontSize: "16px" }}
        />
      </div>

      <div
        ref={listRef}
        className="overflow-y-auto py-1 scrollbar-thin"
        style={{ height }}
      >
        {!scope ? (
          scopeRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No scope matches.
            </div>
          ) : (
            scopeRows.map((fs, i) => {
              const c = resolveColor(fs.type);
              const TIcon = resolveIcon(fs.type.icon);
              return (
                <button
                  key={fs.scope.id}
                  data-ja-idx={i}
                  onMouseMove={() => setActiveIdx(i)}
                  onClick={() => pickAt(i)}
                  className={cn(
                    "flex h-7 w-full items-center gap-2 px-2.5 text-left",
                    i === activeIdx ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <TIcon className={cn("h-3.5 w-3.5 shrink-0", c.fg)} />
                  <span className="min-w-0 flex-1 truncate">
                    {fs.scope.name}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-muted-foreground/70">
                    {fs.type.label_singular} · {fs.org.name}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })
          )
        ) : itemState.loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading {scope.type.label_singular.toLowerCase()} fields…
          </div>
        ) : itemState.error ? (
          <div className="px-3 py-2 text-xs text-destructive">
            {itemState.error}
          </div>
        ) : (
          <>
            <button
              data-ja-idx={0}
              onMouseMove={() => setActiveIdx(0)}
              onClick={() => pickAt(0)}
              className={cn(
                "flex h-7 w-full items-center gap-2 px-2.5 text-left font-medium",
                activeIdx === 0 ? "bg-accent" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {scope.scope.name} — the scope itself
              </span>
            </button>
            {itemRows.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground/70">
                No fields defined on {scope.type.label_plural.toLowerCase()} —
                only the scope is available.
              </div>
            ) : (
              itemRows.map((item, i) => (
                <button
                  key={item.id}
                  data-ja-idx={i + 1}
                  onMouseMove={() => setActiveIdx(i + 1)}
                  onClick={() => pickAt(i + 1)}
                  className={cn(
                    "flex h-7 w-full items-center gap-2 px-2.5 text-left",
                    activeIdx === i + 1 ? "bg-accent" : "hover:bg-muted",
                  )}
                >
                  <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <span className="min-w-0 flex-1 truncate">
                    {item.display_name}
                  </span>
                  <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {String(item.value_type)}
                  </span>
                </button>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
