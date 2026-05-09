"use client";

// NotesSidebarToolbar — Adaptive toolbar for the notes sidebar.
//
// Layout always:  [+]  [center controls]  [🔍]
//
// Center controls have two states:
//   DEFAULT  →  three icon buttons: sort-field, sort-order, expand/collapse
//   SEARCHING →  a single ">>" button that opens a dropdown with those same
//               controls (search expansion needs the space)
//
// Search pill:
//   Collapsed  →  icon-only, same height as every other button
//   Expanded   →  glass pill + input, center collapses to ">>" dropdown
//
// Container queries handle compact/full pill sizing.
// React state handles the search-open / overflow-open logic.

import { useCallback, useRef, useState, useEffect } from "react";
import {
  Search,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronsRight,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import IconButton from "@/features/shell/components/IconButton";

type SortField = "updated_at" | "label" | "created_at";

interface NotesSidebarToolbarProps {
  searchQuery: string;
  sortField: SortField;
  sortOrder: "asc" | "desc";
  allExpanded: boolean;
  onSearchChange: (value: string) => void;
  onCycleSortField: () => void;
  onToggleSortOrder: () => void;
  onToggleAll: () => void;
  /** Render prop — pass <NewNoteButton /> so it keeps its own Supabase logic */
  newNoteSlot: ReactNode;
}

export default function NotesSidebarToolbar({
  searchQuery,
  sortField,
  sortOrder,
  allExpanded,
  onSearchChange,
  onCycleSortField,
  onToggleSortOrder,
  onToggleAll,
  newNoteSlot,
}: NotesSidebarToolbarProps) {
  const sortLabel =
    sortField === "updated_at"
      ? "date"
      : sortField === "label"
        ? "name"
        : "created";
  const sortActive = sortField !== "updated_at";
  const orderActive = sortOrder === "asc";

  const [searchOpen, setSearchOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Open search: focus the input, collapse center to ">>"
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    // focus on next frame after state update expands the pill
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Close search: blur, hide input, restore center buttons
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setOverflowOpen(false);
    inputRef.current?.blur();
  }, []);

  // Close overflow when clicking outside
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [overflowOpen]);

  // Close search when input loses focus (unless interacting with overflow)
  // Only fires when searchOpen was triggered by a click (narrow/Tier 2 toolbar).
  // In Tier 1 (wide toolbar) the CSS forces the open state — React state is false
  // so this does nothing harmful there.
  const handleInputBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      if (!searchOpen) return; // Tier 1: not user-opened, nothing to close
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && overflowRef.current?.contains(relatedTarget)) return;
      setTimeout(() => {
        if (document.activeElement !== inputRef.current) {
          setSearchOpen(false);
          setOverflowOpen(false);
        }
      }, 150);
    },
    [searchOpen],
  );

  return (
    <div className="notes-toolbar" role="toolbar" aria-label="Notes toolbar">
      {/* ── LEFT: New note — fixed, no wrapper ───────────────────────────── */}
      {newNoteSlot}

      {/* ── CENTER: flex:1 fills all space between + and search, centers content */}
      <div className="notes-toolbar-center">
        {/* ">>" overflow trigger — shown when search is open */}
        <div
          ref={overflowRef}
          className={cn(
            "notes-toolbar-overflow-wrap",
            searchOpen && "notes-toolbar-overflow-wrap--visible",
          )}
        >
          <div className="notes-toolbar-overflow-trigger">
            <IconButton
              icon={<ChevronsRight strokeWidth={1.75} />}
              onClick={() => setOverflowOpen((v) => !v)}
              label="More options"
            />
          </div>

          {/* Dropdown panel */}
          <div
            className={cn(
              "notes-toolbar-overflow-panel matrx-shell-glass",
              overflowOpen && "notes-toolbar-overflow-panel--open",
            )}
            role="menu"
          >
            <button
              className={cn(
                "notes-toolbar-overflow-item",
                sortActive && "notes-toolbar-overflow-item--active",
              )}
              onClick={() => {
                onCycleSortField();
                setOverflowOpen(false);
              }}
              role="menuitem"
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <span>Sort by {sortLabel}</span>
            </button>
            <button
              className={cn(
                "notes-toolbar-overflow-item",
                orderActive && "notes-toolbar-overflow-item--active",
              )}
              onClick={() => {
                onToggleSortOrder();
                setOverflowOpen(false);
              }}
              role="menuitem"
            >
              {sortOrder === "desc" ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {sortOrder === "desc" ? "Newest first" : "Oldest first"}
              </span>
            </button>
            <button
              className="notes-toolbar-overflow-item"
              onClick={() => {
                onToggleAll();
                setOverflowOpen(false);
              }}
              role="menuitem"
            >
              {allExpanded ? (
                <ChevronsDownUp className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{allExpanded ? "Collapse all" : "Expand all"}</span>
            </button>
          </div>
        </div>

        {/* Inline buttons — shown when search is closed */}
        <div
          className={cn(
            "notes-toolbar-inline-controls",
            searchOpen && "notes-toolbar-inline-controls--hidden",
          )}
        >
          <IconButton
            icon={<ArrowUpDown strokeWidth={1.75} />}
            onClick={onCycleSortField}
            label={`Sort by: ${sortLabel}`}
            active={sortActive}
          />
          <IconButton
            icon={
              sortOrder === "desc" ? (
                <ChevronDown strokeWidth={1.75} />
              ) : (
                <ChevronUp strokeWidth={1.75} />
              )
            }
            onClick={onToggleSortOrder}
            label={sortOrder === "desc" ? "Oldest first" : "Newest first"}
            active={orderActive}
          />
          <IconButton
            icon={
              allExpanded ? (
                <ChevronsDownUp strokeWidth={1.75} />
              ) : (
                <ChevronsUpDown strokeWidth={1.75} />
              )
            }
            onClick={onToggleAll}
            label={allExpanded ? "Collapse all folders" : "Expand all folders"}
          />
        </div>
      </div>

      {/* ── RIGHT: Search — fixed size, center absorbs all slack ─────────── */}
      <div
        className={cn(
          "notes-toolbar-search",
          searchOpen && "notes-toolbar-search--open",
        )}
        onClick={!searchOpen ? openSearch : undefined}
        role="search"
        aria-label="Search notes"
      >
        <Search className="notes-toolbar-search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          className="notes-toolbar-search-input"
          type="search"
          placeholder="Search notes..."
          defaultValue={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (!searchOpen) setSearchOpen(true);
          }}
          onBlur={handleInputBlur}
          onKeyDown={(e) => e.key === "Escape" && closeSearch()}
          aria-label="Search notes"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          tabIndex={0}
        />
        {/* Dismiss button — only visible when open */}
        {searchOpen && (
          <button
            className="notes-toolbar-search-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              closeSearch();
            }}
            aria-label="Close search"
            tabIndex={0}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
