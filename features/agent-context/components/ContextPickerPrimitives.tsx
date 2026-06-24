"use client";

/**
 * Shared primitives for context picker rows — used by preferences and legacy pickers.
 *
 * Everything here is pure UI with no Redux dependency.
 */

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { ChevronRight, Check, X, Search, Circle } from "lucide-react";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { idMatchesQuery } from "@/utils/search-scoring";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PickerOption {
  id: string;
  name: string;
  status?: string | null;
}

// ─── FlyoutItem ──────────────────────────────────────────────────────────────

export function FlyoutItem({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex items-center gap-2 w-full text-[11px] px-2 py-1.5 text-left hover:bg-accent/60 transition-colors",
        selected && "text-primary",
      )}
    >
      {children}
    </button>
  );
}

// ─── SearchableList ───────────────────────────────────────────────────────────

export function SearchableList({
  options,
  orphanOptions = [],
  selectedId,
  selectedIds,
  onSelect,
  placeholder,
  emptyText = "Nothing found",
}: {
  options: PickerOption[];
  orphanOptions?: PickerOption[];
  selectedId: string | null;
  /** Multi-select mode: when provided, EVERY listed id renders checked and
   *  `selectedId` is ignored for check state (kept for the clear affordance). */
  selectedIds?: string[];
  onSelect: (id: string | null) => void;
  placeholder: string;
  emptyText?: string;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelected = (id: string): boolean =>
    selectedIds ? selectedIds.includes(id) : selectedId === id;
  const hasSelection = selectedIds ? selectedIds.length > 0 : !!selectedId;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = search.toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.name.toLowerCase().includes(q) || idMatchesQuery(o, q),
      )
    : options;
  const filteredOrphans = q
    ? orphanOptions.filter(
        (o) => o.name.toLowerCase().includes(q) || idMatchesQuery(o, q),
      )
    : orphanOptions;

  return (
    <>
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border">
        <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/50 min-w-0"
          onKeyDown={(e) => e.stopPropagation()}
        />
        {search && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              setSearch("");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && filteredOrphans.length === 0 && (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">
            {emptyText}
          </div>
        )}
        {filtered.map((opt) => (
          <FlyoutItem
            key={opt.id}
            selected={isSelected(opt.id)}
            onSelect={() => onSelect(opt.id)}
          >
            {isSelected(opt.id) ? (
              <Check className="h-3 w-3 flex-shrink-0" />
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <span className="flex-1 truncate">{opt.name}</span>
            {opt.status && (
              <span className="text-[9px] text-muted-foreground/50">
                {opt.status}
              </span>
            )}
          </FlyoutItem>
        ))}
        {filteredOrphans.length > 0 && (
          <>
            <div className="mx-2 my-0.5 border-t border-border/50" />
            <div className="px-2 py-0.5 text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
              Unassociated
            </div>
            {filteredOrphans.map((opt) => (
              <FlyoutItem
                key={opt.id}
                selected={isSelected(opt.id)}
                onSelect={() => onSelect(opt.id)}
              >
                {isSelected(opt.id) ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <span className="w-3 flex-shrink-0" />
                )}
                <span className="flex-1 truncate">{opt.name}</span>
              </FlyoutItem>
            ))}
          </>
        )}
      </div>

      {hasSelection && (
        <>
          <div className="mx-2 my-0.5 border-t border-border/50" />
          <FlyoutItem selected={false} onSelect={() => onSelect(null)}>
            <X className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground hover:text-destructive">
              Clear selection
            </span>
          </FlyoutItem>
        </>
      )}
    </>
  );
}

// ─── HoverFlyout ─────────────────────────────────────────────────────────────
// Portal-based, zero Radix — no focus-trap, no onInteractOutside flash.

const OPEN_DELAY = 180;
const CLOSE_DELAY = 350;

export function HoverFlyout({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAll = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearAll();
    openTimer.current = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setCoords({ top: rect.top, left: rect.right + 8 });
      }
      setOpen(true);
    }, OPEN_DELAY);
  }, [clearAll]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  useEffect(() => () => clearAll(), [clearAll]);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {trigger}
      </div>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              zIndex: 9999,
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="w-52 rounded-md border border-border bg-popover text-popover-foreground shadow-md py-1"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

// ─── ContextRow ───────────────────────────────────────────────────────────────
// A single labelled row that opens a searchable flyout on hover.

export function ContextRow({
  icon: Icon,
  label,
  selectedName,
  accentClass,
  selectedId,
  selectedIds,
  options,
  orphanOptions,
  onSelect,
  placeholder,
  emptyText,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  selectedName: string | null;
  accentClass: string;
  selectedId: string | null;
  /** Multi-select mode: every listed id renders checked in the flyout. */
  selectedIds?: string[];
  options: PickerOption[];
  orphanOptions?: PickerOption[];
  onSelect: (id: string | null) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  return (
    <HoverFlyout
      trigger={
        // Outer must be a div — not a button — because the X clear element inside
        // is an interactive element and nesting <button> inside <button> is invalid HTML.
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.currentTarget.click();
          }}
          className="flex items-center gap-2 w-full px-1 py-1.5 rounded-md text-foreground/80 hover:bg-accent/50 hover:text-foreground transition-colors text-left group cursor-pointer"
        >
          <Icon
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0 transition-colors",
              selectedName
                ? accentClass
                : "text-muted-foreground group-hover:text-foreground",
            )}
          />
          <span
            className={cn(
              "text-xs flex-1 truncate",
              selectedName ? accentClass + " font-medium" : "",
            )}
          >
            {selectedName ?? label}
          </span>
          {selectedName ? (
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onSelect(null);
              }}
              className="text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      }
    >
      <SearchableList
        options={options}
        orphanOptions={orphanOptions}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelect={onSelect}
        placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
        emptyText={emptyText}
      />
    </HoverFlyout>
  );
}
