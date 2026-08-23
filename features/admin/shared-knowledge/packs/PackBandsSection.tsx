"use client";

// features/admin/shared-knowledge/packs/PackBandsSection.tsx
//
// The pack's VOCABULARIES — value bands (min_score thresholds), geo bands
// (multipliers; 0 = the business cannot serve it) — and its geo-area
// ARCHETYPES (label · kind · band, NEVER a specific city: adopters fill in
// their own places, the adopt step demands them). Each row is one
// seo.starter_pack_item; saves go through starter_pack_item_save.
//
// ⚠️ CONTENT SHAPE IS MID-FLIP (convergence C8, ratified 2026-08-23). This editor edits the
// shape a pack carries TODAY (template `keyword_class_rule` rows / `site_vocabulary` bands),
// which is what `library_subscribe` still copies onto a site — so it is real and correct now.
// The convergence re-shapes pack content into dimension values + matchers + worth
// (/projects/keyword-intelligence-convergence/PLAN.md, phase C8, unblocked since C1 landed).
// When C8 runs: re-point this section at the C4 Dimensions editor's components — do NOT fork a
// second editor for the same machinery (P22).

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Layers, Loader2, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type {
  StarterPackBandItem,
  StarterPackGeoAreaItem,
} from "@/features/marketing/seo/value-system/types";
import {
  deletePackItem,
  savePackItem,
  AREA_KINDS,
  type AdminPackDetail,
  type PackItemKind,
} from "./data";

type BandKind = "value_band" | "geo_band";

interface BandDraft {
  id?: string;
  value: string;
  label: string;
  description: string;
  number: string; // min_score for value bands, multiplier for geo bands
  sort: string;
  notes: string;
}

function bandDraft(kind: BandKind, b?: StarterPackBandItem): BandDraft {
  const n = kind === "value_band" ? b?.config?.min_score : b?.config?.multiplier;
  return {
    id: b?.item_id,
    value: b?.value ?? "",
    label: b?.label ?? "",
    description: b?.description ?? "",
    number: n === undefined || n === null ? "" : String(n),
    sort: b?.sort === undefined ? "" : String(b.sort),
    notes: b?.notes ?? "",
  };
}

function BandEditor({
  packId,
  kind,
  initial,
  onDone,
}: {
  packId: string;
  kind: BandKind;
  initial: BandDraft;
  onDone: (saved: boolean) => void;
}) {
  const [d, setD] = useState(initial);
  const num = d.number.trim() === "" ? null : Number(d.number);
  const numOk = num !== null && Number.isFinite(num) && num >= 0 && (kind === "value_band" ? num <= 100 : true);
  const valid = d.value.trim().length > 0 && d.label.trim().length > 0 && numOk;
  const save = useMutation({
    mutationFn: () =>
      savePackItem({
        id: d.id,
        pack_id: packId,
        item_kind: kind,
        value: d.value.trim().toLowerCase().replace(/\s+/g, "-"),
        label: d.label.trim(),
        description: d.description.trim() || null,
        config: kind === "value_band" ? { min_score: num } : { multiplier: num },
        sort: d.sort.trim() === "" ? 0 : Number(d.sort),
        notes: d.notes.trim() || null,
      }),
    onSuccess: () => onDone(true),
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_5rem]">
        <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Label (Platinum)" className="h-8 text-sm" />
        <Input value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} placeholder="machine value (platinum)" className="h-8 font-mono text-xs" disabled={Boolean(d.id)} />
        <Input value={d.number} onChange={(e) => setD({ ...d, number: e.target.value })} placeholder={kind === "value_band" ? "min score" : "× multiplier"} inputMode="decimal" className="h-8 text-sm tabular-nums" />
        <Input value={d.sort} onChange={(e) => setD({ ...d, sort: e.target.value })} placeholder="sort" inputMode="numeric" className="h-8 text-sm tabular-nums" />
      </div>
      <Input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What lands here, in plain words" className="h-8 text-sm" />
      <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Why this industry reads the band this way" className="min-h-12 text-sm" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save band
        </Button>
      </div>
    </div>
  );
}

interface AreaDraft {
  id?: string;
  label: string;
  area_kind: string;
  geo_band: string;
  notes: string;
  sort: string;
}

function areaDraft(a?: StarterPackGeoAreaItem): AreaDraft {
  return {
    id: a?.item_id,
    label: a?.label ?? "",
    area_kind: a?.area_kind ?? "city",
    geo_band: a?.geo_band ?? "",
    notes: a?.notes ?? "",
    sort: a?.sort === undefined ? "" : String(a.sort),
  };
}

function AreaEditor({
  packId,
  geoBands,
  initial,
  onDone,
}: {
  packId: string;
  geoBands: StarterPackBandItem[];
  initial: AreaDraft;
  onDone: (saved: boolean) => void;
}) {
  const [d, setD] = useState(initial);
  const valid = d.label.trim().length > 0 && d.geo_band.trim().length > 0;
  const save = useMutation({
    mutationFn: () =>
      savePackItem({
        id: d.id,
        pack_id: packId,
        item_kind: "geo_area",
        label: d.label.trim(),
        area_kind: d.area_kind,
        geo_band: d.geo_band,
        match_tokens: [],
        sort: d.sort.trim() === "" ? 0 : Number(d.sort),
        notes: d.notes.trim() || null,
      }),
    onSuccess: () => onDone(true),
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_minmax(0,1fr)_5rem]">
        <Input value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Archetype label (Primary service radius)" className="h-8 text-sm" />
        <Select value={d.area_kind} onValueChange={(v) => setD({ ...d, area_kind: v })}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AREA_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {geoBands.length > 0 ? (
          <Select value={d.geo_band} onValueChange={(v) => setD({ ...d, geo_band: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="geo band" />
            </SelectTrigger>
            <SelectContent>
              {geoBands.map((b) => (
                <SelectItem key={b.item_id} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={d.geo_band} onChange={(e) => setD({ ...d, geo_band: e.target.value })} placeholder="geo band value" className="h-8 font-mono text-xs" />
        )}
        <Input value={d.sort} onChange={(e) => setD({ ...d, sort: e.target.value })} placeholder="sort" inputMode="numeric" className="h-8 text-sm tabular-nums" />
      </div>
      <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="What this archetype stands for — the adopter fills in their own places" className="min-h-12 text-sm" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save archetype
        </Button>
      </div>
    </div>
  );
}

function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center">
      <Button size="sm" variant="ghost" className="h-7 px-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={onEdit} aria-label={`Edit ${label}`}>
        <Pencil className="size-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" onClick={onDelete} aria-label={`Remove ${label}`}>
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function PackBandsSection({ detail, onChanged }: { detail: AdminPackDetail; onChanged: () => Promise<void> }) {
  const canAuthor = detail.pack.can_author;
  const [editing, setEditing] = useState<{ kind: PackItemKind; id: string } | null>(null);
  const [adding, setAdding] = useState<PackItemKind | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => deletePackItem(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Removed from the pack");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  const done = (what: string) => async (saved: boolean) => {
    setEditing(null);
    setAdding(null);
    if (saved) {
      toast.success(`${what} saved`);
      await onChanged();
    }
  };

  const bandBlock = (kind: BandKind, title: string, hint: string, rows: StarterPackBandItem[]) => (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Layers className="size-3.5 text-muted-foreground" aria-hidden /> {title}
          </h3>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
        {canAuthor ? (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding(kind)} disabled={adding === kind}>
            <Plus className="mr-1 size-3.5" /> Add
          </Button>
        ) : null}
      </div>
      {adding === kind ? <BandEditor packId={detail.pack.id} kind={kind} initial={bandDraft(kind)} onDone={done("Band")} /> : null}
      {rows.length === 0 && adding !== kind ? (
        <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Uses the platform defaults.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((b) =>
            editing?.kind === kind && editing.id === b.item_id ? (
              <li key={b.item_id}>
                <BandEditor packId={detail.pack.id} kind={kind} initial={bandDraft(kind, b)} onDone={done("Band")} />
              </li>
            ) : (
              <li key={b.item_id} className="group flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {b.label} <span className="font-mono text-[10px] text-muted-foreground">{b.value}</span>
                  </p>
                  {b.description ? <p className="text-[11px] text-muted-foreground">{b.description}</p> : null}
                  {b.notes ? <p className="text-[11px] italic text-muted-foreground">{b.notes}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-sm tabular-nums text-foreground">
                    {kind === "value_band"
                      ? b.config?.min_score === undefined || b.config?.min_score === null
                        ? "guard only"
                        : `${String(b.config.min_score)}+`
                      : `×${String(b.config?.multiplier ?? 1)}`}
                  </span>
                  {canAuthor ? <RowActions label={b.label} onEdit={() => setEditing({ kind, id: b.item_id })} onDelete={() => setDeleteTarget({ id: b.item_id, label: b.label })} /> : null}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      {bandBlock("value_band", "Value bands", "The vocabulary this industry scores into. min_score = the lowest computed score that lands in the band; they must not collide.", detail.value_bands)}
      {bandBlock("geo_band", "Geo bands", "How far from home still counts. ×0 means the business cannot serve that traffic at all.", detail.geo_bands)}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MapPinned className="size-3.5 text-muted-foreground" aria-hidden /> Geo-area archetypes
            </h3>
            <p className="text-[11px] text-muted-foreground">Placeholders like “Primary service radius” — never a specific city. Adopters fill in their places; the adopt step demands them.</p>
          </div>
          {canAuthor ? (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding("geo_area")} disabled={adding === "geo_area"}>
              <Plus className="mr-1 size-3.5" /> Add
            </Button>
          ) : null}
        </div>
        {adding === "geo_area" ? <AreaEditor packId={detail.pack.id} geoBands={detail.geo_bands} initial={areaDraft()} onDone={done("Archetype")} /> : null}
        {detail.geo_areas.length === 0 && adding !== "geo_area" ? (
          <p className="rounded-md border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">No archetypes — adopters get no geo areas from this pack.</p>
        ) : (
          <ul className="space-y-1">
            {detail.geo_areas.map((a) =>
              editing?.kind === "geo_area" && editing.id === a.item_id ? (
                <li key={a.item_id}>
                  <AreaEditor packId={detail.pack.id} geoBands={detail.geo_bands} initial={areaDraft(a)} onDone={done("Archetype")} />
                </li>
              ) : (
                <li key={a.item_id} className="group flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {a.label} <span className="text-[10px] text-muted-foreground">· {a.area_kind ?? "city"} · band {a.geo_band}</span>
                    </p>
                    {a.notes ? <p className="text-[11px] italic text-muted-foreground">{a.notes}</p> : null}
                  </div>
                  {canAuthor ? <RowActions label={a.label} onEdit={() => setEditing({ kind: "geo_area", id: a.item_id })} onDelete={() => setDeleteTarget({ id: a.item_id, label: a.label })} /> : null}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove from the pack?"
        description={deleteTarget ? `“${deleteTarget.label}” will no longer be proposed to new adopters. Sites that already adopted it keep their own row.` : undefined}
        variant="destructive"
        confirmLabel="Remove"
        busy={del.isPending}
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
