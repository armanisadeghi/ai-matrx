"use client";

// TableViewerWindow — view a markdown table at full size inside a floating
// WindowPanel.
//
// Thin COMPOSITION ROOT (mirrors CanvasViewerWindow): the body holds ONLY the
// table renderer. The same `StreamingTableRenderer` that draws the inline
// (small-UI) table is reused here at a larger font + roomier sizing so a wide
// table is actually readable. Opened from the inline table's "Open in window"
// action, which passes the table markdown through overlay data.
//
// 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). This is the
// platform's generic "look at this data" surface and it is opened OVER other
// pages, so without its own menu a right-click here was answered by whatever
// page happened to be underneath — that page's surface, values and agents,
// silently wrong. One menu wraps the whole body and delegates per row through
// `resolveContextOnOpen`, which is the ONE-MENU-PER-PANE rule; the renderer's
// existing `data-cell-row` / `data-cell-col` attributes are the row anchors,
// so nothing in the renderer changed.
//
// 🚨 AND IT OWNS ITS OWN SURFACE (`matrx-user/table-viewer`, surface-authoring
// SKILL). The menu alone was not enough: with no `surfaceName`, the bound-agent
// and surface-submenu resolution still fell through to `detectActiveSurface()`,
// which reads the pathname — so a right-click in this window reported the page
// underneath ("Notes", while the user was inside a table). The nested
// `SurfaceRuntimeProvider` below out-depths the host page's provider while this
// window is open, and the menu is handed the same values, so the window answers
// for itself in BOTH the header Agents chrome and the right-click menu.

import React, { Suspense, lazy, useState } from "react";
import { Braces, Rows3, Sheet } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraSection,
  ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import {
  cleanTableHeaderKey,
  parseMarkdownTable,
} from "@/components/mardown-display/blocks/table/parseMarkdownTable";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { toast } from "@/lib/toast";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  TABLE_VIEWER_SURFACE_NAME,
  createTableViewerScope,
} from "@/features/surfaces/manifests/table-viewer.manifest";
// context-menu-exempt: entity — renders an ad hoc markdown table string; no id is threaded through any caller, so there is no record to attach

const StreamingTableRenderer = lazy(() =>
  import("@/components/mardown-display/blocks/table/StreamingTableRenderer").then(
    (m) => ({ default: m.StreamingTableRenderer }),
  ),
);

export interface TableViewerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** The markdown table content to render. */
  content?: string;
}

export function TableViewerWindow({
  isOpen,
  onClose,
  title = "Table",
  content,
}: TableViewerWindowProps) {
  if (!isOpen) return null;
  return (
    <TableViewerWindowInner onClose={onClose} title={title} content={content} />
  );
}

function TableViewerWindowInner({
  onClose,
  title,
  content,
}: Omit<TableViewerWindowProps, "isOpen">) {
  // Size to the viewport so the window is "nice and big but always fits".
  // ~85% of the viewport, clamped to a sane max, computed once at open.
  const { width, height } = computeViewportSize();

  // Parsed with the ONE markdown-table parser the renderer itself uses, so the
  // menu can never disagree with what is on screen.
  const parsed = content ? parseMarkdownTable(content) : null;
  // Which row the user right-clicked. STATE, not a ref: the extra items label
  // and disable themselves from it, and `resolveContextOnOpen` fires before
  // `MenuContent` mounts, so the setState re-render lands in time (the same
  // resolve-then-render contract `ItemContextMenu` relies on).
  const [clickedRow, setClickedRow] = useState<number | null>(null);

  const rowLines = (rowIndex: number): string[] => {
    const row = parsed?.rows[rowIndex];
    if (!parsed || !row) return [];
    return parsed.headers.map((h, i) => {
      const value = row[i];
      return `${cleanTableHeaderKey(h)}: ${typeof value === "string" ? value : ""}`;
    });
  };

  const copy = (text: string, what: string) => {
    void copyToClipboard(text, {
      formatJson: false,
      onSuccess: () => toast.success(`${what} copied`),
      onError: () => toast.error(`Could not copy ${what.toLowerCase()}`),
    });
  };

  // ONE scope builder for both consumers of this surface: the header Agents
  // Run button (via `SurfaceRuntimeProvider`, which passes no row — Run is not
  // a right-click) and the menu below (which passes the clicked row).
  const buildScope = (rowIndex: number | null) => {
    const row =
      rowIndex !== null ? parsed?.normalizedData[rowIndex] : undefined;
    return createTableViewerScope({
      table_title: title ?? "Table",
      table_headers: parsed?.headers.map(cleanTableHeaderKey) ?? [],
      table_row_count: parsed?.rows.length ?? 0,
      table_rows: parsed?.normalizedData ?? [],
      table_markdown: typeof content === "string" ? content : undefined,
      active_row_index: row ? (rowIndex as number) : undefined,
      active_row: row,
      content: typeof content === "string" ? content : "",
      context: {
        surface: "table viewer window",
        viewing: parsed ? `a ${parsed.rows.length}-row table` : "an empty window",
      },
    });
  };

  const tableCsv = (): string => {
    if (!parsed) return "";
    const cell = (v: string) => {
      const escaped = v.replace(/"/g, '""');
      return /[",\n]/.test(v) ? `"${escaped}"` : escaped;
    };
    return [
      parsed.headers.map((h) => cell(cleanTableHeaderKey(h))).join(","),
      ...parsed.rows.map((r) => r.map(cell).join(",")),
    ].join("\n");
  };

  // Surface-specific items only. Copy / Copy-as / Export / Download as Markdown
  // / AI all come from the core menu acting on the resolved `content`, so
  // nothing here re-implements them — these are the two shapes a table has that
  // plain text does not.
  const tableSection: ContextMenuExtraSection = {
    id: "table-viewer",
    label: "Table",
    icon: Rows3,
    items: [
      {
        kind: "item",
        id: "tv-copy-row-json",
        label: "Copy row as JSON",
        icon: Braces,
        description:
          clickedRow === null
            ? "Right-click a table row to copy just that row"
            : undefined,
        disabled: clickedRow === null || !parsed,
        onSelect: () => {
          const i = clickedRow;
          if (i === null || !parsed?.normalizedData[i]) return;
          copy(JSON.stringify(parsed.normalizedData[i], null, 2), "Row JSON");
        },
      },
      {
        kind: "item",
        id: "tv-copy-table-json",
        label: "Copy table as JSON",
        icon: Braces,
        disabled: !parsed,
        onSelect: () =>
          copy(JSON.stringify(parsed?.normalizedData ?? [], null, 2), "Table JSON"),
      },
      {
        kind: "item",
        id: "tv-copy-table-csv",
        label: "Copy table as CSV",
        icon: Sheet,
        disabled: !parsed,
        onSelect: () => copy(tableCsv(), "Table CSV"),
      },
    ],
  };

  return (
    <WindowPanel
      id="table-viewer-window"
      title={title}
      onClose={onClose}
      overlayId="tableViewerWindow"
      minWidth={360}
      minHeight={260}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-auto p-4"
    >
      {/* Nested overlay emitter — while this window is open its scope
          out-depths the host page's provider (deepest wins), so the header
          Agents chrome runs against the TABLE, not the page behind it.
          🚨 It wraps the menu and is NEVER placed between the menu and its
          child: `ContextMenuTrigger asChild` clones its ONE child and hands it
          the trigger's ref + `onContextMenu`, so a non-DOM component in that
          slot swallows them and the menu silently stops opening (measured
          live 2026-08-24 — right-click did nothing at all). */}
      <SurfaceRuntimeProvider
        surfaceName={TABLE_VIEWER_SURFACE_NAME}
        getScope={() => buildScope(null)}
        isEditable={false}
      >
      <NonEditableContextMenu
        sourceFeature="ai-results"
        surfaceName={TABLE_VIEWER_SURFACE_NAME}
        contentSource={{ type: "raw" }}
        // No `entity`: a markdown table rendered from a message is not a
        // record, so Attach To / Share correctly stay hidden rather than
        // targeting the wrong thing.
        // The manifest's values, not a hand-rolled bag — and deliberately NOT
        // `getApplicationScope`, which wins outright over the per-row merge
        // below (`value-resolution.ts`) and would erase the clicked row.
        contextData={buildScope(null)}
        resolveContextOnOpen={(target): ResolvedContextMenuContext | null => {
          const cell = target?.closest<HTMLElement>("[data-cell-row]");
          const raw = cell?.getAttribute("data-cell-row");
          const parsedIndex =
            raw === null || raw === undefined ? null : Number(raw);
          const rowIndex =
            parsedIndex !== null && Number.isInteger(parsedIndex)
              ? parsedIndex
              : null;
          setClickedRow(rowIndex);
          if (rowIndex === null) return null; // whole-table content stands
          const lines = rowLines(rowIndex);
          if (lines.length === 0) return null;
          return {
            content: lines.join("\n"),
            // The two row values the manifest declares — merged OVER the
            // whole-table scope so a row right-click acts on that row.
            active_row_index: rowIndex,
            active_row: parsed?.normalizedData[rowIndex],
          };
        }}
        extraSections={[tableSection]}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {content ? (
            <Suspense fallback={<MatrxMiniLoader />}>
              {/* Larger font + complete metadata so the full toolbar shows.
                  `expanded` disables the in-window "Open in window" action so the
                  user can't recursively open another window from here. */}
              <StreamingTableRenderer
                content={content}
                metadata={{ isComplete: true }}
                fontSize={15}
                expanded
              />
            </Suspense>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No table content to display.
            </div>
          )}
        </div>
      </NonEditableContextMenu>
      </SurfaceRuntimeProvider>
    </WindowPanel>
  );
}

/**
 * Compute a window size that fills most of the screen but always fits, with a
 * comfortable max so it doesn't stretch absurdly wide on large monitors.
 */
function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 900, height: 640 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.round(vw * 0.85), 1400);
  const height = Math.min(Math.round(vh * 0.85), 900);
  return { width, height };
}
