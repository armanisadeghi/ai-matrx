"use client";

/**
 * THE VALUE RULE EDITOR — where per-business qualifier polarity gets authored.
 *
 * This is the heart of the Keyword Value System and it had no UI at all: the
 * 84 rules in the database arrived only from seed migrations and starter-pack
 * adoption, and all four workbench variants rendered them read-only. Arman, on
 * why this mechanic is the product: "I have in electronics recycling, IT asset
 * disposition company, and I can tell you the word FREE massively reduces the
 * value of a keyword."
 *
 * A rule matches EITHER a phrase or a detected fact, and multiplies the score.
 *
 *   THE FACT PICKER IS THE LIVE REGISTRY. Dimensions and values come from
 *   `seo.facet_dimension_catalog(site)` — never a hardcoded list of 13, because
 *   a site can invent its own dimension and the DB trigger
 *   `keyword_class_rule_assert_facet` validates against that same registry.
 *
 *   ZERO IS IMPOSSIBLE BY DESIGN. The score is a product resolved as
 *   exp(sum(ln(mult))), so ×0 would erase every other reason instead of saying
 *   "worth far less". The DB CHECK enforces (0, 100]; this screen says that in
 *   English instead of letting a 23514 reach a person.
 *
 *   NOTHING SAVES BLIND. The live impact panel is server-measured against this
 *   site's real Search Console keywords, and the save button states how many
 *   keywords change band.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ListChecks, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import {
  archiveRule,
  createValueRule,
  updateValueRule,
  type ValueRuleDraft,
} from "@/features/marketing/search-console/data-class-rules";
import type { BandMeta } from "../lib";
import { ProvenanceStrip } from "../ProvenanceStrip";
import type { ValueRule,
  EditorProvenance,
} from "../types";
import { ImpactPanel } from "./ImpactPanel";
import {
  listFacetDimensions,
  facetDimensionsQueryKey,
  previewValueRule,
  valueSurfaceQueryKeys,
} from "./data";
import {
  isUnsafePattern,
  MATCH_KINDS,
  type FacetDimension,
  type RuleMatchMode,
  type ValueRuleFormState,
} from "./types";

const EMPTY: ValueRuleFormState = {
  name: "",
  description: "",
  mode: "phrase",
  pattern: "",
  matchKind: "word",
  matchFacet: "",
  matchFacetValue: "",
  multiplier: "0.2",
  notes: "",
};

function ruleToForm(rule: ValueRule): ValueRuleFormState {
  return {
    name: rule.name,
    description: rule.description ?? "",
    mode: rule.match_facet ? "fact" : "phrase",
    pattern: rule.pattern ?? "",
    matchKind: rule.match_kind ?? "word",
    matchFacet: rule.match_facet ?? "",
    matchFacetValue: rule.match_facet_value ?? "",
    multiplier: rule.value_multiplier === null ? "" : String(rule.value_multiplier),
    notes: rule.notes ?? "",
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[11px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? (
        <span className="block text-[10px] leading-4 text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

/** Everything wrong with the draft, in the order a person would fix it. */
function draftIssues(form: ValueRuleFormState): string[] {
  const issues: string[] = [];
  if (!form.name.trim()) issues.push("Give the rule a name you will recognise later.");
  const multiplier = Number(form.multiplier.trim());
  if (!form.multiplier.trim() || !Number.isFinite(multiplier)) {
    issues.push("Enter a multiplier.");
  } else if (multiplier <= 0) {
    issues.push(
      "A multiplier must be greater than 0. Zero is impossible on purpose — the score is a product, so ×0 would erase every other reason. Use 0.05 for “almost worthless”.",
    );
  } else if (multiplier > 100) {
    issues.push("A multiplier cannot be more than 100.");
  }
  if (form.mode === "phrase") {
    if (!form.pattern.trim()) issues.push("Type the phrase this rule looks for.");
    else if (isUnsafePattern(form.pattern.trim()))
      issues.push(
        "The phrase can only use letters, numbers, spaces and ' - . / & _ — it becomes a whole-word search.",
      );
  } else {
    if (!form.matchFacet) issues.push("Choose which fact this rule reads.");
    else if (!form.matchFacetValue) issues.push("Choose which value of that fact fires the rule.");
  }
  return issues;
}

export function ValueRuleEditor({
  siteId,
  organizationId,
  window,
  windowLabel,
  bandMetas,
  rule,
  provenance,
  onClose,
}: {
  siteId: string;
  organizationId: string | null;
  window: { start: string; end: string };
  windowLabel: string;
  bandMetas: BandMeta[];
  /** null = creating a new rule. */
  rule: ValueRule | null;
  /** Set when this rule was adopted from an industry pack (see ProvenanceStrip). */
  provenance?: EditorProvenance;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ValueRuleFormState>(() =>
    rule ? ruleToForm(rule) : EMPTY,
  );
  const set = <K extends keyof ValueRuleFormState>(
    key: K,
    value: ValueRuleFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const dimensions = useQuery({
    queryKey: facetDimensionsQueryKey(siteId),
    queryFn: ({ signal }) => listFacetDimensions(siteId, signal),
    staleTime: 5 * 60_000,
  });

  const selectedDimension: FacetDimension | undefined = (dimensions.data ?? []).find(
    (dimension) => dimension.slug === form.matchFacet,
  );

  // Clearing a stale value when the dimension changes is state, not render.
  useEffect(() => {
    if (!selectedDimension) return;
    if (!form.matchFacetValue) return;
    if (selectedDimension.facet_values.some((v) => v.key === form.matchFacetValue)) return;
    setForm((prev) => ({ ...prev, matchFacetValue: "" }));
  }, [selectedDimension, form.matchFacetValue]);

  const issues = draftIssues(form);
  const ready = issues.length === 0;
  const debounced = useDebounce(form, 450);
  const debouncedReady = draftIssues(debounced).length === 0;
  const multiplier = Number(debounced.multiplier.trim());

  const preview = useQuery({
    queryKey: [
      "seo",
      "value-rules",
      "preview",
      siteId,
      window.start,
      window.end,
      rule?.id ?? "new",
      debounced.mode,
      debounced.pattern.trim().toLowerCase(),
      debounced.matchKind,
      debounced.matchFacet,
      debounced.matchFacetValue,
      multiplier,
    ],
    enabled: debouncedReady,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      previewValueRule(
        {
          siteId,
          start: window.start,
          end: window.end,
          multiplier,
          pattern: debounced.mode === "phrase" ? debounced.pattern.trim().toLowerCase() : null,
          matchKind: debounced.mode === "phrase" ? debounced.matchKind : null,
          matchFacet: debounced.mode === "fact" ? debounced.matchFacet : null,
          matchFacetValue: debounced.mode === "fact" ? debounced.matchFacetValue : null,
          ruleId: rule?.id ?? null,
        },
        signal,
      ),
  });

  const invalidate = () => {
    for (const key of valueSurfaceQueryKeys(siteId)) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const draft: ValueRuleDraft = {
        name: form.name,
        description: form.description,
        pattern: form.mode === "phrase" ? form.pattern : "",
        matchKind: form.mode === "phrase" ? form.matchKind : null,
        matchFacet: form.mode === "fact" ? form.matchFacet : null,
        matchFacetValue: form.mode === "fact" ? form.matchFacetValue : null,
        valueMultiplier: Number(form.multiplier.trim()),
        notes: form.notes,
      };
      return rule
        ? updateValueRule(rule.id, draft, siteId, organizationId)
        : createValueRule(draft, siteId, organizationId);
    },
    onSuccess: () => {
      const moved = preview.data?.moved_keywords ?? 0;
      toast.success(
        rule ? "Rule updated" : "Rule saved",
        moved > 0
          ? { description: `${moved} keyword${moved === 1 ? "" : "s"} changed band.` }
          : undefined,
      );
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const archive = useMutation({
    mutationFn: async () => {
      if (!rule) return;
      await archiveRule(rule.id);
    },
    onSuccess: () => {
      toast.success("Rule archived", {
        description: "Every keyword it was scoring re-resolves without it.",
      });
      invalidate();
      onClose();
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const askArchive = async () => {
    const ok = await confirm({
      title: "Archive this rule?",
      description:
        "Keywords it was scoring re-resolve immediately without it — some will change band. Your explicit keyword rulings are untouched.",
      confirmLabel: "Archive rule",
      variant: "destructive",
    });
    if (ok) archive.mutate();
  };

  const busy = save.isPending || archive.isPending;
  const moved = preview.data?.moved_keywords ?? 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="flex max-h-[92dvh] w-[min(58rem,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 border-b border-border px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden />
            {rule ? "Edit value rule" : "New value rule"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            A rule says what a word or a detected fact is worth to{" "}
            <em>this</em> business. “Free” might be worthless to you and
            everything to somebody else — that judgement is yours, and it is why
            nothing here is a platform default.
          </DialogDescription>
        </DialogHeader>

        {provenance ? (
          <ProvenanceStrip provenance={provenance} onReverted={onClose} />
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* ── The rule ── */}
          <div className="min-h-0 space-y-3 overflow-y-auto border-border p-4 scrollbar-thin md:border-r">
            <Field label="Name" hint="What you will call this rule in the ledger.">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Free-seeking searches"
                className="h-8 text-sm"
              />
            </Field>

            <div className="space-y-1">
              <span className="block text-[11px] font-medium text-foreground">
                What fires it
              </span>
              <div className="flex gap-1 rounded-md border border-border p-0.5">
                {(["phrase", "fact"] as RuleMatchMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => set("mode", mode)}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-[11px] transition-colors",
                      form.mode === mode
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {mode === "phrase" ? "A word in the search" : "A detected fact"}
                  </button>
                ))}
              </div>
              <span className="block text-[10px] leading-4 text-muted-foreground">
                {form.mode === "phrase"
                  ? "Matched against the keyword text itself — the fastest way to encode a word your business knows is bad news."
                  : "Matched against what the classifier detected about the searcher. Broader than any word list, and it works on keywords you have never seen."}
              </span>
            </div>

            {form.mode === "phrase" ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <Field label="How it matches">
                  <Select value={form.matchKind} onValueChange={(v) => set("matchKind", v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_KINDS.map((kind) => (
                        <SelectItem key={kind.key} value={kind.key} className="text-xs">
                          {kind.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Phrase"
                  hint={MATCH_KINDS.find((k) => k.key === form.matchKind)?.hint || undefined}
                >
                  <Input
                    value={form.pattern}
                    onChange={(e) => set("pattern", e.target.value)}
                    placeholder="free"
                    className="h-8 text-sm"
                  />
                </Field>
              </div>
            ) : dimensions.isLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-8 rounded-md" />
                <Skeleton className="h-8 rounded-md" />
              </div>
            ) : dimensions.isError ? (
              <InlineQueryError
                what="your keyword dimensions"
                error={dimensions.error}
                onRetry={() => void dimensions.refetch()}
              />
            ) : (dimensions.data ?? []).length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
                No dimensions are registered yet, so there is no fact to match on.
                Use a word rule instead.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label="Fact">
                  <Select
                    value={form.matchFacet}
                    onValueChange={(v) => setForm((p) => ({ ...p, matchFacet: v, matchFacetValue: "" }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a dimension" />
                    </SelectTrigger>
                    <SelectContent>
                      {(dimensions.data ?? []).map((dimension) => (
                        <SelectItem
                          key={dimension.dimension_id}
                          value={dimension.slug}
                          className="text-xs"
                        >
                          {dimension.label}
                          {dimension.scope === "site" ? " (yours)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Is"
                  hint={
                    selectedDimension
                      ? `${selectedDimension.value_count} values · ${selectedDimension.keyword_count} keywords carry this fact`
                      : undefined
                  }
                >
                  <Select
                    value={form.matchFacetValue}
                    onValueChange={(v) => set("matchFacetValue", v)}
                    disabled={!selectedDimension}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Choose a value" />
                    </SelectTrigger>
                    <SelectContent>
                      {(selectedDimension?.facet_values ?? []).map((value) => (
                        <SelectItem key={value.value_id} value={value.key} className="text-xs">
                          {value.label}
                          {value.keyword_count > 0 ? ` · ${value.keyword_count}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            <Field
              label="Multiplier"
              hint="Under 1 makes a keyword worth less, over 1 worth more. 0.2 = a fifth. Zero is impossible — the score is a product, so ×0 would erase every other reason."
            >
              <Input
                value={form.multiplier}
                onChange={(e) => set("multiplier", e.target.value)}
                inputMode="decimal"
                placeholder="0.2"
                className={cn(
                  "h-8 w-28 text-sm tabular-nums",
                  Number(form.multiplier) > 1 && "text-success",
                  Number(form.multiplier) > 0 && Number(form.multiplier) < 1 && "text-warning",
                )}
              />
            </Field>

            <Field
              label="Why (optional)"
              hint="The reasoning survives you. Every keyword this rule touches shows it in the why chain."
            >
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={3}
                placeholder="People searching for free service are almost never enterprise buyers."
                className="text-xs"
              />
            </Field>

            {issues.length > 0 ? (
              <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2">
                {issues.map((issue) => (
                  <li key={issue} className="text-[11px] leading-4 text-warning">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* ── What it does ── */}
          <div className="min-h-0 space-y-2 overflow-y-auto bg-muted/20 p-4 scrollbar-thin">
            <p className="text-xs font-semibold text-foreground">
              What this does to your keywords
            </p>
            <ImpactPanel
              impact={preview.data}
              isPending={preview.isPending}
              isFetching={preview.isFetching}
              error={preview.error}
              onRetry={() => void preview.refetch()}
              bandMetas={bandMetas}
              incomplete={
                debouncedReady
                  ? null
                  : "Fill in the phrase or fact and a multiplier, and this will show exactly which of your keywords change band — before you save."
              }
              windowLabel={windowLabel}
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border px-4 pt-3 pb-4">
          <div>
            {rule ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void askArchive()}
                disabled={busy}
                className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Archive
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => save.mutate()}
              disabled={!ready || busy}
              className="gap-1.5"
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              {moved > 0
                ? `Save — ${moved} keyword${moved === 1 ? "" : "s"} move`
                : rule
                  ? "Save changes"
                  : "Save rule"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
