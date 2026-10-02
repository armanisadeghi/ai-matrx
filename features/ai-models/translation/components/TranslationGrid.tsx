"use client";

/**
 * Settings translation grid — the owner's review screen for how every model
 * setting translates onto every model.
 *
 * Rows: settings, grouped by setting family. Columns: settings profiles and
 * wire APIs, ordered by modality. The default view is "Needs you" — only
 * proposed, conflicting or rejected cells and missing ones; rows and columns
 * with nothing to show are hidden (the BatchGrid attention pattern), so decided
 * things stay out of the way. Contracts: common-docs/projects/settings-translation
 * CONTRACTS.md K3 (cell), K4 (states), K5 (the one merge).
 */

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ai-matrx/design-system";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { cn } from "@/lib/utils";
import { readTranslationBundle } from "../data";
import {
  MODALITY_LABEL,
  MODALITY_ORDER,
  TAB_LABEL,
  buildGrid,
  inTab,
  summarizeRule,
  tabCounts,
  visibleSlice,
  type GridCell,
  type GridColumn,
  type GridRow,
  type GridTab,
  type Modality,
} from "../model";
import type { TranslationCellRow, TranslationOffering } from "../types";
import { CellStateBadge, ConflictBadge } from "./CellStateBadge";
import TranslationCellEditor, { type EditorTarget } from "./TranslationCellEditor";

export const TRANSLATION_GRID_QUERY_KEY = ["ai-models", "translation-grid"] as const;
const TABS: readonly GridTab[] = ["needs", "agent", "inherited", "all"];

function readTab(v: string | null): GridTab {
  return v === "agent" || v === "inherited" || v === "all" ? v : "needs";
}

function readModality(v: string | null): Modality | "all" {
  return (MODALITY_ORDER as readonly string[]).includes(v ?? "") ? (v as Modality) : "all";
}

function targetFor(gc: GridCell): EditorTarget {
  const column = gc.column;
  const overridden = new Set(gc.overrides.map((o) => o.offering.id));
  return {
    layer: column.kind,
    ownerId: column.ownerId,
    ownerLabel: column.label,
    settingKey: gc.key,
    cell: gc.cell,
    initialRule: gc.cell ? undefined : gc.fallback?.rule,
    covers: gc.cell ? gc.covers : column.members.filter((m) => !overridden.has(m.id)),
    fallbackLabel: column.kind === "profile" && gc.fallback ? "The API rule" : "The computed default",
    overrides: gc.overrides,
  };
}

function overrideTarget(
  column: GridColumn,
  key: string,
  o: { offering: TranslationOffering; cell: TranslationCellRow },
): EditorTarget {
  return {
    layer: "offering",
    ownerId: o.offering.id,
    ownerLabel: o.offering.model_name,
    settingKey: key,
    cell: o.cell,
    covers: [o.offering],
    fallbackLabel: `The ${column.label} rule`,
    overrides: [],
  };
}

function MembersDialog({ column, onClose }: { column: GridColumn; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{column.label}</DialogTitle>
        </DialogHeader>
        {column.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No available models.</p>
        ) : (
          <ul className="max-h-80 space-y-0.5 overflow-y-auto text-sm">
            {column.members.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate">{m.model_name}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{m.provider_model_id}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ColumnHeader({ column }: { column: GridColumn }) {
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {MODALITY_LABEL[column.modality]}
        {column.kind === "profile" ? " · profile" : ""}
      </span>
      <span className="truncate text-xs font-medium">{column.label}</span>
      <span className="text-[11px] font-normal normal-case text-muted-foreground">
        {column.members.length === 1 ? "1 model" : `${column.members.length} models`}
      </span>
    </div>
  );
}

function CellView({ gc, onOpen }: { gc: GridCell; onOpen: () => void }) {
  const cell = gc.cell;
  const rule = cell?.rule ?? gc.fallback?.rule;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60",
        gc.status === "missing" && !cell && "border border-dashed border-rose-500/40",
      )}
    >
      <span className="flex max-w-full flex-wrap items-center gap-1">
        {gc.status ? <CellStateBadge status={cell ? cell.state : "missing"} /> : null}
        {cell?.conflict ? <ConflictBadge kind="conflict" /> : null}
        {cell?.rejection_fingerprint ? <ConflictBadge kind="rejection" /> : null}
        {cell?.confidence != null ? (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {Math.round(cell.confidence * 100)}%
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate font-mono text-[11px] text-muted-foreground">
        {[
          rule ? summarizeRule(rule) : null,
          !rule && gc.missing.length > 0 ? (gc.missing.length === 1 ? "1 model" : `${gc.missing.length} models`) : null,
          !cell && gc.fallback ? "API" : null,
          gc.overrides.length > 0 ? `${gc.overrides.length} own` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </button>
  );
}

export default function TranslationGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const tab = readTab(searchParams.get("tab"));
  const modality = readModality(searchParams.get("modality"));
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [membersOf, setMembersOf] = useState<GridColumn | null>(null);
  const isMobile = useIsMobile();

  const query = useQuery({
    queryKey: TRANSLATION_GRID_QUERY_KEY,
    queryFn: readTranslationBundle,
    staleTime: 30_000,
  });

  const setParam = (name: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(name);
    else next.set(name, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (query.data?.status === "absent") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Translation tables are not on this database yet.
      </div>
    );
  }

  const model = query.data?.status === "ready" ? buildGrid(query.data.bundle) : null;
  const counts = model ? tabCounts(model) : { needs: 0, agent: 0, inherited: 0, all: 0 };
  const slice = model ? visibleSlice(model, tab, modality, "") : { columns: [], rows: [] };

  const columns: MatrxColumnDef<GridRow>[] = [
    {
      id: "setting",
      accessorFn: (r) => r.key,
      header: "Setting",
      label: "Setting",
      width: "12rem",
      sortable: true,
      cell: (r) => (
        <span className="block truncate font-mono text-xs font-medium" title={r.key}>
          {r.key}
        </span>
      ),
    },
    {
      id: "family",
      accessorFn: (r) => r.family,
      header: "Family",
      label: "Family",
      width: "7rem",
      sortable: true,
      filter: "select",
      cell: (r) => <span className="block truncate text-xs text-muted-foreground">{r.family}</span>,
    },
    ...slice.columns.map(
      (column): MatrxColumnDef<GridRow> => ({
        id: column.id,
        header: <ColumnHeader column={column} />,
        label: column.label,
        width: "10rem",
        headerMenu: [
          {
            id: "models",
            label: column.members.length === 1 ? "Show 1 model" : `Show ${column.members.length} models`,
            onSelect: () => setMembersOf(column),
          },
        ],
        accessorFn: (r) => r.cells.get(column.id)?.status ?? "",
        cell: (r) => {
          const gc = r.cells.get(column.id);
          if (!gc || !inTab(gc, tab)) return null;
          return <CellView gc={gc} onOpen={() => setTarget(targetFor(gc))} />;
        },
      }),
    ),
  ];

  const setTab = (v: string) => setParam("tab", v === "needs" ? null : v);
  const tabControl = isMobile ? (
    <Select value={tab} onValueChange={setTab}>
      <SelectTrigger className="h-8 w-44 text-xs" aria-label="View">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TABS.map((t) => (
          <SelectItem key={t} value={t}>
            {TAB_LABEL[t]} · {counts[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <SegmentedControl
      size="sm"
      value={tab}
      onValueChange={setTab}
      data={TABS.map((t) => ({
        value: t,
        label: (
          <span className="flex items-center gap-1 whitespace-nowrap">
            {TAB_LABEL[t]}
            <span className="tabular-nums text-muted-foreground">{counts[t]}</span>
          </span>
        ),
      }))}
    />
  );

  const modalityControl = (
    <Select value={modality} onValueChange={(v) => setParam("modality", v === "all" ? null : v)}>
      <SelectTrigger className="h-8 w-32 text-xs" aria-label="Modality">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All modalities</SelectItem>
        {MODALITY_ORDER.map((m) => (
          <SelectItem key={m} value={m}>
            {MODALITY_LABEL[m]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const editorSetting = target ? model?.settingByKey.get(target.settingKey) : undefined;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: TRANSLATION_GRID_QUERY_KEY });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MatrxDataTable<GridRow>
        data={slice.rows}
        columns={columns}
        getRowId={(r) => r.key}
        tableId="ai-models/translation-grid"
        searchText={(r) => `${r.key} ${r.family}`}
        isLoading={query.isLoading}
        read={{
          status: query.isLoading ? "loading" : query.error ? "error" : "ready",
          error: query.error,
          onRetry: () => void query.refetch(),
          what: "settings translation",
        }}
        toolbar={{
          title: "Settings translation",
          leading: tabControl,
          actions: modalityControl,
          search: true,
          searchPlaceholder: "Setting",
          refresh: { onRefresh: async () => { await query.refetch(); } },
        }}
        grouping={{ columnId: "family", rowNoun: "setting" }}
        defaultSort={null}
        pageSize={100}
        stickyHeader
        detail={{ enabled: false }}
        emptyState={{ title: tab === "needs" ? "Nothing needs you." : "Nothing here." }}
        mobileCards={(r) => (
          <div className="space-y-1.5 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-sm font-medium">{r.key}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{r.family}</span>
            </div>
            {slice.columns.map((column) => {
              const gc = r.cells.get(column.id);
              if (!gc || !inTab(gc, tab)) return null;
              return (
                <div key={column.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 truncate text-xs text-muted-foreground">{column.label}</span>
                  <div className="min-w-0 flex-1">
                    <CellView gc={gc} onOpen={() => setTarget(targetFor(gc))} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      />
      {membersOf ? <MembersDialog column={membersOf} onClose={() => setMembersOf(null)} /> : null}
      {target ? (
        <TranslationCellEditor
          key={`${target.layer}:${target.ownerId}:${target.settingKey}`}
          target={target}
          setting={editorSetting}
          onClose={() => setTarget(null)}
          onChanged={refresh}
          onOpenOverride={(o) => {
            const column = model?.columns.find((c) => c.members.some((m) => m.id === o.offering.id));
            if (column) setTarget(overrideTarget(column, target.settingKey, o));
          }}
        />
      ) : null}
    </div>
  );
}
