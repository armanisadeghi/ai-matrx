"use client";

// features/admin/shared-knowledge/packs/PackRulesSection.tsx
//
// The pack's qualifier / value rules — template rows in THE ONE rules engine
// (seo.keyword_class_rule, is_template + pack_id). A rule matches EITHER a text
// pattern (pattern + match_kind) OR one universal facet value; it carries a
// multiplier (<1 demotes, >1 promotes — they compound) and/or a target class,
// plus the expert's note (the rationale a business can argue with).
// Inline edit per row; one RPC per save (seo.starter_pack_rule_save).

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
import type { StarterPackRuleItem } from "@/features/marketing/seo/value-system/types";
import {
  deletePackRule,
  savePackRule,
  MATCH_KINDS,
  TARGET_CLASSES,
  type AdminPackDetail,
  type PackRulePatch,
} from "./data";

const NONE = "__none__";

function multiplierTone(m: number | null) {
  if (m === null) return "text-muted-foreground";
  if (m > 1) return "text-emerald-600 dark:text-emerald-400";
  if (m < 1) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function matchText(rule: StarterPackRuleItem) {
  if (rule.match_facet) return `${rule.match_facet.replace(/_/g, " ")} is ${rule.match_facet_value}`;
  if (!rule.pattern) return "—";
  const kind = rule.match_kind ?? "contains";
  const readable =
    kind === "word" ? "the word" : kind === "exact" ? "exactly" : kind === "starts_with" ? "starts with" : kind === "ends_with" ? "ends with" : "contains";
  return `${readable} “${rule.pattern}”`;
}

interface RuleDraft {
  id?: string;
  name: string;
  description: string;
  mode: "pattern" | "facet";
  pattern: string;
  match_kind: string;
  match_facet: string;
  match_facet_value: string;
  target_class: string;
  value_multiplier: string;
  notes: string;
}

function toDraft(r?: StarterPackRuleItem): RuleDraft {
  return {
    id: r?.rule_id,
    name: r?.name ?? "",
    description: r?.description ?? "",
    mode: r?.match_facet ? "facet" : "pattern",
    pattern: r?.pattern ?? "",
    match_kind: r?.match_kind ?? "contains",
    match_facet: r?.match_facet ?? "",
    match_facet_value: r?.match_facet_value ?? "",
    target_class: r?.target_class ?? NONE,
    value_multiplier: r?.value_multiplier === null || r?.value_multiplier === undefined ? "" : String(r.value_multiplier),
    notes: r?.notes ?? "",
  };
}

function RuleEditor({
  packId,
  initial,
  onDone,
}: {
  packId: string;
  initial: RuleDraft;
  onDone: (saved: boolean) => void;
}) {
  const [d, setD] = useState<RuleDraft>(initial);
  const mult = d.value_multiplier.trim() === "" ? null : Number(d.value_multiplier);
  const multOk = mult === null || (Number.isFinite(mult) && mult > 0 && mult <= 100);
  const matchOk = d.mode === "pattern" ? d.pattern.trim().length > 0 : d.match_facet.trim().length > 0 && d.match_facet_value.trim().length > 0;
  const effectOk = mult !== null || d.target_class !== NONE;
  const valid = d.name.trim().length > 0 && matchOk && multOk && effectOk;

  const save = useMutation({
    mutationFn: () => {
      const patch: PackRulePatch = {
        id: d.id,
        pack_id: packId,
        name: d.name.trim(),
        description: d.description.trim() || null,
        pattern: d.mode === "pattern" ? d.pattern.trim() : null,
        match_kind: d.mode === "pattern" ? d.match_kind : null,
        match_facet: d.mode === "facet" ? d.match_facet.trim() : null,
        match_facet_value: d.mode === "facet" ? d.match_facet_value.trim() : null,
        target_class: d.target_class === NONE ? null : d.target_class,
        value_multiplier: mult,
        notes: d.notes.trim() || null,
      };
      return savePackRule(patch);
    },
    onSuccess: () => onDone(true),
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Rule name (e.g. Consumer CRT / TV signals)" className="h-8 text-sm" />
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">×</span>
          <Input
            value={d.value_multiplier}
            onChange={(e) => setD({ ...d, value_multiplier: e.target.value })}
            placeholder="multiplier (0–100)"
            inputMode="decimal"
            className={cn("h-8 text-sm tabular-nums", !multOk && "border-destructive")}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={d.mode} onValueChange={(v) => setD({ ...d, mode: v as RuleDraft["mode"] })}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pattern">Text pattern</SelectItem>
            <SelectItem value="facet">Universal facet</SelectItem>
          </SelectContent>
        </Select>
        {d.mode === "pattern" ? (
          <>
            <Select value={d.match_kind} onValueChange={(v) => setD({ ...d, match_kind: v })}>
              <SelectTrigger className="h-8 w-32 text-xs">
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
            <Input value={d.pattern} onChange={(e) => setD({ ...d, pattern: e.target.value })} placeholder="pattern, e.g. crt" className="h-8 min-w-40 flex-1 font-mono text-xs" />
          </>
        ) : (
          <>
            <Input value={d.match_facet} onChange={(e) => setD({ ...d, match_facet: e.target.value })} placeholder="facet, e.g. audience_type" className="h-8 w-44 font-mono text-xs" />
            <span className="text-xs text-muted-foreground">is</span>
            <Input value={d.match_facet_value} onChange={(e) => setD({ ...d, match_facet_value: e.target.value })} placeholder="value, e.g. business" className="h-8 w-40 font-mono text-xs" />
          </>
        )}
        <Select value={d.target_class} onValueChange={(v) => setD({ ...d, target_class: v })}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="class (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>no class</SelectItem>
            {TARGET_CLASSES.map((c) => (
              <SelectItem key={c} value={c}>
                → {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Input value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What this catches, for a non-technical reader" className="h-8 text-sm" />
      <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Why — the evidence or the expert ruling (this is what the business reads)" className="min-h-14 text-sm" />
      {!effectOk ? <p className="text-[11px] text-destructive">A rule needs a multiplier, a class, or both.</p> : null}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => onDone(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
          {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save rule
        </Button>
      </div>
    </div>
  );
}

export function PackRulesSection({
  detail,
  onChanged,
}: {
  detail: AdminPackDetail;
  onChanged: () => Promise<void>;
}) {
  const canAuthor = detail.pack.can_author;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StarterPackRuleItem | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => deletePackRule(id),
    onSuccess: async () => {
      setDeleteTarget(null);
      toast.success("Rule removed from the pack");
      await onChanged();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const promoters = detail.rules.filter((r) => (r.value_multiplier ?? 1) > 1).length;
  const demoters = detail.rules.filter((r) => r.value_multiplier !== null && r.value_multiplier < 1).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {detail.rules.length} rules · <span className="text-emerald-600 dark:text-emerald-400">{promoters} promote</span> ·{" "}
          <span className="text-red-600 dark:text-red-400">{demoters} demote</span>. Multipliers compound — keep each one modest and defensible.
        </p>
        {canAuthor ? (
          <Button size="sm" variant="outline" className="h-7" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="mr-1 size-3.5" /> Add rule
          </Button>
        ) : null}
      </div>

      {adding ? (
        <RuleEditor
          packId={detail.pack.id}
          initial={toDraft()}
          onDone={async (saved) => {
            setAdding(false);
            if (saved) {
              toast.success("Rule added");
              await onChanged();
            }
          }}
        />
      ) : null}

      {detail.rules.length === 0 && !adding ? (
        <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          This pack proposes no rules yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.rules.map((rule) =>
            editingId === rule.rule_id ? (
              <li key={rule.rule_id}>
                <RuleEditor
                  packId={detail.pack.id}
                  initial={toDraft(rule)}
                  onDone={async (saved) => {
                    setEditingId(null);
                    if (saved) {
                      toast.success("Rule saved");
                      await onChanged();
                    }
                  }}
                />
              </li>
            ) : (
              <li key={rule.rule_id} className="group rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">{rule.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{matchText(rule)}</span>
                      {rule.target_class ? (
                        <Badge variant="outline" className="text-[10px]">
                          → {rule.target_class}
                        </Badge>
                      ) : null}
                    </div>
                    {rule.description ? <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p> : null}
                    {rule.notes ? <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">{rule.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className={cn("text-sm font-semibold tabular-nums", multiplierTone(rule.value_multiplier))}>
                      {rule.value_multiplier === null ? "—" : `×${rule.value_multiplier}`}
                    </span>
                    {canAuthor ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setEditingId(rule.rule_id)} aria-label={`Edit ${rule.name}`}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100" onClick={() => setDeleteTarget(rule)} aria-label={`Remove ${rule.name}`}>
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
        title="Remove this rule from the pack?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” will no longer be proposed to new adopters. Sites that already adopted it keep their own copy.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Remove"
        busy={del.isPending}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.rule_id)}
      />
      <span className="sr-only">
        <X className="size-3" aria-hidden />
      </span>
    </div>
  );
}
