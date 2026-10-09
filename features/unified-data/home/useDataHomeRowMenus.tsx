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

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, ExternalLink, Link2, Star, StarOff } from "lucide-react";
import type { PermissionLevel } from "@ai-matrx/records";
import { RecordsProvider, useRecordsClient } from "@ai-matrx/records/react";
import { createRecordsClient } from "@ai-matrx/records/core";
import { restoreTableIn } from "@/features/unified-data/hub/doors";
import { onReadTheHomeAgain } from "./readTheHomeAgain";
import {
  ArchiveDeliberatelyDialog,
  codeDependsRefusal,
  TableDuplicateDialog,
  TableRenameDialog,
  TableSettings,
  WhereItLives,
  useRecordsUi,
  whatYouMayDo,
} from "@ai-matrx/records-ui";
import { tableActions, type BuiltOnDestination, type ObjectAction, type TableActionHost } from "@ai-matrx/records-ui/object-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ai-matrx/design-system";

import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { toast } from "@/lib/toast";
import { toItemMenuConfig } from "@/features/unified-data/actions/tableActionAdapters";
import { useStarToggle } from "@/features/unified-data/actions/useTableFavorite";
import type { DataHomeRow } from "./dataHomeRows";
import { archiveTableFromHome } from "./archiveTableFromHome";

/** How many table ids one `custom.my_levels` call asks about. */
const LEVELS_PER_CALL = 200;

/** The table's level for each table id in hand; absent = not answered yet. */
/**
 * Answers already given, for the rest of this page's life: a table's level is asked once, so a
 * search keystroke that changes the visible rows asks only for rows not asked about before.
 */
const LEVELS_ASKED = new Map<string, PermissionLevel | null>();

export function useTableLevels(
  tables: ReadonlyArray<{ tableId: string; organizationId: string | null }>,
): ReadonlyMap<string, PermissionLevel | null> {
  const client = useRecordsClient();
  // `custom.my_levels` is asked IN the table's own organization (the door refuses a null one, and
  // the Data home lists every organization): one client per organization, from the mount's config.
  // A table with no organization (an invitation not yet accepted) is never asked —
  // `actionsForHomeTable` resolves it at once.
  const key = [...tables]
    .filter((t) => t.organizationId && !LEVELS_ASKED.has(t.tableId))
    .map((t) => `${t.organizationId}:${t.tableId}`)
    .sort()
    .join(",");
  const [, setAnswered] = useState(0);
  useEffect(() => {
    if (key === "") return;
    let live = true;
    const byOrganization = new Map<string, string[]>();
    for (const pair of key.split(",")) {
      const [organizationId, tableId] = pair.split(":") as [string, string];
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
          if (!answered || !answered.ok) return;
          // An id the store did not answer for is "you hold nothing on it" — an answer, not a wait.
          for (const id of asked) LEVELS_ASKED.set(id, null);
          for (const row of answered.data) LEVELS_ASKED.set(row.id, row.level);
          if (live) setAnswered((n) => n + 1);
        });
      }
    }
    return () => {
      live = false;
    };
  }, [client, key]);
  return LEVELS_ASKED;
}

/**
 * THE LIST READS AGAIN WHEN A TABLE COMES BACK: the archive toast's Undo and ⌘Z (one undo, wrapped
 * by `RECORDS_NOTIFY.reversible`) call `readTheHomeAgain()`; the Data home's corpus is read again so
 * the table is listed at once. Returns a version the corpus is keyed on. Debounced.
 */
export function useReadAgainOnRestore(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const again = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVersion((v) => v + 1), 250);
    };
    const offRestore = onReadTheHomeAgain(again);
    return () => {
      offRestore();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return version;
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

/** Every entry of an invitation not yet accepted, but Open and the star, says this. */
export const ACCEPT_FIRST_REASON = "Accept the invitation first";

/**
 * A DATA HOME TABLE ROW'S ACTIONS (pure, so the never-waits rule is testable).
 *
 * A row with NO organization is a table shared with this person that she has not accepted yet
 * (`dataHomeRows.ts`, the shared-with-me listing; its href is the invitation's accept screen). The
 * access lookup cannot be asked about it (`custom.my_levels` is asked in an organization), so it
 * must never wait on one: it resolves at once — Open goes to the invitation, the star works, and
 * every other entry says to accept first. Same ids as any table (G2).
 */
export function actionsForHomeTable(
  row: DataHomeRow,
  tableId: string,
  level: PermissionLevel | null | undefined,
  host: TableActionHost,
): ObjectAction[] {
  const table = { id: tableId, name: row.name, is_kernel: row.system };
  if (row.organizationId) {
    return tableActions({ table, rights: whatYouMayDo(level ?? null, level !== undefined), host });
  }
  const invitation: TableActionHost = {
    ...(host.origin ? { origin: host.origin } : {}),
    ...(host.open ? { open: host.open } : {}),
    ...(host.isFavorite !== undefined ? { isFavorite: host.isFavorite } : {}),
    ...(host.toggleFavorite ? { toggleFavorite: host.toggleFavorite } : {}),
    ...(host.extend ? { extend: host.extend } : {}),
  };
  // The rights are not this row's to ask yet; every entry the invitation does not offer is
  // unbound, and its reason is the one step that unlocks it.
  return tableActions({ table, rights: whatYouMayDo("admin", true), host: invitation }).map((a) =>
    a.disabledReason !== undefined && a.id !== "open-public" ? { ...a, disabledReason: ACCEPT_FIRST_REASON } : a,
  );
}

type Asked = {
  what: "share" | "rename" | "duplicate" | "move" | "archive" | "archive-deliberately";
  row: DataHomeRow;
  count: number;
  /** A table an app's code depends on: what the store's refusal named (v7 TABLE-EXPERIENCE item 6). */
  codeDepends?: { slug: string; declaredIn: string | null };
};

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
  onHide,
  onUnhide,
}: {
  starred: ReadonlySet<string>;
  onOpened: (row: DataHomeRow) => void;
  onChanged: () => void;
  /** An archive is under way: the row leaves the list now (optimistic). */
  onHide: (rowId: string) => void;
  /** The archive failed or was undone: the row is listed again. */
  onUnhide: (rowId: string) => void;
}): DataHomeRowMenus {
  const { copyText: copyTextKit } = useClipboard({
    notify: copyNotify,
  });
  const router = useRouter();
  const client = useRecordsClient();
  const recordsUi = useRecordsUi();
  const stars = useStarToggle();
  const [asked, setAsked] = useState<Asked | null>(null);
  const ask = (what: Asked["what"], row: DataHomeRow) =>
    setAsked((now) => ({ what, row, count: (now?.count ?? 0) + 1 }));
  const close = () => setAsked(null);
  // ARCHIVE FROM THE LIST: the size look decides before anything is drawn. Small → the row leaves,
  // the archive runs, the toast announces it with Undo (no dialog). Big → the counted confirm.
  const archiveNow = async (row: DataHomeRow, tableId: string) => {
    const inOrganization = row.organizationId
      ? createRecordsClient({ ...client.config, organizationId: row.organizationId })
      : client;
    const result = await archiveTableFromHome({
      client: inOrganization,
      tableId,
      notify: recordsUi.notify,
      fallbackName: row.name,
      onOptimisticHide: () => onHide(row.id),
      onRollback: () => onUnhide(row.id),
      onRestored: () => onUnhide(row.id),
    });
    if (result.outcome === "needs-confirm") ask("archive", row);
    else if (result.outcome === "refused") {
      const codeDepends = codeDependsRefusal(result.error);
      if (codeDepends) setAsked((now) => ({ what: "archive-deliberately", row, count: (now?.count ?? 0) + 1, codeDepends }));
      else toast.error(result.sentence);
    }
  };
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
    const actions: ObjectAction[] = actionsForHomeTable(row, tableId, level, {
        ...(origin ? { origin } : {}),
        open: () => {
          onOpened(row);
          router.push(row.href);
        },
        openInNewTab: (url) => {
          window.open(url, "_blank", "noopener,noreferrer");
        },
        copyText: async (url) => {
          await copyTextKit(url, "Link copied", "Couldn’t copy the link");
        },
        rename: () => ask("rename", row),
        // v7 TABLE-EXPERIENCE item 3: the one Duplicate dialog (records-ui), in the table's organization.
        duplicate: () => ask("duplicate", row),
        move: () => ask("move", row),
        isFavorite: starred.has(row.id),
        toggleFavorite: () => stars.toggle(row.id),
        ...(recordsUi.share && row.organizationId ? { share: () => ask("share", row) } : {}),
        export: () => go("rail=export"),
        import: () => go("rail=import"),
        addColumn: () => go("rail=field"),
        settings: () => go("rail=settings"),
        openBuiltOn: (destination) => go(BUILT_ON_ADDRESS[destination]),
        archive: () => void archiveNow(row, tableId),
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
    });
    return toItemMenuConfig(actions);
  };

  /**
   * AN ARCHIVED ROW (the list's Archived filter, TABLE-ACTIONS item 10): Open, and Restore. A table
   * is restored in its own organization pass by pass (`custom.table_restore` through
   * `restoreTableIn` — one call timed out on a big table), which brings back what was built on it
   * in the same event; a portal comes back from its table's Portals rail.
   */
  const forArchived = (row: DataHomeRow): ItemMenuConfig => {
    const restore = async () => {
      if (!row.organizationId || !row.tableId) return;
      const answered = await restoreTableIn(client.config.dataSource, row.organizationId, row.tableId);
      if (!answered.ok) {
        // A statement timeout is ours to word; Postgres's sentence never reaches the toast.
        throw new Error(
          answered.error.sqlstate === "57014" ? "The restore took too long. Try again in a moment." : answered.error.message,
        );
      }
      onChanged();
    };
    return {
      sections: [
        {
          id: "open",
          items: [
            { id: "open", kind: "link", label: "Open", href: row.href },
            { id: "open-tab", kind: "link", label: "Open in new tab", icon: ExternalLink, href: row.href, target: "_blank" },
          ],
        },
        {
          id: "restore",
          items: [
            row.kind === "table"
              ? {
                  id: "restore",
                  label: "Restore",
                  icon: ArchiveRestore,
                  onSelect: restore,
                  toast: { loading: "Restoring…", success: `${row.name} restored`, error: (e) => (e instanceof Error ? e.message : "Couldn’t restore") },
                }
              : { id: "restore", kind: "link", label: "Restore from its table", icon: ArchiveRestore, href: row.href },
          ],
        },
      ],
    };
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
    ) : asked.what === "archive-deliberately" && asked.codeDepends ? (
      inTablesOrganization(
        <ArchiveDeliberatelyDialog
          key={`deliberate-${asked.count}`}
          tableId={tableId}
          name={row.name}
          slug={asked.codeDepends.slug}
          declaredIn={asked.codeDepends.declaredIn}
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onArchived={() => {
            onHide(row.id);
            onChanged();
          }}
        />,
      )
    ) : asked.what === "duplicate" ? (
      inTablesOrganization(
        <TableDuplicateDialog
          key={`duplicate-${asked.count}`}
          tableId={tableId}
          name={row.name}
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          onDuplicated={(copy) => {
            onChanged();
            router.push(copy.path);
          }}
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
      // Only a BIG table reaches this counted confirm. The panel never says it finished, so the
      // list reads again whenever the dialog closes (an archive that ran, or none, both list true).
      <Dialog
        open
        onOpenChange={(open) => {
          if (open) return;
          close();
          onChanged();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-data-home-archive="">
          <DialogHeader>
            <DialogTitle>{row.name}</DialogTitle>
          </DialogHeader>
          {inTablesOrganization(
            <TableSettings
              tableId={tableId}
              archiveAsked={asked.count}
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
        .filter((r) => r.kind === "table" && r.tableId && !r.archived)
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
        row.archived ? forArchived(row) : row.kind === "table" && row.tableId ? forTable(row, row.tableId, levels) : forItem(row),
    },
    modals,
    };
  };

  return { useRowActions };
}
