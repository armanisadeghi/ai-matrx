"use client";

// features/admin/applications/catalogs/components/CatalogsClient.tsx
//
// /administration/catalogs — Remote Catalogs manager (the app-config sibling
// for catalog-shaped data: models, LoRAs, presets, prompts, voices…).
// Landing = app selector + kind-grouped dashboard with entry counts →
// kind table → entry editor (generic + kind-aware). "Add from link" resolves
// any HuggingFace/Civitai URL via aidream into a prefilled entry.
// Cross-repo system-of-record: common-docs/systems/remote-catalogs/FEATURE.md

import { useEffect, useMemo, useRef, useState } from "react";
import { LibraryBig, Link2, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { AddFromLinkDialog } from "@/features/admin/applications/catalogs/components/AddFromLinkDialog";
import { CatalogEntryEditor } from "@/features/admin/applications/catalogs/components/CatalogEntryEditor";
import { CatalogKindTable } from "@/features/admin/applications/catalogs/components/CatalogKindTable";
import {
  CATALOG_KINDS,
  DEFAULT_CATALOG_APP,
  kindLabel,
} from "@/features/admin/applications/catalogs/schemas";
import type {
  CatalogEntryRow,
  EntryPrefill,
} from "@/features/admin/applications/catalogs/types";

interface CatalogsClientProps {
  initialRows: CatalogEntryRow[];
  /** Deep-link: application to select. Defaults to DEFAULT_CATALOG_APP. */
  initialApp?: string;
  /** Deep-link: open this kind's entry table instead of the kind dashboard. */
  initialKind?: string;
  /** Deep-link: open this entry's editor (needs `initialKind`). */
  initialEntryId?: string;
}

/**
 * Landing view for a deep link. `?kind=` opens that kind's table, `?entry=`
 * opens one entry's editor — THE DOOR LAW: a surface that names a catalog entry
 * (the applications history timeline) must be able to open exactly that entry,
 * not just drop the operator on the tab.
 */
function initialView(
  kind: string | undefined,
  entryId: string | undefined,
  rows: CatalogEntryRow[],
): View {
  // `?entry=` alone is a complete instruction — the row knows its own kind, so
  // requiring the caller to also pass `?kind=` would silently drop the deep
  // link on the dashboard and never open the record it names.
  //
  // When BOTH are present the ROW wins: `?kind=` is a caller's claim, the row's
  // own `kind` is the fact. A stale or hand-edited link that disagrees would
  // otherwise open the right entry under the wrong kind, and `view.kind` is what
  // drives Back and post-delete routing — dropping the operator on a table the
  // entry was never in. Falling back to `?kind=` still covers the case the row
  // isn't in this page's `rows` yet.
  const rowKind = entryId
    ? rows.find((r) => r.id === entryId)?.kind
    : undefined;
  const resolvedKind = rowKind ?? kind;
  if (resolvedKind && entryId)
    return { mode: "edit", kind: resolvedKind, entryId };
  if (resolvedKind) return { mode: "kind", kind: resolvedKind };
  return { mode: "kinds" };
}

type View =
  | { mode: "kinds" }
  | { mode: "kind"; kind: string }
  | { mode: "edit"; kind: string; entryId: string }
  | { mode: "new"; kind: string; prefill: EntryPrefill | null };

function sortRows(rows: CatalogEntryRow[]): CatalogEntryRow[] {
  return [...rows].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.sort_order - b.sort_order ||
      a.key.localeCompare(b.key),
  );
}

export function CatalogsClient({
  initialRows,
  initialApp,
  initialKind,
  initialEntryId,
}: CatalogsClientProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CatalogEntryRow[]>(() =>
    sortRows(initialRows),
  );
  const [app, setApp] = useState<string>(initialApp ?? DEFAULT_CATALOG_APP);
  const [view, setView] = useState<View>(() =>
    initialView(initialKind, initialEntryId, initialRows),
  );
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogKind, setLinkDialogKind] = useState<string | null>(null);

  // A client-side navigation to a NEW ?app=&kind=&entry= re-renders this same
  // instance with new props, so seeding state once would leave the operator
  // looking at the previous entry while the address bar names another. Re-seed
  // whenever the link identity changes.
  const deepLinkKey = `${initialApp ?? ""}|${initialKind ?? ""}|${initialEntryId ?? ""}`;
  const lastDeepLink = useRef(deepLinkKey);
  useEffect(() => {
    if (lastDeepLink.current === deepLinkKey) return;
    lastDeepLink.current = deepLinkKey;
    if (initialApp) setApp(initialApp);
    setView(initialView(initialKind, initialEntryId, rows));
  }, [deepLinkKey, initialApp, initialKind, initialEntryId, rows]);

  // Distinct apps present in the table + the default app.
  const apps = Array.from(
    new Set([DEFAULT_CATALOG_APP, ...rows.map((r) => r.app)]),
  ).sort((a, b) => a.localeCompare(b));

  const appRows = rows.filter((r) => r.app === app);

  const refreshRows = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("catalog_entries")
      .select("*")
      .order("app")
      .order("kind")
      .order("sort_order")
      .order("key");
    if (error) {
      toast({
        title: "Failed to refresh catalog entries",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setRows(sortRows(data ?? []));
  };

  const handleSaved = (saved: CatalogEntryRow) => {
    setRows((prev) =>
      sortRows([...prev.filter((r) => r.id !== saved.id), saved]),
    );
    setView({ mode: "edit", kind: saved.kind, entryId: saved.id });
    // Re-select from the table so the list reflects exactly what's live.
    void refreshRows();
  };

  const openAddFromLink = (kind: string | null) => {
    setLinkDialogKind(kind);
    setLinkDialogOpen(true);
  };

  const handleLinkPick = (prefill: EntryPrefill) => {
    setView({ mode: "new", kind: prefill.kind, prefill });
  };

  // Kinds shown on the dashboard: the registry order, plus any unknown kinds
  // that exist in the data (forward compat — never hide real rows).
  const knownSlugs = new Set(CATALOG_KINDS.map((k) => k.slug));
  const extraKinds = Array.from(
    new Set(appRows.map((r) => r.kind).filter((k) => !knownSlugs.has(k))),
  ).sort((a, b) => a.localeCompare(b));

  // One row per kind: the registry order, plus any unregistered kinds present
  // in the data (forward compat — never hide real rows).
  const kindRows = useMemo(
    () =>
      [...CATALOG_KINDS.map((k) => k.slug), ...extraKinds].map((slug) => {
        const entries = appRows.filter((r) => r.kind === slug);
        const active = entries.filter((r) => r.is_active).length;
        const def = CATALOG_KINDS.find((k) => k.slug === slug);
        return {
          slug,
          label: kindLabel(slug),
          description: def?.description ?? "",
          registered: Boolean(def),
          total: entries.length,
          active,
          inactive: entries.length - active,
        };
      }),
    [appRows, extraKinds],
  );

  type KindRow = (typeof kindRows)[number];

  const kindColumns: MatrxColumnDef<KindRow>[] = [
    {
      id: "label",
      accessorKey: "label",
      header: "Kind",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.label}</span>
          {!row.registered ? (
            <Badge variant="outline" className="text-[10px]">
              unregistered
            </Badge>
          ) : null}
        </div>
      ),
      width: 220,
    },
    {
      id: "slug",
      accessorKey: "slug",
      header: "Slug",
      cell: (row) => <code className="text-xs">{row.slug}</code>,
      width: 180,
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      cell: (row) => (
        <span
          className="block max-w-2xl truncate text-xs text-muted-foreground"
          title={row.description}
        >
          {row.description || "—"}
        </span>
      ),
    },
    {
      id: "total",
      accessorKey: "total",
      header: "Entries",
      align: "right",
      cell: (row) => <span className="font-mono text-xs">{row.total}</span>,
      width: 90,
    },
    {
      id: "active",
      accessorKey: "active",
      header: "Active",
      align: "right",
      cell: (row) =>
        row.active > 0 ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          >
            {row.active}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            0
          </Badge>
        ),
      width: 90,
    },
    {
      id: "inactive",
      accessorKey: "inactive",
      header: "Inactive",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.inactive}
        </span>
      ),
      width: 90,
    },
  ];

  if (view.mode === "edit" || view.mode === "new") {
    // Resolve within the SELECTED APPLICATION, never across all rows. `rows`
    // holds every application's entries, so an id-only lookup would happily
    // open another application's entry — and `CatalogEntryEditor` saves with
    // the URL's `app`, so `admin_upsert_catalog_entry` would then rewrite that
    // record under the wrong application namespace. Scoping the find is what
    // turns that into the honest "belongs to another application" alert below.
    const row =
      view.mode === "edit"
        ? (appRows.find((r) => r.id === view.entryId) ?? null)
        : null;
    // A deep link can name an entry that was deleted, or that belongs to
    // another application. Say so — silently rendering the blank "new entry"
    // editor would claim we opened a record we never found.
    if (view.mode === "edit" && !row) {
      return (
        <div className="flex h-full flex-col gap-3 p-4">
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                No <code className="font-mono">{kindLabel(view.kind)}</code>{" "}
                entry <code className="font-mono">{view.entryId}</code> under{" "}
                <code className="font-mono">{app}</code> — it may have been
                deleted, or it belongs to another application.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setView({ mode: "kind", kind: view.kind })}
              >
                Show all {kindLabel(view.kind)} entries
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    return (
      <div className="h-full overflow-y-auto p-4">
        <CatalogEntryEditor
          key={view.mode === "edit" ? view.entryId : `new-${view.kind}`}
          // The ROW's own app wins when editing — the save must never be able
          // to disagree with the record being edited, whatever the URL says.
          app={row?.app ?? app}
          row={row}
          prefill={view.mode === "new" ? view.prefill : null}
          initialKind={view.kind}
          onBack={() => setView({ mode: "kind", kind: view.kind })}
          onSaved={handleSaved}
          onDeleted={() => {
            setView({ mode: "kind", kind: view.kind });
            void refreshRows();
          }}
        />
        <AddFromLinkDialog
          key={`link-${linkDialogKind ?? "auto"}`}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          defaultKind={linkDialogKind}
          onPick={handleLinkPick}
        />
      </div>
    );
  }

  if (view.mode === "kind") {
    const kindEntries = appRows.filter((r) => r.kind === view.kind);
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <CatalogKindTable
          app={app}
          kind={view.kind}
          entries={kindEntries}
          onBack={() => setView({ mode: "kinds" })}
          onOpenEntry={(row) =>
            setView({ mode: "edit", kind: row.kind, entryId: row.id })
          }
          onNewEntry={() =>
            setView({ mode: "new", kind: view.kind, prefill: null })
          }
          onAddFromLink={() => openAddFromLink(view.kind)}
          onChanged={() => void refreshRows()}
        />
        <AddFromLinkDialog
          key={`link-${linkDialogKind ?? "auto"}`}
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          defaultKind={linkDialogKind}
          onPick={handleLinkPick}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <LibraryBig className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-base font-semibold">Catalogs</h1>
          <p className="text-xs text-muted-foreground">
            DB-backed catalogs for shipped clients — models, LoRAs, presets,
            prompts, voices. Active entries are read by every installed copy in
            the field. New entries start inactive.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={kindRows}
          columns={kindColumns}
          getRowId={(row) => row.slug}
          pageSize={25}
          emptyState={{
            icon: <LibraryBig className="h-5 w-5" />,
            title: "No catalog kinds",
            description: "No kinds match your filters.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search kind, slug…",
            leading: (
              <Select value={app} onValueChange={setApp}>
                <SelectTrigger
                  className="w-44 font-mono text-sm"
                  aria-label="Application"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {apps.map((slug) => (
                    <SelectItem key={slug} value={slug} className="font-mono">
                      {slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
            actions: (
              <Button
                type="button"
                size="sm"
                onClick={() => openAddFromLink(null)}
              >
                <Link2 className="mr-1.5 h-4 w-4" /> Add from link
              </Button>
            ),
          }}
          onRowOpen={(row) => setView({ mode: "kind", kind: row.slug })}
          detail={{ enabled: false }}
          copy={{
            label: "Catalog kind",
            listLabel: "Catalog kinds (this view)",
            location: `${APPLICATIONS_ADMIN_LOCATION}/catalogs`,
            rowKind: "catalog_kind",
            listKind: "catalog_kinds",
            rowDescription: "One catalog kind with its entry counts.",
            listDescription: "Catalog kinds currently visible.",
            humanRow: (row) =>
              `${row.label} (${row.slug}) — ${row.total} entries, ${row.active} active, ${row.inactive} inactive`,
            rowAttributes: (row) => ({
              slug: row.slug,
              total: row.total,
              active: row.active,
            }),
            listAttributes: (visible, all) => ({
              app,
              kinds_visible: visible.length,
              kinds_total: all.length,
              entries_total: appRows.length,
            }),
          }}
          rowActions={(row) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setView({ mode: "kind", kind: row.slug });
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Entries
            </Button>
          )}
        />
      </div>

      <AddFromLinkDialog
        key={`link-${linkDialogKind ?? "auto"}`}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        defaultKind={linkDialogKind}
        onPick={handleLinkPick}
      />
    </div>
  );
}
