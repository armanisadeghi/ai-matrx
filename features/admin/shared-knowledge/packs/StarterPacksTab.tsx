"use client";

// features/admin/shared-knowledge/packs/StarterPacksTab.tsx
//
// The Starter packs tab of the Shared Knowledge console — packs ARE Library
// resources (Arman, 2026-08-22: "this system can't be sitting off on its own").
// Master/detail: the pack list on the left (name · industry · status · version ·
// subscribers), the selected pack on the right (PackDetail). Top actions:
// New pack (empty draft) and Propose from sample sites (the proposer agent via
// its mandate). Reference model: GitHub Releases' draft → publish → versions
// lifecycle inside a Linear-density list.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, Layers, ListChecks, Package, Plus, Search, TreePine, Users } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { StarterPackSummary } from "@/features/marketing/seo/value-system/types";
import type { SharedKnowledgeDirectory } from "../types";
import {
  adminPacksQueryKey,
  fetchAdminPackCatalog,
  savePack,
  PACK_STATUS_META,
  type PackStatus,
} from "./data";
import { PackDetail } from "./PackDetail";
import { ProposePackDialog } from "./ProposePackDialog";

const STATUS_ORDER: Record<string, number> = { draft: 0, proposed: 1, ratified: 2, retired: 3 };

function PackRow({
  pack,
  selected,
  onSelect,
}: {
  pack: StarterPackSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const meta = PACK_STATUS_META[(pack.status as PackStatus) ?? "draft"] ?? PACK_STATUS_META.draft;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-md border px-3 py-2 text-left transition-colors",
        selected ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{pack.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {pack.industry_name ?? (pack.industry_id ? "Industry" : "Every industry")}
            {" · v"}
            {pack.pack_version}
          </p>
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-[10px]", meta.tone)}>
          {meta.label}
        </Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ListChecks className="size-3" aria-hidden />
          {pack.rule_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <TreePine className="size-3" aria-hidden />
          {pack.topic_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="size-3" aria-hidden />
          {pack.value_band_count + pack.geo_band_count}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users className="size-3" aria-hidden />
          {pack.subscriber_count}
        </span>
      </div>
    </button>
  );
}

export function StarterPacksTab({ directory }: { directory: SharedKnowledgeDirectory }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [proposeOpen, setProposeOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const catalog = useQuery({
    queryKey: adminPacksQueryKey,
    queryFn: ({ signal }) => fetchAdminPackCatalog(signal),
  });

  const packs = useMemo(() => {
    const rows = [...(catalog.data ?? [])];
    rows.sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        a.name.localeCompare(b.name),
    );
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.industry_name ?? "").toLowerCase().includes(needle) ||
        p.slug.includes(needle),
    );
  }, [catalog.data, filter]);

  const activeId = selectedId ?? packs[0]?.id ?? null;

  const onNewPack = async () => {
    setCreating(true);
    try {
      const created = await savePack({
        name: "Untitled pack",
        industry: "",
        geo_model: "national",
      });
      await queryClient.invalidateQueries({ queryKey: adminPacksQueryKey });
      setSelectedId(created.id);
      toast.success("Draft pack created — name it and pick its industry.");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
      {/* Left: the pack list */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter packs…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={onNewPack} disabled={creating}>
            <Plus className="mr-1 size-3.5" /> New
          </Button>
          <Button size="sm" className="h-8 shrink-0" onClick={() => setProposeOpen(true)}>
            <BrainCircuit className="mr-1 size-3.5" /> Propose
          </Button>
        </div>

        {catalog.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : catalog.isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {extractErrorMessage(catalog.error)}
          </div>
        ) : packs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-1 size-5" aria-hidden />
            No packs yet. Propose one from real sample sites, or start an empty draft.
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {packs.map((p) => (
              <li key={p.id}>
                <PackRow pack={p} selected={p.id === activeId} onSelect={() => setSelectedId(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: the selected pack */}
      <div className="min-h-0 min-w-0">
        {activeId ? (
          <PackDetail
            key={activeId}
            packId={activeId}
            directory={directory}
            onSelectPack={(id) => setSelectedId(id)}
          />
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-10 text-center text-sm text-muted-foreground">
            Select a pack to author, ratify, and publish it.
          </div>
        )}
      </div>

      <ProposePackDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        onProposed={async (pack) => {
          await queryClient.invalidateQueries({ queryKey: adminPacksQueryKey });
          setSelectedId(pack.id);
        }}
      />
    </div>
  );
}
