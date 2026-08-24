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
      <NonEditableContextMenu
        sourceFeature="ai-results"
        contentSource={{ type: "raw" }}
        // No `entity`: a markdown table rendered from a message is not a
        // record, so Attach To / Share correctly stay hidden rather than
        // targeting the wrong thing.
        contextData={{
          content: typeof content === "string" ? content : "",
          context: parsed
            ? { columns: parsed.headers.map(cleanTableHeaderKey), row_count: parsed.rows.length }
            : {},
        }}
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
          return { content: lines.join("\n") };
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
