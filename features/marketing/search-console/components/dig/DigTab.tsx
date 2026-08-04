"use client";

/**
 * Dig Here — Arman's low-hanging-fruit method as a rules engine. A rule
 * rail (system templates + own/org rules) beside the active rule's results.
 * Rule CONTENTS run through the stateless `seo.gsc_perf_dig` RPC, so the
 * editor's Preview shows exactly what saving would show. A rule that needs
 * compare metrics under `compare=none` auto-runs against the previous
 * period (and says so) instead of erroring.
 */

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  digRuleSummary,
  parseDigConditions,
  ruleRequiresCompare,
  isDigMetric,
  type GscDigRuleContent,
} from "@/features/marketing/search-console/lib/dig-rules";
import { withPrevCompare } from "@/features/marketing/search-console/lib/url-state";
import {
  useDigRuleMutations,
  useDigRules,
  useRunDig,
} from "@/features/marketing/search-console/hooks/useDigRules";
import {
  DigResultsTable,
} from "@/features/marketing/search-console/components/dig/DigResultsTable";
import {
  DigRuleEditor,
  type DigRuleDraft,
} from "@/features/marketing/search-console/components/dig/DigRuleEditor";
import { DigRuleList } from "@/features/marketing/search-console/components/dig/DigRuleList";
import { LoadingSurface, QueryError } from "@/features/marketing/components/shared/MarketingUi";
import type {
  GscCompareMode,
  GscDigResultRow,
  GscDigRuleRow,
  GscFilters,
  GscRangeKey,
  GscResolvedPeriods,
} from "@/features/marketing/search-console/types";

/** A stored rule row → the runnable content shape (null if unreadable). */
export function ruleRowContent(rule: GscDigRuleRow): GscDigRuleContent | null {
  const parsed = parseDigConditions(rule.conditions);
  if (!parsed.ok) return null;
  if (rule.dimension !== "query" && rule.dimension !== "page") return null;
  const sortMetric =
    rule.sort_metric === "key" || isDigMetric(rule.sort_metric)
      ? (rule.sort_metric as GscDigRuleContent["sortMetric"])
      : "clicks";
  const baseFilters =
    typeof rule.base_filters === "object" &&
    rule.base_filters !== null &&
    !Array.isArray(rule.base_filters)
      ? (Object.fromEntries(
          Object.entries(rule.base_filters).filter(
            ([, v]) => typeof v === "string" && v.trim() !== "",
          ),
        ) as GscFilters)
      : {};
  return {
    dimension: rule.dimension,
    conditions: parsed.conditions,
    sortMetric,
    sortDir: rule.sort_dir === "asc" ? "asc" : "desc",
    rowLimit: rule.row_limit,
    baseFilters,
  };
}

const NEW_DRAFT: DigRuleDraft = {
  name: "",
  description: "",
  content: {
    dimension: "query",
    conditions: [{ metric: "impressions", op: "gt", value: 100 }],
    sortMetric: "clicks",
    sortDir: "desc",
    rowLimit: 100,
    baseFilters: {},
  },
};

export function DigTab({
  siteId,
  siteName,
  organizationId,
  periods,
  panelRange,
  ruleId,
  onSelectRule,
  onDrill,
}: {
  siteId: string;
  siteName: string | null;
  organizationId: string | null;
  periods: GscResolvedPeriods;
  panelRange: {
    range: GscRangeKey;
    customFrom: string | null;
    customTo: string | null;
    compare: GscCompareMode;
  };
  ruleId: string | null;
  onSelectRule: (ruleId: string | null) => void;
  onDrill: (dimension: "query" | "page", row: GscDigResultRow) => void;
}) {
  const currentUserId = useAppSelector(selectUserId);
  const rules = useDigRules(siteId);
  const mutations = useDigRuleMutations(siteId);

  const [draft, setDraft] = useState<DigRuleDraft | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  // The edited rule's site pin, preserved verbatim on save — editing must
  // never silently widen a site-pinned rule into a global one.
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  // The content actually running: the selected rule's, or a previewed draft.
  const [previewContent, setPreviewContent] =
    useState<GscDigRuleContent | null>(null);

  const ruleRows = rules.data ?? [];
  const selectedRule =
    ruleRows.find((r) => r.id === ruleId) ?? ruleRows[0] ?? null;
  const selectedContent = selectedRule ? ruleRowContent(selectedRule) : null;

  // A stale ?rule= (deleted rule, other site's rule after a site switch)
  // would make the URL and the visible selection disagree forever — clear it.
  useEffect(() => {
    if (rules.data && ruleId && !rules.data.some((r) => r.id === ruleId)) {
      onSelectRule(null);
    }
  }, [rules.data, ruleId]);

  const activeContent = draft && previewContent ? previewContent : selectedContent;
  const activeLabel =
    draft && previewContent
      ? `${draft.name.trim() || "Draft"} (preview)`
      : (selectedRule?.name ?? "No rule");

  const needsForcedCompare =
    !!activeContent && !periods.compare && ruleRequiresCompare(activeContent);
  const effectivePeriods =
    activeContent && needsForcedCompare ? withPrevCompare(periods) : periods;

  const run = useRunDig(siteId, effectivePeriods, activeContent);

  const startEdit = (rule: GscDigRuleRow) => {
    const content = ruleRowContent(rule);
    if (!content) {
      toast.error("This rule's conditions are unreadable — recreate it.");
      return;
    }
    setDraft({
      name: rule.name,
      description: rule.description ?? "",
      content,
    });
    setEditingRuleId(rule.id);
    setEditingSiteId(rule.site_id);
    setPreviewContent(null);
  };

  const closeEditor = () => {
    setDraft(null);
    setEditingRuleId(null);
    setEditingSiteId(null);
    setPreviewContent(null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      content: draft.content,
      // New rules are cross-site; an edited rule keeps its existing pin.
      siteId: editingRuleId ? editingSiteId : null,
      organizationId,
    };
    try {
      if (editingRuleId) {
        await mutations.update.mutateAsync({ ruleId: editingRuleId, input });
        toast.success("Rule updated.");
        onSelectRule(editingRuleId);
      } else {
        const created = await mutations.create.mutateAsync(input);
        toast.success("Rule saved.");
        onSelectRule(created.id);
      }
      closeEditor();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the rule.",
      );
    }
  };

  const adoptTemplate = async (template: GscDigRuleRow) => {
    try {
      const created = await mutations.adopt.mutateAsync({
        template,
        organizationId,
      });
      toast.success(`Adopted "${template.name}" — it's yours to edit now.`);
      onSelectRule(created.id);
      startEdit(created);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not adopt the template.",
      );
    }
  };

  const deleteRule = async (rule: GscDigRuleRow) => {
    const ok = await confirm({
      title: `Delete "${rule.name}"?`,
      description: "The rule is removed for you and anyone it's shared with.",
      variant: "destructive",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(rule.id);
      if (ruleId === rule.id) onSelectRule(null);
      // Never leave an editor open against a soft-deleted row.
      if (editingRuleId === rule.id) closeEditor();
      toast.success("Rule deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete the rule.",
      );
    }
  };

  if (rules.isLoading) return <LoadingSurface label="Loading dig rules…" />;
  if (rules.isError) {
    return (
      <QueryError error={rules.error} onRetry={() => void rules.refetch()} />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row">
      <div className="w-full shrink-0 space-y-2 overflow-y-auto lg:w-72">
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full gap-1 text-xs"
          onClick={() => {
            setDraft(NEW_DRAFT);
            setEditingRuleId(null);
            setEditingSiteId(null);
            setPreviewContent(null);
          }}
        >
          <Plus className="h-3 w-3" />
          New rule
        </Button>
        <DigRuleList
          rules={ruleRows}
          selectedRuleId={selectedRule?.id ?? null}
          currentUserId={currentUserId}
          onSelect={(id) => {
            onSelectRule(id);
            closeEditor();
          }}
          onAdopt={(rule) => void adoptTemplate(rule)}
          onEdit={startEdit}
          onDelete={(rule) => void deleteRule(rule)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {draft ? (
          <DigRuleEditor
            draft={draft}
            onChange={(next) => {
              // Rule-content edits invalidate a previous Preview — showing a
              // stale run under a live draft label would lie about the rule.
              if (next.content !== draft.content) setPreviewContent(null);
              setDraft(next);
            }}
            onPreview={() => setPreviewContent(draft.content)}
            onSave={() => void saveDraft()}
            onCancel={closeEditor}
            saving={mutations.create.isPending || mutations.update.isPending}
            isNew={!editingRuleId}
          />
        ) : selectedRule && selectedContent ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-card px-2.5 py-1.5">
            <p className="text-xs font-medium text-foreground">
              {selectedRule.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {digRuleSummary(selectedContent.conditions)}
            </p>
            {needsForcedCompare && effectivePeriods.compare ? (
              <p className="text-[11px] text-muted-foreground">
                · compared vs {effectivePeriods.compare.start} →{" "}
                {effectivePeriods.compare.end} (auto)
              </p>
            ) : null}
          </div>
        ) : selectedRule && !selectedContent ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5">
            <p className="text-xs text-destructive">
              This rule's stored conditions are unreadable — edit or recreate it.
            </p>
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          {activeContent ? (
            <DigResultsTable
              siteId={siteId}
              siteName={siteName}
              dimension={activeContent.dimension}
              periods={effectivePeriods}
              baseFilters={activeContent.baseFilters}
              ruleLabel={activeLabel}
              rows={run.data?.rows ?? []}
              isLoading={run.isLoading}
              isFetching={run.isFetching}
              error={run.isError ? run.error : null}
              onDrill={(row) => onDrill(activeContent.dimension, row)}
              panelRange={{
                ...panelRange,
                compare:
                  needsForcedCompare && panelRange.compare === "none"
                    ? "prev"
                    : panelRange.compare,
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border bg-card/60 p-8">
              <p className="text-xs text-muted-foreground">
                Pick a rule on the left, adopt a template, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
