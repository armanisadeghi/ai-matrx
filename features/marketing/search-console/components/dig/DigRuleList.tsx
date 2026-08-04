"use client";

/**
 * The dig-rule rail: system Templates (adopt to make an editable copy) and
 * the caller's own / org rules. Selection is URL state (`?rule=`) owned by
 * DigTab; this component only renders and raises events.
 */

import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  digRuleSummary,
  parseDigConditions,
} from "@/features/marketing/search-console/lib/dig-rules";
import type { GscDigRuleRow } from "@/features/marketing/search-console/types";

function RuleRow({
  rule,
  selected,
  onSelect,
  actions,
}: {
  rule: GscDigRuleRow;
  selected: boolean;
  onSelect: () => void;
  actions: React.ReactNode;
}) {
  const parsed = parseDigConditions(rule.conditions);
  // The select affordance is a REAL button (keyboard + AT for free); the
  // row div is plain layout — never role="button" around nested buttons.
  return (
    <div
      className={cn(
        "group flex items-start justify-between gap-1 rounded-md border px-2 py-1.5 transition-colors",
        selected
          ? "border-primary/50 bg-accent"
          : "border-border bg-card hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <p className="truncate text-xs font-medium text-foreground">
          {rule.name}
          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {rule.dimension === "query" ? "queries" : "pages"}
          </span>
        </p>
        <p className="truncate text-[11px] text-muted-foreground" title={rule.description ?? undefined}>
          {parsed.ok ? digRuleSummary(parsed.conditions) : "Unreadable conditions"}
        </p>
      </button>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
        {actions}
      </span>
    </div>
  );
}

export function DigRuleList({
  rules,
  selectedRuleId,
  currentUserId,
  onSelect,
  onAdopt,
  onEdit,
  onDelete,
}: {
  rules: GscDigRuleRow[];
  selectedRuleId: string | null;
  currentUserId: string | null;
  onSelect: (ruleId: string) => void;
  onAdopt: (rule: GscDigRuleRow) => void;
  onEdit: (rule: GscDigRuleRow) => void;
  onDelete: (rule: GscDigRuleRow) => void;
}) {
  const templates = rules.filter((r) => r.is_template);
  const own = rules.filter(
    (r) => !r.is_template && r.created_by === currentUserId,
  );
  const shared = rules.filter(
    (r) => !r.is_template && r.created_by !== currentUserId,
  );

  const section = (
    title: string,
    items: GscDigRuleRow[],
    actions: (rule: GscDigRuleRow) => React.ReactNode,
  ) =>
    items.length > 0 ? (
      <div className="space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        {items.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            selected={rule.id === selectedRuleId}
            onSelect={() => onSelect(rule.id)}
            actions={actions(rule)}
          />
        ))}
      </div>
    ) : null;

  return (
    <div className="space-y-2">
      {section("Templates", templates, (rule) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px]"
          title="Copy this template into an editable rule of your own"
          onClick={() => onAdopt(rule)}
        >
          <Copy className="h-3 w-3" />
          Adopt
        </Button>
      ))}
      {section("My rules", own, (rule) => (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label={`Edit ${rule.name}`}
            onClick={() => onEdit(rule)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            aria-label={`Delete ${rule.name}`}
            onClick={() => onDelete(rule)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      ))}
      {section("Shared with my orgs", shared, () => null)}
      {rules.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No rules yet — adopt a template or create one.
        </p>
      ) : null}
    </div>
  );
}
