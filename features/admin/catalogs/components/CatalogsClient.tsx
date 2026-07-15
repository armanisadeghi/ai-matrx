"use client";

// features/admin/catalogs/components/CatalogsClient.tsx
//
// /administration/catalogs — Remote Catalogs manager (the app-config sibling
// for catalog-shaped data: models, LoRAs, presets, prompts, voices…).
// Landing = app selector + kind-grouped dashboard with entry counts →
// kind table → entry editor (generic + kind-aware). "Add from link" resolves
// any HuggingFace/Civitai URL via aidream into a prefilled entry.
// Cross-repo system-of-record: common-docs/remote-catalogs/FEATURE.md

import { useState } from "react";
import { ChevronRight, LibraryBig, Link2, MonitorCog, Plus } from "lucide-react";

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
import { createClient } from "@/utils/supabase/client";
import Link from "next/link";
import { AddFromLinkDialog } from "@/features/admin/catalogs/components/AddFromLinkDialog";
import { CatalogEntryEditor } from "@/features/admin/catalogs/components/CatalogEntryEditor";
import { CatalogKindTable } from "@/features/admin/catalogs/components/CatalogKindTable";
import {
  CATALOG_KINDS,
  DEFAULT_CATALOG_APP,
  kindLabel,
} from "@/features/admin/catalogs/schemas";
import type {
  CatalogEntryRow,
  EntryPrefill,
} from "@/features/admin/catalogs/types";

interface CatalogsClientProps {
  initialRows: CatalogEntryRow[];
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

export function CatalogsClient({ initialRows }: CatalogsClientProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<CatalogEntryRow[]>(() =>
    sortRows(initialRows),
  );
  const [app, setApp] = useState<string>(DEFAULT_CATALOG_APP);
  const [view, setView] = useState<View>({ mode: "kinds" });
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDialogKind, setLinkDialogKind] = useState<string | null>(null);

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

  if (view.mode === "edit" || view.mode === "new") {
    const row =
      view.mode === "edit"
        ? (rows.find((r) => r.id === view.entryId) ?? null)
        : null;
    return (
      <div className="mx-auto w-full max-w-5xl p-4">
        <CatalogEntryEditor
          key={view.mode === "edit" ? view.entryId : `new-${view.kind}`}
          app={app}
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
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
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
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LibraryBig className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-base font-semibold">Remote Catalogs</h1>
            <p className="text-xs text-muted-foreground">
              DB-backed catalogs for shipped clients — models, LoRAs, presets,
              prompts, voices. Active entries are read by every installed copy
              in the field.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href="/administration/app-config">
              <MonitorCog className="mr-1.5 h-4 w-4" /> App Config
            </Link>
          </Button>
          <Select value={app} onValueChange={setApp}>
            <SelectTrigger className="w-44 font-mono text-sm" aria-label="App">
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
          <Button type="button" size="sm" onClick={() => openAddFromLink(null)}>
            <Link2 className="mr-1.5 h-4 w-4" /> Add from link
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        {[...CATALOG_KINDS.map((k) => k.slug), ...extraKinds].map((slug) => {
          const kindRows = appRows.filter((r) => r.kind === slug);
          const active = kindRows.filter((r) => r.is_active).length;
          const inactive = kindRows.length - active;
          const def = CATALOG_KINDS.find((k) => k.slug === slug);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setView({ mode: "kind", kind: slug })}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{kindLabel(slug)}</span>
                  <code className="text-xs text-muted-foreground">{slug}</code>
                  {!def ? (
                    <Badge variant="outline" className="text-[10px]">
                      unregistered kind
                    </Badge>
                  ) : null}
                </div>
                {def ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {def.description}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {active > 0 ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  >
                    {active} active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    0 active
                  </Badge>
                )}
                {inactive > 0 ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    {inactive} inactive
                  </Badge>
                ) : null}
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Plus className="h-3.5 w-3.5" /> New entries start inactive — activate
        from the kind table once the payload validates and the artifact probes
        reachable.
      </p>

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
