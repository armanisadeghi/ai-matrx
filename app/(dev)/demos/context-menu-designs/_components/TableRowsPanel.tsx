"use client";

// Data home rows (/data) for the right-click demo. Both sides use the real wrapper a Data home row
// uses (`ItemContextMenu`, sourceFeature "udt", surface "matrx-user/data-tables"):
//   today    — the row menu /data ships right now (Open, Open in new tab, Favorite)
//   proposed — the ONE table action list (`tableActions` in @ai-matrx/records-ui) through its
//              frontend adapter, which is what the Data home adopts next.
// Rows are fixtures; every handler only says what it would run.

import { ExternalLink, Star, Table2 } from "lucide-react";
import { tableActions, whatYouMayDo, type TableActionSubject } from "@ai-matrx/records-ui";
import { ItemContextMenu } from "@ai-matrx/design-system/item";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { toItemMenuConfig } from "@/features/unified-data/actions/tableActionAdapters";
import { toast } from "@/lib/toast";
import { formatCount } from "@ai-matrx/kit/format";

export const CLINIC_TABLES: { id: string; name: string; records: number; updated: string }[] = [
  { id: "031d3690-4a02-4cee-a575-454ffd96c992", name: "Patient Visit Tracker", records: 1284, updated: "2h ago" },
  { id: "7c1e9a52-0b6d-4f0e-9d0c-2f5a8e3b1c41", name: "Referral Intake Queue", records: 87, updated: "Today" },
  { id: "b8f3d2e1-5a47-4c19-8e6b-90d1c7a4f256", name: "Home Exercise Plans", records: 342, updated: "Yesterday" },
];

const would = (what: string) => (table: TableActionSubject) => {
  toast.info(`Would run: ${what} · ${table.name}`);
};

function proposedConfig(table: TableActionSubject, viewer: boolean): ItemMenuConfig {
  return toItemMenuConfig(
    tableActions({
      table,
      rights: whatYouMayDo(viewer ? "viewer" : "admin", true),
      host: {
        open: would("Open"),
        openInNewTab: (_url, t) => would("Open in new tab")(t),
        copyText: (_text, t) => would("Copy link")(t),
        rename: would("Rename"),
        duplicate: would("Duplicate"),
        move: would("Move to"),
        isFavorite: false,
        toggleFavorite: would("Favorite"),
        share: would("Share"),
        export: would("Download"),
        import: would("Import"),
        addColumn: would("Add column"),
        settings: would("Settings"),
        history: would("History"),
        openBuiltOn: (destination, t) => would(destination)(t),
        archive: would("Archive"),
      },
    }),
  );
}

function todayConfig(table: TableActionSubject): ItemMenuConfig {
  const href = `/data/${table.id}`;
  return {
    sections: [
      {
        id: "open",
        items: [
          { id: "open", kind: "link", label: "Open", href },
          { id: "open-tab", kind: "link", label: "Open in new tab", icon: ExternalLink, href, target: "_blank" },
        ],
      },
      {
        id: "mark",
        items: [{ id: "star", label: "Add to favorites", icon: Star, onSelect: () => would("Favorite")(table) }],
      },
    ],
  };
}

export function TableRowsPanel({ side, viewer }: { side: "today" | "proposed"; viewer: boolean }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card" data-demo-surface="table">
      {CLINIC_TABLES.map((t) => (
        <ItemContextMenu
          key={t.id}
          config={side === "today" ? todayConfig(t) : proposedConfig(t, viewer)}
          sourceFeature="udt"
          surfaceName="matrx-user/data-tables"
        >
          <div
            data-demo-row=""
            className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-accent/50"
          >
            <Table2 className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{t.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {formatCount(t.records)} records · {t.updated}
              </div>
            </div>
          </div>
        </ItemContextMenu>
      ))}
    </div>
  );
}
