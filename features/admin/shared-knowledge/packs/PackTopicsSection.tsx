"use client";

// features/admin/shared-knowledge/packs/PackTopicsSection.tsx
//
// The pack's topic-tree slice WITH WORTH: each row is a seo.topic node and the
// starting weight / lead quality / service match a typical business in this
// industry would give it (copied onto seo.site_topic_value on adoption). The
// topic tree itself is platform data (Topic Assigner / admin); this section
// only picks nodes and values them. One RPC per save (starter_pack_item_save).

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { StarterPackTopicItem } from "@/features/marketing/seo/value-system/types";
import {
  deletePackItem,
  savePackItem,
  searchTopics,
  LEAD_QUALITIES,
  SERVICE_MATCHES,
  type AdminPackDetail,
  type TopicOption,
} from "./data";

const NONE = "__none__";

interface TopicDraft {
  id?: string;
  topic: { id: string; name: string; slug: string } | null;
  weight: string;
  lead_quality: string;
  offering_match: string;
  notes: string;
}

function toDraft(t?: StarterPackTopicItem): TopicDraft {
  return {
    id: t?.item_id,
    topic: t ? { id: t.topic_id, name: t.name, slug: t.slug } : null,
    weight: t?.weight === null || t?.weight === undefined ? "" : String(t.weight),
    lead_quality: t?.lead_quality ?? NONE,
    offering_match: t?.offering_match ?? NONE,
    notes: t?.notes ?? "",
  };
}

function TopicPicker({ onPick, exclude }: { onPick: (t: TopicOption) => void; exclude: Set<string> }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TopicOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchTopics(q)
        .then((r) => {
          if (!cancelled) setRows(r.filter((x) => !exclude.has(x.id)));
        })
        .catch((e) => toast.error(extractErrorMessage(e)))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, exclude]);
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the topic tree…" className="h-8 pl-7 text-sm" autoFocus />
      </div>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {loading && rows.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-muted-foreground">Searching…</li>
        ) : rows.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-muted-foreground">No topics match.</li>
        ) : (
          rows.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onPick(t)} className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60">
                <span className="truncate text-foreground">{t.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {t.slug}
                  {t.node_type ? ` · ${t.node_type}` : ""}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function TopicEditor({
  packId,
  initial,
  exclude,
  onDone,
}: {
  packId: string;
  initial: TopicDraft;
  exclude: Set<string>;
  onDone: (saved: boolean) => void;
}) {
  const [d, setD] = useState<TopicDraft>(initial);
  const weight = d.weight.trim() === "" ? null : Number(d.weight);
  const weightOk = weight === null || (Number.isFinite(weight) && weight >= 0 && weight <= 100);
  const valid = Boolean(d.topic) && weightOk;
  const save = useMutation({
    mutationFn: () =>
      savePackItem({
        id: d.id,
        pack_id: packId,
        item_kind: "topic",
        topic_id: d.topic?.id ?? null,
        weight,
        lead_quality: d.lead_quality === NONE ? null : d.lead_quality,
        offering_match: d.offering_match === NONE ? null : d.offering_match,
        notes: d.notes.trim() || null,
      }),
    onSuccess: () => onDone(true),
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      {d.topic ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-foreground">{d.topic.name}</span>
          {!d.id ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setD({ ...d, topic: null })}>
              change
            </Button>
          ) : null}
        </div>
      ) : (
        <TopicPicker exclude={exclude} onPick={(t) => setD({ ...d, topic: { id: t.id, name: t.name, slug: t.slug } })} />
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Weight 0–100 (set as high in the tree as it is true)</span>
          <Input value={d.weight} onChange={(e) => setD({ ...d, weight: e.target.value })} inputMode="decimal" className="h-8 text-sm tabular-nums" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Lead quality</span>
          <Select value={d.lead_quality} onValueChange={(v) => setD({ ...d, lead_quality: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {LEAD_QUALITIES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Service match</span>
          <Select value={d.offering_match} onValueChange={(v) => setD({ ...d, offering_match: v })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {SERVICE_MATCHES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="The expert's own words — why this topic is worth this much to this industry" className="min-h-14 text-sm" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save topic worth
        </Button>
      </div>
    </div>
  );
}

export function PackTopicsSection({ detail, onChanged }: { detail: AdminPackDetail; onChanged: () => Promise<void> }) {
  const canAuthor = detail.pack.can_author;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StarterPackTopicItem | null>(null);
  const exclude = new Set(detail.topics.map((t) => t.topic_id));
  const del = useMutation({
    mutationFn: (id: string) => deletePackItem(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Topic removed from the pack");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {detail.topics.length} topics valued. Children inherit a parent&apos;s worth; value as high in the tree as it is true.
        </p>
        {canAuthor ? (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="mr-1 size-3.5" /> Add topic
          </Button>
        ) : null}
      </div>
      {adding ? (
        <TopicEditor
          packId={detail.pack.id}
          initial={toDraft()}
          exclude={exclude}
          onDone={async (saved) => {
            setAdding(false);
            if (saved) {
              toast.success("Topic added");
              await onChanged();
            }
          }}
        />
      ) : null}
      {detail.topics.length === 0 && !adding ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          No topic worth yet — adopters start from the platform tree with no industry opinion.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.topics.map((t) =>
            editingId === t.item_id ? (
              <li key={t.item_id}>
                <TopicEditor
                  packId={detail.pack.id}
                  initial={toDraft(t)}
                  exclude={exclude}
                  onDone={async (saved) => {
                    setEditingId(null);
                    if (saved) {
                      toast.success("Topic saved");
                      await onChanged();
                    }
                  }}
                />
              </li>
            ) : (
              <li key={t.item_id} className="group rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{t.slug}</span>
                      {t.lead_quality ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t.lead_quality.replace(/_/g, " ")}
                        </Badge>
                      ) : null}
                      {t.offering_match ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t.offering_match.replace(/_/g, " ")}
                        </Badge>
                      ) : null}
                    </div>
                    {t.notes ? <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">{t.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{t.weight ?? "—"}</span>
                    {canAuthor ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditingId(t.item_id)} aria-label={`Edit ${t.name}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setDeleteTarget(t)} aria-label={`Remove ${t.name}`}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Remove this topic from the pack?"
        description={deleteTarget ? `“${deleteTarget.name}” will no longer be proposed to new adopters. Sites that already adopted it keep their own row.` : undefined}
        variant="destructive"
        confirmLabel="Remove"
        busy={del.isPending}
        onConfirm={() => {
          if (deleteTarget) del.mutate(deleteTarget.item_id);
        }}
      />
    </div>
  );
}
