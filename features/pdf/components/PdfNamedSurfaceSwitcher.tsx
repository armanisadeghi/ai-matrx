"use client";

/**
 * PdfNamedSurfaceSwitcher — ONE glass pill: PDF icon + editable filename +
 * surface switcher + file context menu.
 *
 * The extractor studio pattern (`PdfStudioDocTitle`) collapsed into a single
 * drop-anywhere unit: everything renders INSIDE one `TapTargetButtonGroup`
 * pill — no separate name background, no second control cluster.
 *
 *   ( [pdf] filename.pdf  [layers]  [···]  [search] )
 *
 * - Filename: text-[11px], truncated (`nameMaxWidthClassName` caps it —
 *   filenames are ugly/erratic/long), click-to-edit via `EditableLabel`
 *   when `onRename` is provided; right-click opens the file menu.
 * - Layers: the canonical `PdfSurfaceSwitcher` (group variant).
 * - ···: the full /files action set (`FileContextMenu`) for cloud-backed
 *   files — hydrated via `useEnsureCloudFile` so the menu lights up on any
 *   surface. Omitted when there's no fileId.
 * - Document switcher (opt-in via `documents` + `onSelectDocument`): the PDF
 *   icon becomes a dropdown listing the host's documents — click to switch.
 * - Search (opt-in via `onSearchChange` / `onSearchSubmit`): macOS-style —
 *   activating it
 *   overlays the search field ACROSS the pill's existing content, so the
 *   pill width never changes. The idle content goes `visibility: hidden`
 *   (keeps layout, leaves tab order) and an absolute layer renders
 *   [search icon][input][x] on top. X clears, then closes; Esc closes.
 *
 * Tap-target hygiene: geometry lives in globals.css (`.matrx-tap-*`); the
 * name span adds only inline padding INSIDE the pill — never around the
 * group or its buttons.
 */

import { useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { EditableLabel } from "@/components/official/item/EditableLabel";
import {
  MoreHorizontalTapButton,
  SearchTapButton,
  XTapButton,
} from "@/components/icons/tap-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TapTargetButtonGroup } from "@/components/icons/TapTargetButton";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useEnsureCloudFile } from "@/features/files/hooks/useEnsureCloudFile";
import { cn } from "@/lib/utils";
import type { PdfSurfaceId } from "@/features/pdf/surfaces/registry";
import { PdfSurfaceSwitcher } from "./PdfSurfaceSwitcher";

// PDF-only by definition — resolve the registry entry once so icon + color
// always match how /files renders PDFs.
const PDF_TYPE = getFileTypeDetails("document.pdf");
const PdfIcon = PDF_TYPE.icon;

/** One entry in the optional document-switcher list (PDF-icon dropdown). */
export interface PdfSwitcherDocumentOption {
  /** Host-defined id — handed back verbatim to `onSelectDocument`. */
  id: string;
  name: string;
}

export interface PdfNamedSurfaceSwitcherProps {
  /** The surface currently rendering this PDF (marked + non-navigable).
   *  Omit on hosts that aren't a registered surface (e.g. the chat drawer). */
  current?: PdfSurfaceId;
  fileId?: string | null;
  processedDocumentId?: string | null;
  /** Display name — truncated at text-[11px]; full name while editing. */
  fileName: string;
  /**
   * Commit a new name (host persists — e.g. `renameFile` thunk, or a doc
   * rename). Omit to render the name read-only (no click-to-edit).
   */
  onRename?: (next: string) => void | Promise<void>;
  /** Fired after the ··· / right-click menu deletes the file. */
  onDeleted?: () => void;
  /** Hide the PDF icon (default shown). */
  showIcon?: boolean;
  /** Hide the ··· file menu even when a fileId exists (default shown). */
  showMenu?: boolean;
  /**
   * Opt-in search control. Fired live as the user types (and with "" when
   * the search closes). Activating search overlays the field across the
   * pill's content — the pill width never changes (macOS style).
   */
  onSearchChange?: (query: string) => void;
  /**
   * Fired on Enter in the search field. Hosts whose search is a server
   * round-trip use THIS (and may omit `onSearchChange`); either prop alone
   * enables the search control.
   */
  onSearchSubmit?: (query: string) => void;
  /** Placeholder for the search input (default "Search"). */
  searchPlaceholder?: string;
  /**
   * Opt-in document switcher: when provided (with `onSelectDocument`), the
   * PDF icon becomes a dropdown listing these documents — click to switch.
   */
  documents?: PdfSwitcherDocumentOption[];
  /** The currently-open document's id (marked + non-selectable). */
  activeDocumentId?: string | null;
  onSelectDocument?: (id: string) => void;
  /** Tailwind max-width cap on the name (default `max-w-40` = 10rem). */
  nameMaxWidthClassName?: string;
  className?: string;
}

export function PdfNamedSurfaceSwitcher({
  current,
  fileId,
  processedDocumentId,
  fileName,
  onRename,
  onDeleted,
  showIcon = true,
  showMenu = true,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = "Search",
  documents,
  activeDocumentId,
  onSelectDocument,
  nameMaxWidthClassName = "max-w-40",
  className,
}: PdfNamedSurfaceSwitcherProps) {
  // Hydrate the cloud-file row so FileContextMenu / FileRightClickMenu light
  // up on surfaces outside the /files tree. No-op without a fileId.
  useEnsureCloudFile(fileId ?? null);
  const hasFileMenu = Boolean(fileId) && showMenu;

  // Edit mode must never SHRINK the name box (a collapsing input reads as
  // broken). On edit start we capture the display's rendered width and hold
  // it as a floor, while letting the box expand to a comfortable typing
  // width (w-64) when there's room.
  const nameBoxRef = useRef<HTMLSpanElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [editMinWidth, setEditMinWidth] = useState<number | null>(null);
  const handleEditingChange = (next: boolean) => {
    if (next && nameBoxRef.current) {
      setEditMinWidth(nameBoxRef.current.offsetWidth);
    }
    setEditing(next);
  };

  // Search overlay — covers the pill's content without changing its width.
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const openSearch = () => {
    setSearchOpen(true);
  };
  const clearQuery = () => {
    setQuery("");
    onSearchChange?.("");
    // Submit-based hosts (server-backed search) also reset on clear.
    onSearchSubmit?.("");
  };
  const closeSearch = () => {
    setSearchOpen(false);
    if (query) clearQuery();
  };
  const handleSearchInput = (next: string) => {
    setQuery(next);
    onSearchChange?.(next);
  };
  // macOS behavior: X clears the text first; a second press (or X on an
  // already-empty field) closes the search.
  const handleClear = () => {
    if (query) {
      clearQuery();
      searchInputRef.current?.focus();
    } else {
      setSearchOpen(false);
    }
  };

  const hasDocSwitcher = Boolean(documents?.length && onSelectDocument);

  const iconEl = hasDocSwitcher ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch document"
          title="Switch document"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm transition-colors hover:bg-accent"
        >
          <PdfIcon
            aria-hidden
            className={cn("h-3.5 w-3.5", PDF_TYPE.color)}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
          Documents
        </DropdownMenuLabel>
        {documents!.map((d) => {
          const isActive = d.id === activeDocumentId;
          return (
            <DropdownMenuItem
              key={d.id}
              disabled={isActive}
              onClick={() => onSelectDocument!(d.id)}
              className="gap-2 py-1.5"
            >
              <PdfIcon
                aria-hidden
                className={cn("h-3.5 w-3.5 shrink-0", PDF_TYPE.color)}
              />
              <span className="min-w-0 flex-1 truncate text-xs">{d.name}</span>
              {isActive && (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <PdfIcon
      aria-hidden
      className={cn("h-3.5 w-3.5 shrink-0", PDF_TYPE.color)}
    />
  );

  const identity = (
    <span className="flex min-w-0 items-center gap-1 pl-2.5">
      {showIcon && iconEl}
      <span
        ref={nameBoxRef}
        className={cn(
          "block min-w-0",
          editing ? "w-64" : nameMaxWidthClassName,
        )}
        style={
          editing && editMinWidth !== null
            ? { minWidth: editMinWidth }
            : undefined
        }
      >
        {onRename ? (
          <EditableLabel
            value={fileName}
            onCommit={onRename}
            onEditingChange={handleEditingChange}
            activation="click"
            ariaLabel="File name"
            maxLength={200}
            displayClassName="text-[11px] font-medium text-foreground"
            inputClassName="md:text-[11px] font-medium"
          />
        ) : (
          <span
            title={fileName}
            className="block truncate px-1 text-[11px] font-medium text-foreground"
          >
            {fileName}
          </span>
        )}
      </span>
    </span>
  );

  return (
    <TapTargetButtonGroup className={cn("min-w-0", className)}>
      {/* Idle content. While searching it keeps its layout (so the pill
          width cannot change) but is hidden + inert (visibility:hidden
          removes it from pointer events and tab order). */}
      <span
        className={cn("flex min-w-0 items-center", searchOpen && "invisible")}
        aria-hidden={searchOpen || undefined}
      >
        {hasFileMenu && fileId ? (
          <FileRightClickMenu fileId={fileId} onDeleted={onDeleted}>
            {identity}
          </FileRightClickMenu>
        ) : (
          identity
        )}
        <PdfSurfaceSwitcher
          current={current}
          fileId={fileId}
          processedDocumentId={processedDocumentId}
          triggerVariant="group"
        />
        {hasFileMenu && fileId && (
          <FileContextMenu fileId={fileId} onDeleted={onDeleted}>
            <MoreHorizontalTapButton
              variant="group"
              ariaLabel="File actions"
            />
          </FileContextMenu>
        )}
        {(onSearchChange || onSearchSubmit) && (
          <SearchTapButton
            variant="group"
            ariaLabel="Search"
            onClick={openSearch}
          />
        )}
      </span>

      {/* Search overlay — absolute over the content area, same width. */}
      {searchOpen && (
        <span className="absolute inset-0 flex items-center pl-2.5">
          <Search
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            autoFocus
            type="text"
            value={query}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeSearch();
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onSearchSubmit?.(query.trim());
              }
            }}
            // 16px on mobile prevents iOS focus-zoom; tiny on desktop.
            className="ml-1 w-full min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-muted-foreground md:text-[11px]"
          />
          <XTapButton
            variant="group"
            ariaLabel={query ? "Clear search" : "Close search"}
            onClick={handleClear}
          />
        </span>
      )}
    </TapTargetButtonGroup>
  );
}
