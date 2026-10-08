"use client";

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
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
import { Input } from "@ai-matrx/design-system/controls";
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
import { ProTextarea } from "@/components/official/ProTextarea";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { StaleDataNotice } from "@ai-matrx/design-system";

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
  const [searchError, setSearchError] = useState<unknown>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      searchTopics(q)
        .then((r) => {
          if (cancelled) return;
          setRows(r.filter((x) => !exclude.has(x.id)));
          setSearchError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setSearchError(e ?? new Error("The topic search failed"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, exclude, searchAttempt]);
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input adornment="start" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the topic tree…" autoFocus />
      </div>
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {loading && rows.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-muted-foreground">Searching…</li>
        ) : searchError && rows.length === 0 ? (
          <li>
            <ReadFailure
              error={searchError}
              what="the topic tree"
              onRetry={() => setSearchAttempt((n) => n + 1)}
              className="m-1.5"
            />
          </li>
        ) : rows.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-muted-foreground">No topics match.</li>
        ) : (
          <>
            {/* Stale-while-error: the earlier results stay, labelled as possibly out of date. */}
            {searchError ? (
              <li>
                <StaleDataNotice
                  hasData
                  what="the topic search"
                  detail={extractErrorMessage(searchError)}
                  onRetry={() => setSearchAttempt((n) => n + 1)}
                  className="m-1.5"
                />
              </li>
            ) : null}
            {rows.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onPick(t)} className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60">
                  <span className="truncate text-foreground">{t.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {t.node_type ? humanizeIdentifier(t.node_type) : ""}
                  </span>
                </button>
              </li>
            ))}
          </>
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
            <Button variant="quiet" onClick={() => setD({ ...d, topic: null })}>
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
          <Input value={d.weight} onChange={(e) => setD({ ...d, weight: e.target.value })} inputMode="decimal" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Lead quality</span>
          <Select value={d.lead_quality} onValueChange={(v) => setD({ ...d, lead_quality: v })}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {LEAD_QUALITIES.map((v) => (
                <SelectItem key={v} value={v}>
                  {humanizeIdentifier(v) || v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-muted-foreground">Service match</span>
          <Select value={d.offering_match} onValueChange={(v) => setD({ ...d, offering_match: v })}>
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {SERVICE_MATCHES.map((v) => (
                <SelectItem key={v} value={v}>
                  {humanizeIdentifier(v) || v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <ProTextarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Why this topic is worth this much to the industry" className="min-h-14 text-sm" />
      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button icon={save.isPending ? <Loader2 className="animate-spin" /> : null} variant="primary" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
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
    <div className="matrx-touch-targets space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs text-muted-foreground"
          title="Children inherit a parent's worth; value each topic as high in the tree as it holds true."
        >
          {detail.topics.length} topics valued
        </p>
        {canAuthor ? (
          <Button icon={<Plus />} variant="outline" onClick={() => setAdding(true)} disabled={adding}> Add topic
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
                      {t.lead_quality ? (
                        <Badge variant="outline" className="text-[10px]">
                          {humanizeIdentifier(t.lead_quality) || t.lead_quality}
                        </Badge>
                      ) : null}
                      {t.offering_match ? (
                        <Badge variant="outline" className="text-[10px]">
                          {humanizeIdentifier(t.offering_match) || t.offering_match}
                        </Badge>
                      ) : null}
                    </div>
                    {t.notes ? <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">{t.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">{t.weight ?? "—"}</span>
                    {canAuthor ? (
                      <>
                        <Button icon={<Pencil />} variant="quiet" className="opacity-100 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditingId(t.item_id)} aria-label={`Edit ${t.name}`} />
                        <Button icon={<Trash2 />} variant="quiet" className="opacity-100 transition-opacity [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setDeleteTarget(t)} aria-label={`Remove ${t.name}`} />
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
