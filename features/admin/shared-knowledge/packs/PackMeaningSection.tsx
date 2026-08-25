"use client";

// features/admin/shared-knowledge/packs/PackMeaningSection.tsx
//
// What a pack CARRIES, in the stamp system's own shape (KI-030 / convergence C8):
// one row per dimension VALUE, with the text matchers that stamp it and what it
// is worth. This replaced the template-rule editor when pack content flipped —
// there is no second shape any more, and no `keyword_class_rule` behind a pack.
//
// The worth vocabulary is KI-001's: "what it is" values ADD ±points around the
// 100 baseline; only relative qualifiers (free, cheap, DIY) carry a ×factor;
// `never` is the flag that ends the arithmetic. A value with no worth at all is
// a LABEL — the traffic-class rows are like that, and they ship switched off so
// adopting a pack can never silently re-class somebody's corpus.
//
// One RPC per save (seo.starter_pack_item_save) — the same door every other
// pack item uses. Do NOT fork a second editor for this machinery (P22).

import { useState } from "react";
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
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  describeMatcher,
  shortWorth,
  worthIsDemotion,
} from "@/features/marketing/seo/value-system/lib";
import type {
  StarterPackMatcher,
  StarterPackMeaningItem,
} from "@/features/marketing/seo/value-system/types";
import {
  deletePackItem,
  savePackItem,
  MATCH_KINDS,
  type AdminPackDetail,
} from "./data";

const WORTH_NONE = "__label__";

function worthTone(item: StarterPackMeaningItem) {
  if (item.worth_effect === null) return "text-muted-foreground";
  return worthIsDemotion(item.worth_effect, item.worth_amount)
    ? "text-red-600 dark:text-red-400"
    : "text-emerald-600 dark:text-emerald-400";
}

interface MeaningDraft {
  id?: string;
  dimension_scope: "platform" | "site";
  dimension_slug: string;
  dimension_label: string;
  value: string;
  label: string;
  description: string;
  notes: string;
  worth_effect: string;
  worth_amount: string;
  matchers: StarterPackMatcher[];
}

function toDraft(m?: StarterPackMeaningItem): MeaningDraft {
  return {
    id: m?.item_id,
    dimension_scope: m?.dimension_scope ?? "site",
    dimension_slug: m?.dimension_slug ?? "qualifiers",
    dimension_label: m?.dimension_label ?? "Qualifiers",
    value: m?.value ?? "",
    label: m?.label ?? "",
    description: m?.description ?? "",
    notes: m?.notes ?? "",
    worth_effect: m?.worth_effect ?? WORTH_NONE,
    worth_amount:
      m?.worth_amount === null || m?.worth_amount === undefined ? "" : String(m.worth_amount),
    matchers: m?.matchers ? [...m.matchers] : [],
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function MeaningEditor({
  packId,
  initial,
  onDone,
}: {
  packId: string;
  initial: MeaningDraft;
  onDone: (saved: boolean) => void;
}) {
  const [d, setD] = useState<MeaningDraft>(initial);
  const [phrase, setPhrase] = useState("");
  const [phraseKind, setPhraseKind] = useState("contains");

  const amount = d.worth_amount.trim() === "" ? null : Number(d.worth_amount);
  const amountOk =
    d.worth_effect === WORTH_NONE || d.worth_effect === "never"
      ? true
      : amount !== null &&
        Number.isFinite(amount) &&
        (d.worth_effect === "add" || (amount >= 0.05 && amount <= 5));
  const valid =
    d.label.trim().length > 0 &&
    d.value.trim().length > 0 &&
    d.dimension_slug.trim().length > 0 &&
    amountOk;

  const addPhrase = () => {
    const p = phrase.trim().toLowerCase();
    if (!p) return;
    if (d.matchers.some((m) => m.kind === phraseKind && m.pattern === p)) {
      setPhrase("");
      return;
    }
    setD({
      ...d,
      matchers: [
        ...d.matchers,
        { kind: phraseKind as StarterPackMatcher["kind"], pattern: p, enabled: true },
      ],
    });
    setPhrase("");
  };

  const save = useMutation({
    mutationFn: () =>
      savePackItem({
        id: d.id,
        pack_id: packId,
        item_kind: "meaning",
        dimension_scope: d.dimension_scope,
        dimension_slug: d.dimension_slug.trim(),
        dimension_label: d.dimension_label.trim() || null,
        value: d.value.trim(),
        label: d.label.trim(),
        description: d.description.trim() || null,
        notes: d.notes.trim() || null,
        worth_effect: d.worth_effect === WORTH_NONE ? null : d.worth_effect,
        worth_amount: d.worth_effect === WORTH_NONE || d.worth_effect === "never" ? null : amount,
        matchers: d.matchers,
      }),
    onSuccess: () => onDone(true),
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Input
          value={d.label}
          onChange={(e) =>
            setD({ ...d, label: e.target.value, value: d.id ? d.value : slugify(e.target.value) })
          }
          placeholder="What this answer is called (e.g. CRT equipment)"
          className="h-8 text-sm"
        />
        <div className="flex items-center gap-1.5">
          <Select value={d.worth_effect} onValueChange={(v) => setD({ ...d, worth_effect: v })}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="add">± points</SelectItem>
              <SelectItem value="scale">× factor</SelectItem>
              <SelectItem value="never">never</SelectItem>
              <SelectItem value={WORTH_NONE}>label only</SelectItem>
            </SelectContent>
          </Select>
          {d.worth_effect === "add" || d.worth_effect === "scale" ? (
            <Input
              value={d.worth_amount}
              onChange={(e) => setD({ ...d, worth_amount: e.target.value })}
              placeholder={d.worth_effect === "add" ? "e.g. 120 or -90" : "0.05 – 5"}
              inputMode="decimal"
              className={cn("h-8 text-sm tabular-nums", !amountOk && "border-destructive")}
            />
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={d.dimension_scope}
          onValueChange={(v) =>
            setD({
              ...d,
              dimension_scope: v as MeaningDraft["dimension_scope"],
              dimension_slug: v === "site" ? "qualifiers" : "audience_type",
              dimension_label: v === "site" ? "Qualifiers" : "Audience",
            })
          }
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="site">The site&apos;s own dimension</SelectItem>
            <SelectItem value="platform">A registry dimension</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={d.dimension_slug}
          onChange={(e) => setD({ ...d, dimension_slug: e.target.value })}
          placeholder={d.dimension_scope === "site" ? "qualifiers | geo" : "audience_type"}
          className="h-8 w-44 font-mono text-xs"
        />
        <span className="text-xs text-muted-foreground">is</span>
        <Input
          value={d.value}
          onChange={(e) => setD({ ...d, value: e.target.value })}
          placeholder="value slug, e.g. business"
          className="h-8 w-44 font-mono text-xs"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {d.dimension_scope === "platform"
          ? "A registry dimension is governed — a pack may score one of its values, never invent one. An unknown value is reported at adoption, not created."
          : "The site's own dimension is created on adoption under its standard key (qualifiers, geo), so every adopter gets their own copy."}
      </p>

      <div className="rounded-md border border-border bg-card p-2">
        <p className="mb-1.5 text-[11px] font-medium text-foreground">
          Phrases that spot it{" "}
          <span className="font-normal text-muted-foreground">
            — leave empty when the classifier already detects this fact and the pack only says
            what it is worth.
          </span>
        </p>
        {d.matchers.length > 0 ? (
          <ul className="mb-1.5 flex flex-wrap gap-1">
            {d.matchers.map((m, idx) => (
              <li
                key={`${m.kind}:${m.pattern}`}
                className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
              >
                <span className={cn(!m.enabled && "text-muted-foreground line-through")}>
                  {describeMatcher(m)}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setD({
                      ...d,
                      matchers: d.matchers.map((x, i) =>
                        i === idx ? { ...x, enabled: !x.enabled } : x,
                      ),
                    })
                  }
                  title={m.enabled ? "Ship this phrase switched off" : "Ship this phrase switched on"}
                >
                  {m.enabled ? "on" : "off"}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setD({ ...d, matchers: d.matchers.filter((_, i) => i !== idx) })}
                  aria-label={`Remove ${m.pattern}`}
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={phraseKind} onValueChange={setPhraseKind}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATCH_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {k.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addPhrase();
              }
            }}
            placeholder="phrase, e.g. data destruction"
            className="h-7 min-w-40 flex-1 font-mono text-xs"
          />
          <Button size="sm" variant="outline" className="h-7" onClick={addPhrase}>
            <Plus className="mr-1 size-3" /> Add phrase
          </Button>
        </div>
      </div>

      <Input
        value={d.description}
        onChange={(e) => setD({ ...d, description: e.target.value })}
        placeholder="What this catches, for a non-technical reader"
        className="h-8 text-sm"
      />
      <Textarea
        value={d.notes}
        onChange={(e) => setD({ ...d, notes: e.target.value })}
        placeholder="Why — the evidence or the expert ruling (this is what the business reads)"
        className="min-h-14 text-sm"
      />
      {!amountOk ? (
        <p className="text-[11px] text-destructive">
          {d.worth_effect === "scale"
            ? "A factor is between 0.05 and 5."
            : "Points need a number — positive to promote, negative to demote."}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save answer
        </Button>
      </div>
    </div>
  );
}

export function PackMeaningSection({
  detail,
  onChanged,
}: {
  detail: AdminPackDetail;
  onChanged: () => Promise<void>;
}) {
  const canAuthor = detail.pack.can_author;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StarterPackMeaningItem | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => deletePackItem(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Answer removed from the pack");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const promoters = detail.meaning.filter(
    (m) => m.worth_effect !== null && !worthIsDemotion(m.worth_effect, m.worth_amount),
  ).length;
  const demoters = detail.meaning.filter((m) =>
    worthIsDemotion(m.worth_effect, m.worth_amount),
  ).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {detail.meaning.length} answers ·{" "}
          <span className="text-emerald-600 dark:text-emerald-400">{promoters} promote</span> ·{" "}
          <span className="text-red-600 dark:text-red-400">{demoters} demote</span>. Points add to
          the 100 baseline; keep a × factor for relative words like &ldquo;free&rdquo;.
        </p>
        {canAuthor ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            <Plus className="mr-1 size-3.5" /> Add answer
          </Button>
        ) : null}
      </div>

      {adding ? (
        <MeaningEditor
          packId={detail.pack.id}
          initial={toDraft()}
          onDone={async (saved) => {
            setAdding(false);
            if (saved) {
              toast.success("Answer added");
              await onChanged();
            }
          }}
        />
      ) : null}

      {detail.meaning.length === 0 && !adding ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          This pack proposes no meaning yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.meaning.map((item) =>
            editingId === item.item_id ? (
              <li key={item.item_id}>
                <MeaningEditor
                  packId={detail.pack.id}
                  initial={toDraft(item)}
                  onDone={async (saved) => {
                    setEditingId(null);
                    if (saved) {
                      toast.success("Answer saved");
                      await onChanged();
                    }
                  }}
                />
              </li>
            ) : (
              <li
                key={item.item_id}
                className="group rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.dimension_label ?? item.dimension_slug}
                      </Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {item.matchers.length === 0
                          ? "already detected — worth only"
                          : item.matchers.map((m) => describeMatcher(m)).join(", ")}
                      </span>
                      {item.matchers.some((m) => !m.enabled) ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          ships off
                        </Badge>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    ) : null}
                    {item.notes ? (
                      <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">
                        {item.notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={cn("text-sm font-semibold tabular-nums", worthTone(item))}>
                      {shortWorth(item.worth_effect, item.worth_amount)}
                    </span>
                    {canAuthor ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setEditingId(item.item_id)}
                          aria-label={`Edit ${item.label}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setDeleteTarget(item)}
                          aria-label={`Remove ${item.label}`}
                        >
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
        title="Remove this answer from the pack?"
        description={
          deleteTarget
            ? `“${deleteTarget.label}” will no longer be proposed to new adopters. Sites that already adopted it keep their own copy.`
            : undefined
        }
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
