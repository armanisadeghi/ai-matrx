"use client";

/**
 * WHOLE-PLAN keyword strategy — the top-down assignment pass.
 *
 * Deliberately NOT a per-page control. Keywords are assigned across the whole
 * tree at once so money pages get distinct commercial primaries and
 * educational pages are given easier terms that FEED a named money page, with
 * the internal links that carry authority there. Assigning page-by-page is
 * exactly how a plan ends up with two pages competing for one term and a blog
 * that supports nothing.
 *
 * Results are previewed grouped by role, then applied on the user's word.
 */
import { useState } from "react";
import { ArrowRight, BrainCircuit, Loader2, X } from "lucide-react";

import { ProcessingUnitsBadge } from "@/components/processing-units/ProcessingUnitsBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";

import type {
  KeywordEffortTier,
  KeywordStrategyEstimate,
} from "../../hooks/useSetupPasses";
import type { KeywordAssignment, KeywordStrategyResult, PageRole } from "../ai";
import {
  PLAN_KEYWORD_STRATEGY_KIND,
  keywordStrategyValue,
} from "../kind-values";
import { SetupSection } from "./SetupSection";

const ROLE_LABEL: Record<PageRole, string> = {
  money: "money",
  supporting: "supporting",
  navigational: "nav",
};

const ROLE_CLASS: Record<PageRole, string> = {
  money: "bg-success/15 text-success",
  supporting: "bg-primary/15 text-primary",
  navigational: "bg-muted text-muted-foreground",
};

const ROLE_ORDER: PageRole[] = ["money", "supporting", "navigational"];
const EFFORT_TIERS: KeywordEffortTier[] = ["cheap", "thorough", "advanced"];

export function KeywordStrategySection({
  strategy,
  busy,
  anyBusy,
  aiReady,
  planEmpty,
  error,
  onDismissError,
  onRun,
  onApply,
  onDismiss,
  applying,
  appliedAt,
  estimate,
  estimateLoading,
  estimateError,
}: {
  strategy: KeywordStrategyResult | null;
  busy: boolean;
  anyBusy: boolean;
  aiReady: boolean;
  planEmpty: boolean;
  error: string | null;
  onDismissError?: () => void;
  onRun: (tier: KeywordEffortTier) => void;
  onApply: () => void;
  /** Throw the staged run away — it is persisted, so this is the only exit. */
  onDismiss: () => void;
  applying: boolean;
  /** Set once applied — the button becomes a receipt. */
  appliedAt: string | null;
  estimate: KeywordStrategyEstimate | null;
  estimateLoading: boolean;
  estimateError: string | null;
}) {
  const [open, setOpen] = useState(true);
  const [tier, setTier] = useState<KeywordEffortTier>("cheap");
  const disabledReason = !aiReady
    ? "Pick a research topic with a finished report in the AI grounding bar first"
    : planEmpty
      ? "There are no planned pages to assign keywords to yet"
      : null;
  const tierEstimate = estimate?.tiers?.find((item) => item.tier === tier) ?? null;
  const runDisabled =
    Boolean(disabledReason) ||
    anyBusy ||
    !tierEstimate ||
    tierEstimate.approximate_cost_usd == null;

  const byRole = new Map<PageRole, KeywordAssignment[]>();
  for (const assignment of strategy?.assignments ?? []) {
    const list = byRole.get(assignment.pageRole) ?? [];
    list.push(assignment);
    byRole.set(assignment.pageRole, list);
  }

  return (
    <SetupSection
      title="Keyword strategy"
      action={
        <div className="flex items-center gap-1">
          <select
            aria-label="SEO planning effort"
            className="h-6 rounded-md border border-input bg-background px-1.5 text-xs"
            value={tier}
            disabled={anyBusy}
            onChange={(event) => {
              const next = EFFORT_TIERS.find(
                (candidate) => candidate === event.target.value,
              );
              if (next) setTier(next);
            }}
          >
            <option value="cheap">Cheap</option>
            <option value="thorough">Thorough</option>
            <option value="advanced">Advanced</option>
          </select>
          {strategy && !busy ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              title="Discard this keyword strategy — it is saved with your setup until you do."
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1.5 px-2 text-xs"
            disabled={runDisabled}
            title={
              disabledReason ??
              estimateError ??
              tierEstimate?.basis ??
              "Calculating pages, calls, and approximate cost…"
            }
            onClick={() => onRun(tier)}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <BrainCircuit className="h-3 w-3" />
            )}
            {strategy ? "Re-plan" : "Plan"} {tierEstimate?.pages ?? "…"} pages
            {tierEstimate ? ` · ${tierEstimate.calls} call${tierEstimate.calls === 1 ? "" : "s"}` : ""}
            {tierEstimate?.approximate_cost_usd != null ? (
              <ProcessingUnitsBadge
                costUsd={tierEstimate.approximate_cost_usd}
                hideIcon
                short
                className="ml-0.5 px-1.5 py-0"
              />
            ) : tierEstimate ? (
              <span className="text-muted-foreground">· cost unknown</span>
            ) : null}
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
          {onDismissError ? (
            <button
              type="button"
              aria-label="Dismiss the keyword error"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={onDismissError}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {!error && (estimateLoading || estimateError || tierEstimate) ? (
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          {estimateLoading
            ? "Calculating the full run before anything is spent…"
            : estimateError
              ? `Estimate unavailable: ${estimateError}`
              : tierEstimate?.basis}
        </p>
      ) : null}

      {busy ? (
        <p className="text-xs text-muted-foreground">
          Reading the whole plan against the research report — money pages,
          supporting clusters, and the links between them…
        </p>
      ) : !strategy ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Assigns every page at once: a distinct money keyword per commercial
          page, easier supporting terms for educational pages, and the internal
          links that pass authority to the money page each one feeds.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? "Hide" : "Show"} {strategy.assignments.length} assignment
              {strategy.assignments.length === 1 ? "" : "s"}
            </button>
            {appliedAt ? (
              <span className="text-[11px] font-medium text-success">
                applied
              </span>
            ) : (
              <Button
                type="button"
                size="sm"
                className="ml-auto h-6 px-2 text-[11px]"
                disabled={applying || strategy.assignments.length === 0}
                onClick={onApply}
              >
                {applying ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Apply to plan
              </Button>
            )}
          </div>

          {/* The RESULT body renders through the `plan_keyword_strategy`
              kind's registered component (agent-manifest wave 2) — the same
              render a `__kind` block gets in chat. The actions around it
              (tier picker, run/dismiss, Apply) stay this section's own. The
              bespoke rows survive only as the registry-floor fallback. */}
          {open ? (
            <KindInstanceRender
              kind={PLAN_KEYWORD_STRATEGY_KIND}
              value={keywordStrategyValue(strategy)}
              variant="bare"
              showRoutingNote={false}
              unroutableFallback={<KeywordStrategyFallbackBody strategy={strategy} byRole={byRole} />}
            />
          ) : (
            <p className="text-xs leading-relaxed text-foreground">
              {strategy.strategySummary}
            </p>
          )}
        </div>
      )}
    </SetupSection>
  );
}

/**
 * The registry floor: when no component is render-trusted for the kind (held
 * inactive / registry cold on a stale client) the strategy still reads as a
 * strategy — summary, warnings, and the grouped assignment rows.
 */
function KeywordStrategyFallbackBody({
  strategy,
  byRole,
}: {
  strategy: KeywordStrategyResult;
  byRole: Map<PageRole, KeywordAssignment[]>;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-foreground">
        {strategy.strategySummary}
      </p>
      {strategy.warnings.length > 0 ? (
        <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5">
          {strategy.warnings.map((warning, index) => (
            <li key={index} className="text-[11px] leading-relaxed text-foreground">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      {ROLE_ORDER.filter((role) => (byRole.get(role) ?? []).length > 0).map(
        (role) => (
          <div key={role}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {role === "money"
                ? "Money pages"
                : role === "supporting"
                  ? "Supporting pages"
                  : "Navigational"}
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {(byRole.get(role) ?? []).map((assignment) => (
                <AssignmentRow key={assignment.route} assignment={assignment} />
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function AssignmentRow({ assignment }: { assignment: KeywordAssignment }) {
  return (
    <li className="bg-card px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium leading-none",
            ROLE_CLASS[assignment.pageRole],
          )}
        >
          {ROLE_LABEL[assignment.pageRole]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {assignment.route}
          </p>
          {assignment.primaryKeyword ? (
            <p className="mt-0.5 text-xs font-medium text-foreground">
              {assignment.primaryKeyword}
              {assignment.primaryIsNew ? (
                <span
                  className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 text-[10px] font-medium uppercase leading-none text-warning"
                  title="Not in the existing keyword library — it will be created on apply."
                >
                  new
                </span>
              ) : null}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              No keyword target
            </p>
          )}
          {assignment.secondaryKeywords.length > 0 ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              + {assignment.secondaryKeywords.join(" · ")}
            </p>
          ) : null}
          {assignment.supportsRoutes.length > 0 ? (
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-primary">
              <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
              supports{" "}
              <span className="font-mono">
                {assignment.supportsRoutes.join(", ")}
              </span>
            </p>
          ) : null}
          {assignment.internalLinks.length > 0 ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              links:{" "}
              {assignment.internalLinks
                .map((link) => `"${link.anchorText}" → ${link.toRoute}`)
                .join(" · ")}
            </p>
          ) : null}
          {assignment.desiredMetaTitle ? (
            <p className="mt-1 text-[11px] leading-relaxed text-foreground">
              Meta: {assignment.desiredMetaTitle}
            </p>
          ) : null}
          {assignment.desiredMetaDescription ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {assignment.desiredMetaDescription}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
