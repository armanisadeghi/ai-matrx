"use client";

// features/unified-data/home/useDataHomeRowMenus.tsx — lane TABLE-ACTIONS (wave 1, items 1, 2, 7)
//
// THE DATA HOME ROW'S MENU IS THE TABLE'S ONE ACTION LIST. A table row's ⋯, its card ⋯ and its
// right-click all draw `tableActions()` from `@ai-matrx/records-ui` through `toItemMenuConfig` —
// the shell feeds that same `menuFor` to the right-click (`EntityListTable` `withRowMenu`, the one
// converter `toExtraSections` also uses), so the three surfaces cannot differ. Before this the row
// had Open / Open in new tab / Alchemy / Favorite (`dataHomeRowActions`, deleted).
//
// What a row ⋯ does that the table page does on its own page: open the table with the rail or view
// that verb lands on (`?rail=export|import|settings|field|forms…`, `?view=dashboards|archived`).
// What it does in place: copy link, favorite, share (the host's one share dialog), rename (the
// package's rename dialog), move (the one where-it-lives panel) and archive (the settings panel's one
// archive path: at once with Undo under the organization's line, the counted confirm above it).
//
// Rights come from the store per table (`custom.my_levels`, one call per 200 tables in hand) and
// only ever set a disabled reason: a member meets the same list as the owner (G2).
//
// Rows that are not tables (forms, dashboards, digests…) keep their open entries; they get their
// own action lists when their kinds are added to the registry.

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Star, StarOff } from "lucide-react";
import type { PermissionLevel } from "@ai-matrx/records";
import { RecordsProvider, useRecordsClient } from "@ai-matrx/records/react";
import { createRecordsClient } from "@ai-matrx/records/core";
import {
  TableRenameDialog,
  TableSettings,
  WhereItLives,
  useRecordsUi,
  whatYouMayDo,
} from "@ai-matrx/records-ui";
import { tableActions, type BuiltOnDestination, type ObjectAction } from "@ai-matrx/records-ui/object-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ai-matrx/design-system";

import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { toast } from "@/lib/toast";
import { toItemMenuConfig } from "@/features/unified-data/actions/tableActionAdapters";
import { useStarToggle } from "@/features/unified-data/actions/useTableFavorite";
import type { DataHomeRow } from "./dataHomeRows";

/** How many table ids one `custom.my_levels` call asks about. */
const LEVELS_PER_CALL = 200;

/** The table's level for each table id in hand; absent = not answered yet. */
export function useTableLevels(
  tables: ReadonlyArray<{ tableId: string; organizationId: string | null }>,
): ReadonlyMap<string, PermissionLevel | null> {
  const client = useRecordsClient();
  // `custom.my_levels` is asked IN the table's own organization (the door refuses a null one, and
  // the Data home lists every organization): one client per organization, from the mount's config.
  const key = [...tables].map((t) => `${t.organizationId ?? ""}:${t.tableId}`).sort().join(",");
  const [levels, setLevels] = useState<ReadonlyMap<string, PermissionLevel | null>>(() => new Map());
  useEffect(() => {
    if (key === "") return;
    let live = true;
    const byOrganization = new Map<string, string[]>();
    for (const pair of key.split(",")) {
      const [organizationId, tableId] = pair.split(":") as [string, string];
      if (!organizationId) continue;
      byOrganization.set(organizationId, [...(byOrganization.get(organizationId) ?? []), tableId]);
    }
    for (const [organizationId, ids] of byOrganization) {
      const inOrganization = createRecordsClient({ ...client.config, organizationId });
      for (let i = 0; i < ids.length; i += LEVELS_PER_CALL) {
        const asked = ids.slice(i, i + LEVELS_PER_CALL);
        // A read that fails is asked again (three tries, a pause between): the menu says
        // "Checking your access…" meanwhile, never a refusal it did not get.
        const ask = async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            const answered = await inOrganization.myLevels({ ids: asked });
            if (answered.ok || !live) return answered;
            await new Promise((r) => setTimeout(r, 3000));
          }
          return null;
        };
        void ask().then((answered) => {
          if (!live || !answered || !answered.ok) return;
          setLevels((now) => {
            const next = new Map(now);
            // An id the store did not answer for is "you hold nothing on it" — an answer, not a wait.
            for (const id of asked) next.set(id, null);
            for (const row of answered.data) next.set(row.id, row.level);
            return next;
          });
        });
      }
    }
    return () => {
      live = false;
    };
  }, [client, key]);
  return levels;
}

/** Where each "Built on it" place opens on the table's page. */
const BUILT_ON_ADDRESS: Record<BuiltOnDestination, string> = {
  forms: "rail=forms",
  bookings: "rail=bookings",
  checklists: "rail=checklists",
  notifications: "rail=notifications",
  portals: "rail=portals",
  inbox: "rail=inbox",
  dashboards: "view=dashboards",
  archived: "view=archived",
};

type Asked = { what: "share" | "rename" | "move" | "archive"; row: DataHomeRow; count: number };

const NO_PUBLIC_LINK_REASON = "No public link";
const NO_TABLE_HISTORY_REASON = "No table history yet";

function withQuery(href: string, query: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}${query}`;
}

export interface DataHomeRowMenus {
  /** The shell's `useRowActions` for the Data home, with the dialogs a row's menu opened. */
  useRowActions: (list: EntityListController<DataHomeRow>) => EntityRowActionsResult<DataHomeRow>;
}

/**
 * The Data home's row menus and the dialogs they open. `onChanged` re-reads the list after a
 * rename, a move or an archive.
 */
export function useDataHomeRowMenus({
  starred,
  onOpened,
  onChanged,
}: {
  starred: ReadonlySet<string>;
  onOpened: (row: DataHomeRow) => void;
  onChanged: () => void;
}): DataHomeRowMenus {
  const router = useRouter();
  const client = useRecordsClient();
  const recordsUi = useRecordsUi();
  const stars = useStarToggle();
  const [asked, setAsked] = useState<Asked | null>(null);
  const ask = (what: Asked["what"], row: DataHomeRow) =>
    setAsked((now) => ({ what, row, count: (now?.count ?? 0) + 1 }));
  const close = () => setAsked(null);
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;

  const forTable = (
    row: DataHomeRow,
    tableId: string,
    levels: ReadonlyMap<string, PermissionLevel | null>,
  ): ItemMenuConfig => {
    const level = levels.get(tableId);
    const go = (query: string) => {
      onOpened(row);
      router.push(withQuery(row.href, query));
    };
    const actions: ObjectAction[] = tableActions({
      table: { id: tableId, name: row.name, is_kernel: row.system },
      rights: whatYouMayDo(level ?? null, level !== undefined),
      host: {
        ...(origin ? { origin } : {}),
        open: () => {
          onOpened(row);
          router.push(row.href);
        },
        openInNewTab: (url) => {
          window.open(url, "_blank", "noopener,noreferrer");
        },
        copyText: async (url) => {
          try {
            await navigator.clipboard.writeText(url);
            toast.success("Link copied");
          } catch {
            toast.error("Couldn’t copy the link");
          }
        },
        rename: () => ask("rename", row),
        move: () => ask("move", row),
        isFavorite: starred.has(row.id),
        toggleFavorite: () => stars.toggle(row.id),
        ...(recordsUi.share && row.organizationId ? { share: () => ask("share", row) } : {}),
        export: () => go("rail=export"),
        import: () => go("rail=import"),
        addColumn: () => go("rail=field"),
        settings: () => go("rail=settings"),
        openBuiltOn: (destination) => go(BUILT_ON_ADDRESS[destination]),
        archive: () => ask("archive", row),
        unavailableReasons: {
          history: NO_TABLE_HISTORY_REASON,
          "make-default": "Open the table to choose",
        },
        extend: () => [
          row.publicHref
            ? {
                id: "open-public",
                label: "Open public link",
                icon: "link-2",
                group: "open",
                run: () => void window.open(row.publicHref as string, "_blank", "noopener,noreferrer"),
              }
            : { id: "open-public", label: "Open public link", icon: "link-2", group: "open", disabledReason: NO_PUBLIC_LINK_REASON, run: () => {} },
        ],
      },
    });
    return toItemMenuConfig(actions);
  };

  /** A row that is not a table: its open entries and its star. */
  const forItem = (row: DataHomeRow): ItemMenuConfig => {
    const isStarred = starred.has(row.id);
    return {
      sections: [
        {
          id: "open",
          items: [
            { id: "open", kind: "link", label: "Open", href: row.href },
            { id: "open-tab", kind: "link", label: "Open in new tab", icon: ExternalLink, href: row.href, target: "_blank" },
            ...(row.publicHref
              ? [{ id: "public", kind: "link" as const, label: "Open public link", icon: Link2, href: row.publicHref, target: "_blank" as const }]
              : []),
          ],
        },
        {
          id: "mark",
          items: [
            {
              id: "star",
              label: isStarred ? "Remove from favorites" : "Add to favorites",
              icon: isStarred ? StarOff : Star,
              onSelect: () => stars.toggle(row.id),
            },
          ],
        },
      ],
    };
  };

  // THE DIALOGS, in the TABLE's organization (a rename or a move writes as the table's home).
  const row = asked?.row ?? null;
  const tableId = row?.tableId ?? null;
  const inTablesOrganization = (node: ReactNode) =>
    row?.organizationId ? (
      <RecordsProvider config={{ ...client.config, organizationId: row.organizationId }}>{node}</RecordsProvider>
    ) : (
      node
    );
  const modals: ReactNode =
    !asked || !row || !tableId ? null : asked.what === "share" && recordsUi.share && row.organizationId ? (
      recordsUi.share({ kind: "table", organizationId: row.organizationId, subjectId: tableId, name: row.name, onClose: close })
    ) : asked.what === "rename" ? (
      inTablesOrganization(
        <TableRenameDialog
          tableId={tableId}
          name={row.name}
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onRenamed={() => onChanged()}
        />,
      )
    ) : asked.what === "move" ? (
      inTablesOrganization(
        <WhereItLives
          key={`move-${asked.count}`}
          tableId={tableId}
          variant="anchor"
          openAsked={asked.count}
          onMoved={() => onChanged()}
        />,
      )
    ) : (
      <Dialog open onOpenChange={(open) => (open ? null : close())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-data-home-archive="">
          <DialogHeader>
            <DialogTitle>{row.name}</DialogTitle>
          </DialogHeader>
          {inTablesOrganization(
            <TableSettings
              tableId={tableId}
              archiveAsked={asked.count}
              onDeleted={() => {
                close();
                onChanged();
              }}
            />,
          )}
        </DialogContent>
      </Dialog>
    );

  // The shell calls this as a hook, every render: the levels are asked for the rows it SHOWS
  // (a list read that failed and was retried still gets its rights).
  const useRowActions = (list: EntityListController<DataHomeRow>): EntityRowActionsResult<DataHomeRow> => {
    const levels = useTableLevels(
      list.rows
        .filter((r) => r.kind === "table" && r.tableId)
        .map((r) => ({ tableId: r.tableId as string, organizationId: r.organizationId })),
    );
    return {
    actions: {
      onOpenRow: (row) => {
        onOpened(row);
        router.push(row.href);
      },
      onToggleFavorite: (row) => stars.toggle(row.id),
      menuFor: (row) => () =>
        row.kind === "table" && row.tableId ? forTable(row, row.tableId, levels) : forItem(row),
    },
    modals,
    };
  };

  return { useRowActions };
}
