"use client";

/**
 * Pattern rules — clue templates + the user's own rules, in a side sheet.
 * Selecting a rule PREVIEWS it: the main review table becomes the rule's
 * live match list (server-side matching via p_pattern/p_match — the same
 * table, volume and all) with matches preselected; the user prunes, then
 * applies. Gmail-filter model: nothing silently classifies. Auto-apply is a
 * per-rule opt-in, and the workspace suppresses OFFERING it when the user
 * pruned matches during this review (a pruned rule is a bad auto-candidate).
 */

import { useState } from "react";
import { Pencil, Plus, Trash2, Wand2, Zap } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import {
  CLASS_RULE_MATCH_KINDS,
  classRuleSummary,
  ruleToDraft,
  validateClassRule,
  type ClassRuleDraft,
  type ClassRuleMatchKind,
  type ClassRuleTargetClass,
  type KeywordClassRuleRow,
} from "@/features/marketing/search-console/lib/class-rules";
import { GSC_TRAFFIC_CLASSES } from "@/features/marketing/search-console/types";

const EMPTY_DRAFT: ClassRuleDraft = {
  name: "",
  description: "",
  pattern: "",
  matchKind: "contains",
  targetClass: "educational",
  notes: "",
  autoApply: false,
};

export interface ClassRulesPanelProps {
  rules: KeywordClassRuleRow[];
  loading: boolean;
  currentUserId: string | null;
  previewRuleId: string | null;
  /** Live match count for the previewed rule (from the main table). */
  previewMatchCount: number | null;
  onPreview: (rule: KeywordClassRuleRow | null) => void;
  /** Preview an unsaved draft's pattern. */
  onPreviewDraft: (draft: ClassRuleDraft) => void;
  onCreate: (draft: ClassRuleDraft) => Promise<KeywordClassRuleRow>;
  onUpdate: (ruleId: string, draft: ClassRuleDraft) => Promise<KeywordClassRuleRow>;
  onDelete: (ruleId: string) => Promise<void>;
  onAdopt: (template: KeywordClassRuleRow) => Promise<KeywordClassRuleRow>;
  /** True while the current preview's selection was pruned by the user. */
  selectionPruned: boolean;
}

export function ClassRulesPanel({
  rules,
  loading,
  currentUserId,
  previewRuleId,
  previewMatchCount,
  onPreview,
  onPreviewDraft,
  onCreate,
  onUpdate,
  onDelete,
  onAdopt,
  selectionPruned,
}: ClassRulesPanelProps) {
  const [draft, setDraft] = useState<ClassRuleDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const templates = rules.filter((r) => r.is_template);
  const mine = rules.filter(
    (r) => !r.is_template && r.created_by === currentUserId,
  );
  const shared = rules.filter(
    (r) => !r.is_template && r.created_by !== currentUserId,
  );

  const saveDraft = async () => {
    if (!draft) return;
    const errors = validateClassRule(draft);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    setSaving(true);
    try {
      const saved = editingId
        ? await onUpdate(editingId, draft)
        : await onCreate(draft);
      toast.success(
        editingId ? `Updated “${saved.name}”` : `Created “${saved.name}”`,
        {
          description: draft.autoApply
            ? "Auto-apply is ON — new matching keywords will be classified automatically and flagged until you confirm them."
            : "Review-then-apply: select the rule and apply its matches when ready.",
        },
      );
      setDraft(null);
      setEditingId(null);
    } catch (error) {
      toast.error("Could not save the rule", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const ruleRow = (rule: KeywordClassRuleRow, kind: "template" | "mine" | "shared") => {
    const previewing = previewRuleId === rule.id;
    return (
      <div
        key={rule.id}
        className={cn(
          "flex items-start justify-between gap-2 rounded-md border px-2 py-1.5",
          previewing ? "border-primary bg-accent/60" : "border-border bg-card",
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => onPreview(previewing ? null : rule)}
          title={rule.description ?? undefined}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            {rule.name}
            {rule.auto_apply ? (
              <span title="Auto-apply is on — new matches classify automatically (flagged until confirmed)">
                <Zap className="h-3 w-3 text-warning" />
              </span>
            ) : null}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {classRuleSummary(rule)}
            {previewing && previewMatchCount !== null
              ? ` · ${previewMatchCount.toLocaleString()} matches`
              : ""}
          </p>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          {kind === "template" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() =>
                void onAdopt(rule)
                  .then((created) => {
                    toast.success(`Adopted “${created.name}” — it's yours to edit now.`);
                    setEditingId(created.id);
                    setDraft(ruleToDraft(created));
                  })
                  .catch((error) =>
                    toast.error("Could not adopt the template", {
                      description: extractErrorMessage(error),
                    }),
                  )
              }
            >
              Adopt
            </Button>
          ) : null}
          {kind === "mine" ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                aria-label={`Edit ${rule.name}`}
                onClick={() => {
                  setEditingId(rule.id);
                  setDraft(ruleToDraft(rule));
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${rule.name}`}
                onClick={() =>
                  void onDelete(rule.id)
                    .then(() => toast.success(`Deleted “${rule.name}”`))
                    .catch((error) =>
                      toast.error("Could not delete the rule", {
                        description: extractErrorMessage(error),
                      }),
                    )
                }
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          ) : null}
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Click a rule to preview its live matches in the table, prune, then
          apply.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => {
            setEditingId(null);
            setDraft({ ...EMPTY_DRAFT });
          }}
        >
          <Plus className="h-3 w-3" /> New rule
        </Button>
      </div>

      {draft ? (
        <div className="shrink-0 space-y-2 rounded-md border border-primary/40 bg-accent/30 p-2">
          <p className="text-xs font-medium">
            {editingId ? "Edit rule" : "New rule"}
          </p>
          <Input
            value={draft.name}
            placeholder="Rule name (e.g. How-to questions)"
            className="h-8 text-xs"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <div className="flex gap-1.5">
            <Select
              value={draft.matchKind}
              onValueChange={(value) =>
                setDraft({ ...draft, matchKind: value as ClassRuleMatchKind })
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASS_RULE_MATCH_KINDS.map((kind) => (
                  <SelectItem key={kind.key} value={kind.key} className="text-xs">
                    {kind.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={draft.pattern}
              placeholder="Pattern (e.g. how to)"
              className="h-8 flex-1 text-xs"
              onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Classify as</span>
            <Select
              value={draft.targetClass}
              onValueChange={(value) =>
                setDraft({ ...draft, targetClass: value as ClassRuleTargetClass })
              }
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GSC_TRAFFIC_CLASSES.filter((c) => c.key !== "unclassified").map(
                  (c) => (
                    <SelectItem key={c.key} value={c.key} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={draft.notes}
            placeholder={
              draft.targetClass === "mismatch"
                ? "Reasoning (required for mismatch — every ruling this rule applies inherits it)"
                : "Reasoning stamped onto applied rulings (optional)"
            }
            rows={2}
            className="text-xs"
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Switch
                checked={draft.autoApply}
                disabled={selectionPruned}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, autoApply: checked })
                }
              />
              Auto-apply to new matches
              {selectionPruned ? (
                <span className="text-warning">
                  (off — you pruned matches, so this rule needs review)
                </span>
              ) : null}
            </label>
            <span className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setDraft(null);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-xs"
                disabled={!draft.pattern.trim()}
                onClick={() => onPreviewDraft(draft)}
              >
                <Wand2 className="h-3 w-3" /> Preview
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={saving}
                onClick={() => void saveDraft()}
              >
                Save
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
        {mine.length > 0 ? (
          <section className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              My rules
            </p>
            {mine.map((rule) => ruleRow(rule, "mine"))}
          </section>
        ) : null}
        <section className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Clue templates
          </p>
          {templates.map((rule) => ruleRow(rule, "template"))}
          {templates.length === 0 && !loading ? (
            <p className="text-[11px] text-muted-foreground">No templates.</p>
          ) : null}
        </section>
        {shared.length > 0 ? (
          <section className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Shared with my orgs
            </p>
            {shared.map((rule) => ruleRow(rule, "shared"))}
          </section>
        ) : null}
      </div>
    </div>
  );
}
