"use client";

/**
 * The "Needs you" queue: one decision per row — who it applies to, the setting
 * in words, what is proposed against what happens without it, how sure the
 * source is and why, then Approve / Change / Skip. Selected rows approve
 * together through one dialog that names how many rules and models it covers
 * (the honest bulk-approve pattern).
 */

import { useState } from "react";
import { Button } from "@ai-matrx/design-system";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { Check, Pencil, SkipForward } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { reloadAiCatalog } from "@/features/ai-models/catalogReload";
import { saveTranslationCell } from "../data";
import { plainRule, plainSetting, type QueueItem } from "../model";
import type { TranslationOffering } from "../types";
import { CellStateBadge, ConflictBadge } from "./CellStateBadge";

function modelsWord(n: number): string {
  return n === 1 ? "1 model" : `${n} models`;
}

function uniqueModels(items: QueueItem[]): TranslationOffering[] {
  const seen = new Map<string, TranslationOffering>();
  for (const item of items) for (const m of item.reach) seen.set(m.id, m);
  return [...seen.values()];
}

function KindBadge({ item }: { item: QueueItem }) {
  if (item.kind === "rejected") return <ConflictBadge kind="rejection" />;
  if (item.kind === "conflict") return <ConflictBadge kind="conflict" />;
  return <CellStateBadge status={item.kind === "missing" ? "missing" : "proposed"} />;
}

export default function NeedsYouQueue({
  items,
  isLoading,
  error,
  onRetry,
  onRefresh,
  onChanged,
  onOpen,
  onSkip,
  leading,
  actions,
  emptyTitle,
}: {
  items: QueueItem[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  onRefresh: () => Promise<void>;
  onChanged: () => void;
  onOpen: (item: QueueItem) => void;
  onSkip: (item: QueueItem) => void;
  leading: React.ReactNode;
  actions: React.ReactNode;
  emptyTitle: string;
}) {
  const dispatch = useAppDispatch();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pending, setPending] = useState<QueueItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = new Map(items.map((i) => [i.id, i]));
  const pendingModels = pending ? uniqueModels(pending) : [];

  const approve = async (batch: QueueItem[]) => {
    setBusy(true);
    let done = 0;
    try {
      for (const item of batch) {
        if (!item.cell) continue;
        await saveTranslationCell({
          layer: item.cell.layer,
          ownerId: item.cell.layer_owner_id,
          settingKey: item.cell.setting_key,
          rule: item.cell.rule,
        });
        done += 1;
      }
      const models = uniqueModels(batch).length;
      toast.success(done === 1 ? `Approved for ${modelsWord(models)}` : `${done} approved · ${modelsWord(models)}`);
      await dispatch(reloadAiCatalog());
    } catch (e) {
      toast.error(done > 0 ? `${done} approved, then stopped` : "Not approved", {
        description: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e),
      });
    } finally {
      setBusy(false);
      setPending(null);
      setSelectedIds([]);
      onChanged();
    }
  };

  // One rule reaching exactly one model approves on the click; anything wider asks first.
  const requestApprove = (batch: QueueItem[]) => {
    if (batch.length === 1 && batch[0].reach.length === 1) void approve(batch);
    else setPending(batch);
  };

  const columns: MatrxColumnDef<QueueItem>[] = [
    {
      id: "group",
      accessorFn: (r) => r.groupLabel,
      header: "Applies to",
      label: "Applies to",
      width: "9.5rem",
      sortable: true,
      cell: (r) => (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium" title={r.groupLabel}>
            {r.groupLabel}
          </span>
          <span className="text-xs text-muted-foreground">{modelsWord(r.reach.length)}</span>
        </div>
      ),
    },
    {
      id: "setting",
      accessorFn: (r) => plainSetting(r.key),
      header: "Setting",
      label: "Setting",
      width: "8.5rem",
      sortable: true,
      cell: (r) => (
        <div className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="truncate text-sm">{plainSetting(r.key)}</span>
          <KindBadge item={r} />
        </div>
      ),
    },
    {
      id: "proposed",
      accessorFn: (r) => (r.cell ? plainRule(r.cell.rule, r.key, r.setting) : ""),
      header: "Proposed",
      label: "Proposed",
      width: "15rem",
      cell: (r) => {
        const text = r.cell ? plainRule(r.cell.rule, r.key, r.setting) : "No rule yet";
        const without = r.without ? plainRule(r.without.rule, r.key, r.setting) : "the engine's guess";
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 text-sm" title={text}>
              {text}
            </span>
            <span className="truncate text-xs text-muted-foreground" title={without}>
              Without it: {without}
            </span>
          </div>
        );
      },
    },
    {
      id: "why",
      accessorFn: (r) => r.cell?.rationale ?? "",
      header: "Why",
      label: "Why",
      width: "11rem",
      cell: (r) => {
        const why = r.cell?.rationale ?? "";
        const sure = r.cell?.confidence != null ? `${Math.round(r.cell.confidence * 100)}% sure · ` : "";
        return (
          <span className="line-clamp-2 text-xs text-muted-foreground" title={why}>
            {sure ? <span className="font-medium text-foreground tabular-nums">{sure}</span> : null}
            {why || "—"}
          </span>
        );
      },
    },
    {
      id: "decide",
      header: "",
      label: "Decide",
      width: "9.5rem",
      cell: (r) => (
        <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
          {r.cell ? (
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 gap-1 whitespace-nowrap px-2 text-xs"
              disabled={busy}
              onClick={() => requestApprove([r])}
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={busy}
            aria-label={r.cell ? "Change" : "Write rule"}
            title={r.cell ? "Change" : "Write rule"}
            onClick={() => onOpen(r)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            disabled={busy}
            aria-label="Skip"
            title="Skip"
            onClick={() => onSkip(r)}
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <MatrxDataTable<QueueItem>
        data={items}
        columns={columns}
        getRowId={(r) => r.id}
        tableId="ai-models/translation-needs-you"
        searchText={(r) => `${r.groupLabel} ${plainSetting(r.key)} ${r.key}`}
        isLoading={isLoading}
        read={{
          status: isLoading ? "loading" : error ? "error" : "ready",
          error,
          onRetry,
          what: "settings translation",
        }}
        toolbar={{
          title: "Settings translation",
          leading,
          actions,
          search: true,
          searchPlaceholder: "Model or setting",
          refresh: { onRefresh },
        }}
        selection={{
          selectedIds,
          onSelectedIdsChange: setSelectedIds,
          isRowSelectable: (r) => r.cell != null,
          noun: "rule",
          actions: (_rows, ids) => {
            const batch = ids.map((id) => byId.get(id)).filter((i): i is QueueItem => !!i?.cell);
            if (batch.length === 0) return null;
            return (
              <Button type="button" size="sm" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setPending(batch)}>
                <Check className="h-3.5 w-3.5" />
                Approve {batch.length}
              </Button>
            );
          },
        }}
        copy={false}
        defaultSort={null}
        pageSize={50}
        stickyHeader
        detail={{ enabled: false }}
        emptyState={{ title: emptyTitle }}
        mobileCards={(r) => (
          <div className="space-y-1.5 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{plainSetting(r.key)}</span>
              <KindBadge item={r} />
            </div>
            <div className="text-xs text-muted-foreground">
              {r.groupLabel} · {modelsWord(r.reach.length)}
            </div>
            <div className="text-sm">{r.cell ? plainRule(r.cell.rule, r.key, r.setting) : "No rule yet"}</div>
            {r.cell?.rationale ? (
              <div className="line-clamp-2 text-xs text-muted-foreground">{r.cell.rationale}</div>
            ) : null}
            <div className="flex items-center gap-1 pt-1">
              {r.cell ? (
                <Button type="button" size="sm" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => requestApprove([r])}>
                  <Check className="h-3.5 w-3.5" />
                  Approve
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => onOpen(r)}>
                <Pencil className="h-3.5 w-3.5" />
                {r.cell ? "Change" : "Write rule"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => onSkip(r)}>
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </Button>
            </div>
          </div>
        )}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => (!open ? setPending(null) : undefined)}
        title={
          pending && pendingModels.length === 0
            ? "Reaches no models"
            : pending && pending.length === 1
              ? `Approve for ${modelsWord(pendingModels.length)}?`
              : `Approve ${pending?.length ?? 0} rules for ${modelsWord(pendingModels.length)}?`
        }
        description={
          pendingModels.length === 0
            ? "No model uses this rule today. Approve it anyway?"
            : "Every model below gets these rules on its next request."
        }
        content={
          pending ? (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border px-2 py-1.5 text-xs">
              {pending.length > 1
                ? pending.map((i) => (
                    <li key={i.id} className="truncate">
                      {plainSetting(i.key)} · {i.groupLabel} · {modelsWord(i.reach.length)}
                    </li>
                  ))
                : pendingModels.map((m) => (
                    <li key={m.id} className="truncate">
                      {m.model_name}
                    </li>
                  ))}
            </ul>
          ) : null
        }
        confirmLabel={pendingModels.length === 0 ? "Approve anyway" : `Approve · ${modelsWord(pendingModels.length)}`}
        busy={busy}
        onConfirm={() => (pending ? approve(pending) : undefined)}
      />
    </>
  );
}
