"use client";

// features/content-ir/studio/records/KindRecordsTable.tsx
//
// /shapes/[kind]/table — the ORG-WIDE register of one kind's saved records
// (DD-131 slice 1, item 7).
//
// The four rulings this screen exists to keep:
//
//  1. ORG-WIDE, under the viewer's access. The default scope is `orgs`
//     (lib/list-scope vocabulary), never `created_by = me`.
//  2. UNCONFIRMED ROWS ALWAYS SHOW, badged. Hiding them is a filter the user
//     chooses, never a default the screen chooses for them.
//  3. CONFIRM IS ONE CLICK — on a row, or on a selection. Archive is a
//     SEPARATE axis: unconfirmed+archived, confirmed+archived and the other
//     two combinations are all legal and all render.
//  4. EDITING ONE FIELD CONFIRMS THE ROW, AND THE SCREEN SAYS SO AT THAT
//     MOMENT. A person correcting a machine's value IS them standing behind
//     the record; announcing it later (or never) hides what they just did. A
//     BULK operation confirms nothing on its own.
//
// Every control here is present and honest or absent. The two that a viewer
// may not be allowed to run (Unconfirm needs admin; every door needs editor+
// on the row) are offered, and the database's refusal is shown as the sentence
// it actually is — never a greyed button with no explanation.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Check,
  CircleDashed,
  MoreVertical,
  Undo2,
} from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  ColumnFiltersState,
  CellEditsMap,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import {
  ArchiveFilter,
  DEFAULT_ARCHIVE_FILTER,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { EntityScopeTabs } from "@/lib/entity-list/components/EntityScopeTabs";
import type { EntityScopeCounts } from "@/lib/entity-list/types";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/utils/supabase/client";
import { makeScope, type ListScope } from "@/lib/list-scope/types";
import {
  buildRecordColumns,
  numericKeys,
  schemaFields,
  searchableKeys,
  type SchemaField,
} from "./buildRecordColumns";
import {
  archiveRecords,
  confirmRecords,
  countKindRecordsByArchiveState,
  countKindRecordsByScope,
  creatorNames as readCreatorNames,
  editRecordValue,
  listKindRecords,
  unconfirmRecords,
  type RecordScopeCounts,
} from "./records-service";
import type {
  ConfirmationFilter,
  KindRecordRow,
  RecordSortKey,
  WriterFilter,
} from "./types";

interface Props {
  kind: string;
  label: string;
  kindDefinitionId: string;
  /** The kind's emitted JSON Schema — the column registry for this table. */
  emittedJsonSchema: unknown;
}

const SURFACE_KEY = "kind-records-table";
const SURFACE_DEFAULTS = {
  version: 1,
  sort: "created_at",
  direction: "desc" as const,
};

/** The scopes this surface serves. Org-wide FIRST — it is the default. */
const RECORD_SCOPES = ["orgs", "mine"] as const;

/**
 * 🚨 THE LANDING RULE — a first screen never opens on a scope that structurally
 * cannot hold the viewer's rows.
 *
 * "My Orgs" means "organizations you belong to", and `readableOrganizations()`
 * excludes PERSONAL organizations (they have no teammates). So for a user whose
 * only organization is their own personal one — which is every brand-new
 * account, and was `test@test.com` in Test's Org — the default scope is empty
 * FOREVER: `My Orgs 0` beside `Mine 7`, with an empty state saying nothing had
 * been produced, seconds after they pressed Save in chat (V-42 §3.2, root cause
 * measured 2026-09-12: `iam.organizations.is_personal = true`).
 *
 * The scope SEMANTICS are the platform's and are not touched here — the counts
 * were right, the landing was wrong. So exactly once, before the person has
 * touched the scope tabs, the screen lands on the scope that actually holds
 * rows. The tabs show which one is active and what each holds, so nothing is
 * hidden — and the moment the user picks a scope themselves, this never fires
 * again and their choice stands even when it is empty.
 */

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function KindRecordsTable({
  kind,
  label,
  kindDefinitionId,
  emittedJsonSchema,
}: Props) {
  const { prefs, setPrefs } = useListViewPrefs(SURFACE_KEY, SURFACE_DEFAULTS);

  const [fields] = useState<SchemaField[]>(() => schemaFields(emittedJsonSchema));
  const [scope, setScope] = useState<ListScope>(() => makeScope("orgs"));
  /** True once the landing rule has run or the person picked a scope. */
  const scopeSettled = useRef(false);
  const [search, setSearch] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationFilter>("all");
  const [writer, setWriter] = useState<WriterFilter>("all");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilterValue>(
    DEFAULT_ARCHIVE_FILTER,
  );
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>({});
  const [page, setPage] = useState(1); // one-based, like MatrxDataTable

  const [rows, setRows] = useState<KindRecordRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scopeCounts, setScopeCounts] = useState<RecordScopeCounts | null>(null);
  const [archiveCounts, setArchiveCounts] = useState<
    Partial<Record<ArchiveFilterValue, number>>
  >({});
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** The "this edit confirmed the record" announcement, shown at that moment. */
  const [confirmedByEdit, setConfirmedByEdit] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [unconfirmTarget, setUnconfirmTarget] = useState<KindRecordRow | null>(null);

  const generation = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setViewerId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const readerArgs = {
    kindDefinitionId,
    searchKeys: searchableKeys(fields),
    numericKeys: numericKeys(fields),
    search,
    confirmation,
    writer,
    columnFilters,
  };
  const readerKey = JSON.stringify({
    kindDefinitionId,
    scope,
    search,
    confirmation,
    writer,
    archiveFilter,
    columnFilters,
    sort: prefs.sort,
    direction: prefs.direction,
    page,
    pageSize: prefs.pageSize,
    reloadToken,
  });

  useEffect(() => {
    const mine = ++generation.current;
    setIsFetching(true);
    setError(null);

    // `listScope` is the lib/list-scope value narrowed to what THIS reader can
    // serve: `mine`, one organization, or every organization the viewer
    // belongs to. The tabs cannot produce any other kind.
    const listScope =
      scope.kind === "mine"
        ? ({ kind: "mine" } as const)
        : ({
            kind: "orgs" as const,
            organizationId: scope.kind === "orgs" ? scope.organizationId : null,
          } as const);

    async function run() {
      const result = await listKindRecords({
        ...readerArgs,
        scope: listScope,
        archiveFilter,
        sort: prefs.sort as RecordSortKey,
        direction: prefs.direction,
        page,
        pageSize: prefs.pageSize,
      });
      if (generation.current !== mine) return;
      setRows(result.rows);
      setTotal(result.total);

      // Names, scope counts and archive counts are all read for the SAME query
      // the rows came from, so no number on this screen can describe a
      // different set than the rows underneath it.
      const [resolvedNames, scopes, archives] = await Promise.all([
        readCreatorNames(result.rows.map((r) => r.organizationId)),
        countKindRecordsByScope({ ...readerArgs, archiveFilter }),
        countKindRecordsByArchiveState({ ...readerArgs, scope: listScope }),
      ]);
      if (generation.current !== mine) return;
      setNames(resolvedNames);
      setScopeCounts(scopes);
      setArchiveCounts(archives);

      // THE LANDING RULE — once, on the first counts this screen ever reads.
      if (!scopeSettled.current) {
        scopeSettled.current = true;
        if (scope.kind === "orgs" && scopes.orgs === 0 && scopes.mine > 0) {
          setScope(makeScope("mine"));
          setPage(1);
        }
      }
    }

    run()
      .catch((err: unknown) => {
        if (generation.current !== mine) return;
        setError(messageOf(err));
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (generation.current !== mine) return;
        setIsLoading(false);
        setIsFetching(false);
      });
    // `readerKey` IS the whole query said once — every field the reader uses
    // rides inside it, including the reader args and the archive axis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerKey]);

  const counts: EntityScopeCounts = {
    byKind: {
      orgs: scopeCounts?.orgs ?? 0,
      mine: scopeCounts?.mine ?? 0,
    },
    narrow: {
      orgs: (scopeCounts?.perOrg ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        count: o.count,
      })),
    },
  };

  const columns = buildRecordColumns({
    fields,
    creatorNames: names,
    viewerId,
    showWriterTier: writer === "all",
  });

  /** Run a door and say what happened — including a refusal, verbatim. */
  const runDoor = useCallback(
    async (
      what: string,
      op: () => Promise<unknown>,
      done: (n: number) => string,
      n: number,
    ) => {
      setBusy(true);
      try {
        await op();
        toast.success(done(n));
        reload();
      } catch (err: unknown) {
        // The database refuses in sentences (no admin, no editor access, a
        // reason too short). Show the sentence — never "Something went wrong".
        toast.error(`${what} was refused: ${messageOf(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const confirmOne = useCallback(
    (row: KindRecordRow) =>
      void runDoor(
        "Confirm",
        () => confirmRecords([row.id]),
        () => `Confirmed — you are standing behind “${row.title ?? "this record"}”.`,
        1,
      ),
    [runDoor],
  );

  const confirmMany = useCallback(
    (ids: string[]) =>
      void runDoor(
        "Confirm",
        () => confirmRecords(ids),
        (n) => `${n} record${n === 1 ? "" : "s"} confirmed.`,
        ids.length,
      ),
    [runDoor],
  );

  const setArchived = useCallback(
    (ids: string[], archived: boolean) =>
      void runDoor(
        archived ? "Archive" : "Restore",
        () => archiveRecords(ids, archived),
        (n) =>
          archived
            ? `${n} record${n === 1 ? "" : "s"} archived. Confirmation is unchanged.`
            : `${n} record${n === 1 ? "" : "s"} restored.`,
        ids.length,
      ),
    [runDoor],
  );

  /**
   * One cell, written through the single-record door. `autoSave` means this
   * runs per committed cell, so an edit is never batched into something that
   * would confirm several rows at once.
   */
  const saveEdits = useCallback(
    async (edits: CellEditsMap) => {
      for (const [rowId, patch] of Object.entries(edits)) {
        for (const [columnId, value] of Object.entries(patch)) {
          if (!columnId.startsWith("data:")) continue;
          const key = columnId.slice("data:".length);
          const result = await editRecordValue(rowId, key, value);
          if (result.confirmedByThisEdit) {
            const row = rows.find((r) => r.id === rowId);
            setConfirmedByEdit({
              id: rowId,
              title: row?.title?.trim() || "this record",
            });
          }
        }
      }
      reload();
    },
    [reload, rows],
  );

  const menuFor = useCallback(
    (row: KindRecordRow): ItemMenuConfig => ({
      header: { title: row.title?.trim() || "Untitled record" },
      sections: [
        {
          id: "standing",
          label: "Standing",
          items: [
            {
              id: "confirm",
              label: "Confirm",
              icon: BadgeCheck,
              hidden: row.confirmation === "confirmed",
              onSelect: () => confirmOne(row),
            },
            {
              id: "unconfirm",
              label: "Take the confirmation back",
              icon: Undo2,
              hidden: row.confirmation === "unconfirmed",
              description: "Needs an administrator and a written reason.",
              onSelect: () => setUnconfirmTarget(row),
            },
          ],
        },
        {
          id: "archive",
          label: "Working set",
          items: [
            {
              id: "archive",
              label: "Archive",
              icon: Archive,
              hidden: row.archivedAt !== null,
              onSelect: () => setArchived([row.id], true),
            },
            {
              id: "restore",
              label: "Restore",
              icon: ArchiveRestore,
              hidden: row.archivedAt === null,
              onSelect: () => setArchived([row.id], false),
            },
          ],
        },
      ],
    }),
    [confirmOne, setArchived],
  );

  const onTableState = useCallback(
    (next: MatrxDataTableQueryState) => {
      if (next.search !== search) {
        setSearch(next.search);
        setPage(1);
      }
      if (JSON.stringify(next.columnFilters) !== JSON.stringify(columnFilters)) {
        setColumnFilters(next.columnFilters);
        setPage(1);
      }
      if (next.page !== page) setPage(next.page);
      if (next.pageSize !== prefs.pageSize) setPrefs({ pageSize: next.pageSize });
      if (
        next.sort &&
        (next.sort.id !== prefs.sort || next.sort.direction !== prefs.direction)
      ) {
        setPrefs({ sort: next.sort.id, direction: next.sort.direction });
      }
    },
    [columnFilters, page, prefs.direction, prefs.pageSize, prefs.sort, search, setPrefs],
  );

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const unconfirmedSelected = selectedRows.filter(
    (r) => r.confirmation === "unconfirmed",
  );
  const archivedSelected = selectedRows.filter((r) => r.archivedAt !== null);
  const liveSelected = selectedRows.filter((r) => r.archivedAt === null);

  const archivedElsewhere = archiveCounts.archived ?? 0;

  /**
   * THE OTHER-SCOPE RULE: a list may not say "nothing has been produced" while
   * it can see rows sitting one tab away. When the visible scope is empty and
   * the other one is not, the empty state names the number and offers the one
   * click that reaches it.
   */
  const otherScope: { kind: "mine" | "orgs"; label: string; count: number } | null =
    scope.kind === "mine"
      ? (scopeCounts?.orgs ?? 0) > 0
        ? { kind: "orgs", label: "My Orgs", count: scopeCounts?.orgs ?? 0 }
        : null
      : (scopeCounts?.mine ?? 0) > 0
        ? { kind: "mine", label: "Mine", count: scopeCounts?.mine ?? 0 }
        : null;

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {/* The moment a person's edit made them the record's guarantor. */}
      {confirmedByEdit ? (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
          role="status"
        >
          <span className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              <strong>Confirmed — you edited this record.</strong>{" "}
              Changing a value on “{confirmedByEdit.title}” means you are standing
              behind it, so it is no longer unconfirmed.
            </span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmedByEdit(null)}
          >
            Got it
          </Button>
        </div>
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>
            <strong>These records could not be read.</strong> {error}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <EntityScopeTabs
          scope={scope}
          scopes={[...RECORD_SCOPES]}
          counts={counts}
          onChange={(next) => {
            // A scope the person picked is theirs — the landing rule must
            // never move them off it, even when it holds nothing.
            scopeSettled.current = true;
            setScope(next);
            setPage(1);
            setSelectedIds([]);
          }}
        />
        <ArchiveFilter
          value={archiveFilter}
          onValueChange={(value) => {
            setArchiveFilter(value);
            setPage(1);
          }}
          counts={archiveCounts}
          size="sm"
          aria-label="Archived records"
        />
      </div>

      <MatrxDataTable<KindRecordRow>
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={isLoading}
        isFetching={isFetching || busy}
        zebra
        pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
        className={cn(
          prefs.density === "compact" && "text-xs [&_td]:py-1 [&_th]:py-1",
        )}
        query={{
          mode: "controlled",
          totalItems: total,
          state: {
            page,
            pageSize: prefs.pageSize,
            search,
            anyOf: "",
            columnFilters,
            sort: { id: prefs.sort, direction: prefs.direction },
          },
          onStateChange: onTableState,
        }}
        toolbar={{
          search: true,
          searchPlaceholder: `Search ${label} records…`,
          facets: [
            {
              type: "button-group",
              id: "confirmation",
              label: "Standing",
              value: confirmation,
              defaultValue: "all",
              options: [
                { value: "all", label: "All" },
                {
                  value: "unconfirmed",
                  label: "Unconfirmed",
                  icon: <CircleDashed className="h-3.5 w-3.5" />,
                },
                {
                  value: "confirmed",
                  label: "Confirmed",
                  icon: <BadgeCheck className="h-3.5 w-3.5" />,
                },
              ],
              onChange: (value) => {
                if (value === "all" || value === "unconfirmed" || value === "confirmed") {
                  setConfirmation(value);
                  setPage(1);
                }
              },
            },
            {
              type: "button-group",
              id: "writer",
              label: "Written by",
              value: writer,
              defaultValue: "all",
              options: [
                { value: "all", label: "Anyone" },
                { value: "agent", label: "An agent" },
                { value: "person", label: "A person" },
              ],
              onChange: (value) => {
                if (value === "all" || value === "agent" || value === "person") {
                  setWriter(value);
                  setPage(1);
                }
              },
            },
          ],
        }}
        detail={{ enabled: false }}
        window={{ enabled: false }}
        edit={{ enabled: true, autoSave: true, onSave: saveEdits }}
        selection={{
          selectedIds,
          onSelectedIdsChange: setSelectedIds,
          noun: "record",
          actions: (selected, ids) => (
            <div className="flex items-center gap-2">
              {/* Absent, not greyed, when nothing in the selection needs it. */}
              {unconfirmedSelected.length > 0 ? (
                <Button
                  size="sm"
                  onClick={() =>
                    confirmMany(unconfirmedSelected.map((r) => r.id))
                  }
                  disabled={busy}
                >
                  <BadgeCheck className="mr-1.5 h-4 w-4" />
                  Confirm {unconfirmedSelected.length}
                </Button>
              ) : null}
              {liveSelected.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setArchived(liveSelected.map((r) => r.id), true)}
                  disabled={busy}
                >
                  <Archive className="mr-1.5 h-4 w-4" />
                  Archive {liveSelected.length}
                </Button>
              ) : null}
              {archivedSelected.length > 0 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setArchived(archivedSelected.map((r) => r.id), false)
                  }
                  disabled={busy}
                >
                  <ArchiveRestore className="mr-1.5 h-4 w-4" />
                  Restore {archivedSelected.length}
                </Button>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {selected.length === ids.length
                  ? "Archiving never confirms a record."
                  : "Some selected records are on other pages."}
              </span>
            </div>
          ),
        }}
        rowActions={(row) => (
          <div className="flex items-center justify-end gap-1">
            {row.confirmation === "unconfirmed" ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  confirmOne(row);
                }}
              >
                <Check className="mr-1 h-3.5 w-3.5" />
                Confirm
              </Button>
            ) : null}
            <ItemMenu config={() => menuFor(row)} align="end">
              <button
                type="button"
                aria-label={`Actions for ${row.title ?? "this record"}`}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </ItemMenu>
          </div>
        )}
        copy={{
          label: `${label} record`,
          listLabel: `${label} records`,
          location: `/shapes/${kind}/table`,
          rowKind: "content-ir-kind-instance",
          listKind: "content-ir-kind-instance-list",
          humanRow: (row) =>
            `${row.title ?? "Untitled"} — ${row.confirmation}${row.archivedAt ? ", archived" : ""}`,
          showRow: false,
          showToolbar: false,
        }}
        emptyState={
          error
            ? {
                icon: <AlertCircle className="h-5 w-5" />,
                title: "No records could be listed",
                description:
                  "The read failed, so nothing came back. This is not an empty result and no filter is hiding anything — the reason is above this list.",
              }
            : archiveFilter === "active" && archivedElsewhere > 0
              ? {
                  // A LIST MAY NOT SAY "NONE" WHILE ITS OWN DEFAULT IS HIDING
                  // ROWS. The archive counts are read for this exact query, so
                  // this number is what the door will actually reveal.
                  icon: <Archive className="h-5 w-5" />,
                  title: `All ${archivedElsewhere} ${label} record${archivedElsewhere === 1 ? " is" : "s are"} archived`,
                  description:
                    "Nothing is live under this scope and these filters. The archived ones are one click away.",
                  action: (
                    <Button size="sm" onClick={() => setArchiveFilter("archived")}>
                      <Archive className="mr-1.5 h-4 w-4" />
                      Show archived
                    </Button>
                  ),
                }
              : otherScope
                ? {
                    icon: <CircleDashed className="h-5 w-5" />,
                    title: `Nothing under this scope — ${otherScope.count} ${label} record${otherScope.count === 1 ? "" : "s"} in ${otherScope.label}`,
                    description: `This scope holds none of your ${label} records, but ${otherScope.label} does. Nothing is missing and nothing was lost — they are one click away.`,
                    action: (
                      <Button
                        size="sm"
                        onClick={() => {
                          scopeSettled.current = true;
                          setScope(makeScope(otherScope.kind));
                          setPage(1);
                          setSelectedIds([]);
                        }}
                      >
                        Show {otherScope.label}
                      </Button>
                    ),
                  }
                : {
                    icon: <CircleDashed className="h-5 w-5" />,
                    title: `No ${label} records here`,
                    description:
                      "Nothing matches this scope and these filters. Records land here when an agent produces one, or when you save one from the shape's Test tab.",
                  }
        }
      />

      <TextInputDialog
        open={unconfirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnconfirmTarget(null);
        }}
        title="Take the confirmation back"
        description={
          <span>
            This says nobody is standing behind “
            {unconfirmTarget?.title ?? "this record"}” any more. It needs an
            administrator, and the reason is stored with the record.
          </span>
        }
        placeholder="Why is this record no longer confirmed?"
        multiline
        rows={3}
        confirmLabel="Unconfirm"
        busy={busy}
        onConfirm={async (reason) => {
          const target = unconfirmTarget;
          if (!target) return;
          setUnconfirmTarget(null);
          await runDoor(
            "Unconfirm",
            () => unconfirmRecords([target.id], reason),
            () => "The confirmation was taken back.",
            1,
          );
        }}
      />
    </div>
  );
}
