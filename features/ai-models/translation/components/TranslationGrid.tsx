"use client";

/**
 * Settings translation — the owner's review screen.
 *
 * Default view "Needs you": a queue, one decision per row (NeedsYouQueue).
 * "No rule yet": settings where the engine is guessing. "All": every rule for
 * ONE model group at a time (a settings profile or an API), never every column
 * at once. Contracts: common-docs/projects/settings-translation CONTRACTS.md.
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { readTranslationBundle } from "../data";
import {
  MODALITY_LABEL,
  MODALITY_ORDER,
  buildGrid,
  buildQueue,
  plainRule,
  plainSetting,
  type GridColumn,
  type GridRow,
  type QueueItem,
} from "../model";
import { CellStateBadge, ConflictBadge } from "./CellStateBadge";
import NeedsYouQueue from "./NeedsYouQueue";
import TranslationCellEditor, { type EditorTarget } from "./TranslationCellEditor";
import { overrideTarget, queueTarget, targetFor } from "./editorTargets";

export const TRANSLATION_GRID_QUERY_KEY = ["ai-models", "translation-grid"] as const;
type View = "needs" | "missing" | "all";
const VIEWS: readonly View[] = ["needs", "missing", "all"];
const VIEW_LABEL: Record<View, string> = { needs: "Needs you", missing: "No rule yet", all: "All" };
const SKIP_STORE = "ai-models/translation-skipped";

function readView(v: string | null): View {
  return v === "missing" || v === "all" ? v : "needs";
}

function readSkipped(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SKIP_STORE);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSkipped(ids: Set<string>) {
  try {
    window.sessionStorage.setItem(SKIP_STORE, JSON.stringify([...ids]));
  } catch {
    // per-viewer convenience only
  }
}

function GroupPicker({
  columns,
  value,
  onChange,
}: {
  columns: GridColumn[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-56 text-xs" aria-label="Model group">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODALITY_ORDER.map((m) => {
          const group = columns.filter((c) => c.modality === m);
          if (group.length === 0) return null;
          return (
            <SelectGroup key={m}>
              <SelectLabel>{MODALITY_LABEL[m]}</SelectLabel>
              {group.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} · {c.members.length}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export default function TranslationGrid() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const view = readView(searchParams.get("tab"));
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readSkipped(),
  );
  const isMobile = useIsMobile();

  const query = useQuery({
    queryKey: TRANSLATION_GRID_QUERY_KEY,
    queryFn: readTranslationBundle,
    staleTime: 30_000,
  });

  const bundle = query.data?.status === "ready" ? query.data.bundle : null;
  // The grid and queue are derived once per read, never on every keystroke or render.
  const model = useMemo(() => (bundle ? buildGrid(bundle) : null), [bundle]);
  const queue = useMemo(() => (bundle && model ? buildQueue(bundle, model) : []), [bundle, model]);

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

  const decisions = queue.filter((i) => i.kind !== "missing" && !skipped.has(i.id));
  const missing = queue.filter((i) => i.kind === "missing" && !skipped.has(i.id));
  const skippedCount = queue.filter((i) => skipped.has(i.id)).length;
  const counts: Record<View, number | null> = {
    needs: decisions.length,
    missing: missing.length,
    all: null,
  };

  const setView = (v: string) => setParam("tab", v === "needs" ? null : v);
  const viewControl = isMobile ? (
    <Select value={view} onValueChange={setView}>
      <SelectTrigger className="h-8 w-40 text-xs" aria-label="View">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VIEWS.map((v) => (
          <SelectItem key={v} value={v}>
            {VIEW_LABEL[v]}
            {counts[v] != null ? ` · ${counts[v]}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <SegmentedControl aria-label="View"
      value={view}
      onValueChange={setView}
      data={VIEWS.map((v) => ({
        value: v,
        label: (
          <span className="flex items-center gap-1 whitespace-nowrap">
            {VIEW_LABEL[v]}
            {counts[v] != null ? <span className="tabular-nums text-muted-foreground">{counts[v]}</span> : null}
          </span>
        ),
      }))}
    />
  );

  const skip = (item: QueueItem) => {
    const next = new Set(skipped);
    next.add(item.id);
    setSkipped(next);
    writeSkipped(next);
  };
  const unskipControl =
    skippedCount > 0 && view !== "all" ? (
      <Button
        type="button"
        variant="quiet"
        onClick={() => {
          setSkipped(new Set());
          writeSkipped(new Set());
        }}
      >
        Skipped · {skippedCount}
      </Button>
    ) : null;

  const refresh = () => void queryClient.invalidateQueries({ queryKey: TRANSLATION_GRID_QUERY_KEY });
  const editorSetting = target ? model?.settingByKey.get(target.settingKey) : undefined;

  // ── All: one model group at a time ──
  const groupId =
    model && model.columns.some((c) => c.id === searchParams.get("group"))
      ? (searchParams.get("group") as string)
      : (model?.columns[0]?.id ?? "");
  const group = model?.columns.find((c) => c.id === groupId) ?? null;
  const groupRows: GridRow[] = model && group ? model.rows.filter((r) => r.cells.has(group.id)) : [];

  const allColumns: MatrxColumnDef<GridRow>[] = [
    {
      id: "setting",
      accessorFn: (r) => plainSetting(r.key),
      header: "Setting",
      label: "Setting",
      width: "12rem",
      sortable: true,
      cell: (r) => <span className="block truncate text-sm">{plainSetting(r.key)}</span>,
    },
    {
      id: "family",
      accessorFn: (r) => r.family,
      header: "Family",
      label: "Family",
      width: "8rem",
      sortable: true,
      filter: "select",
      cell: (r) => <span className="block truncate text-xs text-muted-foreground">{r.family}</span>,
    },
    {
      id: "rule",
      accessorFn: (r) => {
        const gc = group ? r.cells.get(group.id) : undefined;
        return plainRule(gc?.cell?.rule ?? gc?.fallback?.rule, r.key, r.setting);
      },
      header: "Sends",
      label: "Sends",
      width: "22rem",
      cell: (r) => {
        const gc = group ? r.cells.get(group.id) : undefined;
        const text = plainRule(gc?.cell?.rule ?? gc?.fallback?.rule, r.key, r.setting);
        return (
          <span className="line-clamp-2 text-sm" title={text}>
            {text}
          </span>
        );
      },
    },
    {
      id: "state",
      accessorFn: (r) => {
        const gc = group ? r.cells.get(group.id) : undefined;
        return gc?.status ?? (gc?.fallback ? "api" : "");
      },
      header: "State",
      label: "State",
      width: "9rem",
      sortable: true,
      filter: "select",
      cell: (r) => {
        const gc = group ? r.cells.get(group.id) : undefined;
        if (!gc) return null;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {gc.status ? (
              <CellStateBadge status={gc.cell ? gc.cell.state : "missing"} />
            ) : (
              <span className="text-xs text-muted-foreground">From the API</span>
            )}
            {gc.cell?.conflict ? <ConflictBadge kind="conflict" /> : null}
            {gc.cell?.rejection_fingerprint ? <ConflictBadge kind="rejection" /> : null}
          </span>
        );
      },
    },
    {
      id: "own",
      accessorFn: (r) => (group ? (r.cells.get(group.id)?.overrides.length ?? 0) : 0),
      header: "Own rules",
      label: "Own rules",
      width: "7rem",
      cell: (r) => {
        const n = group ? (r.cells.get(group.id)?.overrides.length ?? 0) : 0;
        return n > 0 ? <span className="text-xs tabular-nums">{n === 1 ? "1 model" : `${n} models`}</span> : null;
      },
    },
  ];

  const searchControl = model ? (
    <GroupPicker columns={model.columns} value={groupId} onChange={(id) => setParam("group", id)} />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {view === "all" ? (
        <MatrxDataTable<GridRow>
          data={groupRows}
          columns={allColumns}
          getRowId={(r) => r.key}
          tableId="ai-models/translation-all"
          searchText={(r) => `${plainSetting(r.key)} ${r.key} ${r.family}`}
          isLoading={query.isLoading}
          read={{
            status: query.isLoading ? "loading" : query.error ? "error" : "ready",
            error: query.error,
            onRetry: () => void query.refetch(),
            what: "settings translation",
          }}
          toolbar={{
            title: "Settings translation",
            leading: viewControl,
            actions: searchControl,
            search: true,
            searchPlaceholder: "Setting",
            refresh: { onRefresh: async () => { await query.refetch(); } },
          }}
          selection={false}
          onRowOpen={(r) => {
            const gc = group ? r.cells.get(group.id) : undefined;
            if (gc) setTarget(targetFor(gc));
          }}
          defaultSort={null}
          pageSize={100}
          stickyHeader
          detail={{ enabled: false }}
          emptyState={{ title: "No rules for this group." }}
          mobileCards={(r) => {
            const gc = group ? r.cells.get(group.id) : undefined;
            return (
              <button
                type="button"
                className="w-full space-y-1 p-3 text-left"
                onClick={() => (gc ? setTarget(targetFor(gc)) : undefined)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{plainSetting(r.key)}</span>
                  {gc?.status ? <CellStateBadge status={gc.cell ? gc.cell.state : "missing"} /> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {plainRule(gc?.cell?.rule ?? gc?.fallback?.rule, r.key, r.setting)}
                </div>
              </button>
            );
          }}
        />
      ) : (
        <NeedsYouQueue
          items={view === "needs" ? decisions : missing}
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          onRefresh={async () => {
            await query.refetch();
          }}
          onChanged={refresh}
          onOpen={(item) => setTarget(queueTarget(item))}
          onSkip={skip}
          leading={viewControl}
          actions={unskipControl}
          emptyTitle={view === "needs" ? "Nothing needs you." : "Every setting has a rule."}
        />
      )}
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
