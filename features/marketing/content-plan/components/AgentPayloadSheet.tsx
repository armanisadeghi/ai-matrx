"use client";

/**
 * AgentPayloadSheet — "See what the AI sees".
 *
 * THE DEFECT THIS EXISTS FOR (measured 2026-08-25). The family-comparison
 * agent on /blog/prp-research-updates was handed 1 of 295 plan pages and ZERO
 * siblings, so every internal link it proposed was invented. The output was
 * fluent, well-shaped and stored. Nothing caught it, because nobody could see
 * the payload. This screen is the place a human looks BEFORE believing an
 * answer.
 *
 * THE ONE RULE HERE: the monospace blocks are the server's `rendered` strings,
 * printed verbatim. Not re-rendered from `entries`, not summarised, not
 * re-ordered, not truncated. A prettified reconstruction would be a second
 * thing that can drift from the payload — i.e. exactly the class of bug this
 * screen is supposed to end. The tables beside them are strictly ADDITIVE:
 * they make "why was this page selected" auditable, and they are labelled as
 * the structured twin of the text, never as the payload itself.
 *
 * Coverage is not a footnote. `coverage_line` and every caveat render at the
 * top, before any content, because the agent is told them before it answers
 * and the human must be held to the same standard (agent-provision skill,
 * § coverage honesty).
 *
 * READ-ONLY. One GET, no writes, no run triggers, no mutation of any node,
 * mandate, agent or provision.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

import {
  DEFAULT_NODE_SHAPE,
  DEFAULT_SITE_SHAPE,
  PAYLOAD_SHAPES,
  usePlanIndex,
  type PayloadShapeKey,
  type PlanBranchRef,
  type PlanIndexView,
} from "../hooks/usePlanIndex";

/** Byte budget for one monospace block. Above this we still render everything
 * — a payload preview that silently truncates would repeat the original sin —
 * but the block scrolls inside its own box instead of the sheet. */
const BLOCK_MAX_HEIGHT = "max-h-[52vh]";

function bytes(text: string): string {
  const n = new TextEncoder().encode(text).length;
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/** Rough, honestly-labelled: ~4 chars per token. Never presented as exact. */
function roughTokens(text: string): string {
  return `~${Math.round(text.length / 4).toLocaleString()} tokens`;
}

// ── the coverage banner ────────────────────────────────────────────────────

/**
 * Impossible to miss, by design. Amber whenever the plan is NOT fully offered
 * or the index carries caveats — the two states in which an answer built on
 * this payload deserves suspicion.
 */
function CoverageBanner({ view }: { view: PlanIndexView }) {
  const caveats = view.coverage?.caveats ?? [];
  const capped = !view.full_index_offered;
  const warn = capped || caveats.length > 0;

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2 text-xs",
        warn
          ? "border-amber-400/60 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
          : "border-border bg-muted/50 text-foreground",
      )}
    >
      <div className="flex items-start gap-1.5">
        {warn ? (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-medium leading-snug">{view.coverage_line}</p>
          {capped ? (
            <p className="font-semibold leading-snug">
              THE FULL INDEX IS NOT BEING SENT. This plan holds {view.total}{" "}
              pages, over the {view.threshold}-page threshold, so the
              whole-plan value arrives EMPTY. Any claim the agent makes about
              pages outside the shapes below is a guess.
            </p>
          ) : null}
          {caveats.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {caveats.map((line) => (
                <li key={line} className="leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── index quality ──────────────────────────────────────────────────────────

/**
 * Plain language, not ratios. "39 of 295 pages have no real title" is the
 * sentence that lets a human spot a garbage payload in two seconds; "authored
 * titles: 256" is not.
 */
function QualitySignals({ view }: { view: PlanIndexView }) {
  const total = view.total || 1;
  const rows: { label: string; bad: number; good: boolean }[] = [
    {
      label: `${view.total - view.authored_titles} of ${view.total} pages have no real title — those lines are just the URL restated, so the agent is reading a slug and calling it a subject.`,
      bad: view.total - view.authored_titles,
      good: view.authored_titles === view.total,
    },
    {
      label: `${view.total - view.briefed} of ${view.total} pages have no brief — those lines carry a title only, and topic overlap cannot be detected from a title.`,
      bad: view.total - view.briefed,
      good: view.briefed === view.total,
    },
    {
      label: `${view.total - view.keyworded} of ${view.total} pages have no keyword attached.`,
      bad: view.total - view.keyworded,
      good: view.keyworded === view.total,
    },
  ];

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        How good is this payload
      </p>
      <ul className="space-y-1">
        {rows.map((row) => {
          const pct = Math.round((row.bad / total) * 100);
          return (
            <li key={row.label} className="flex items-start gap-1.5 text-xs">
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  row.good
                    ? "bg-emerald-500"
                    : pct >= 25
                      ? "bg-amber-500"
                      : "bg-muted-foreground/50",
                )}
              />
              <span
                className={cn(
                  "leading-snug",
                  row.good ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {row.good ? "Every page has an authored value here." : row.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── structured twins ───────────────────────────────────────────────────────

/**
 * Neighbours as a table. The `reasons` column is the auditable part: it is the
 * server's own account of WHY a page made the legal-link set, so a human can
 * see a selection built on nothing before an agent builds an argument on it.
 */
function NeighbourTable({ view }: { view: PlanIndexView }) {
  const rows = view.neighbours ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No neighbours were selected. The agent has no legal set to link into —
        every internal link it proposes would be invented.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Route</th>
            <th className="px-2 py-1 text-right font-medium">Score</th>
            <th className="px-2 py-1 font-medium">Why it was selected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.route} className="border-t border-border align-top">
              <td className="px-2 py-1">
                <span className="font-mono">{row.route}</span>
                {row.label ? (
                  <span className="block text-muted-foreground">
                    {row.label}
                  </span>
                ) : null}
              </td>
              <td className="px-2 py-1 text-right tabular-nums">
                {(row.score ?? 0).toFixed(1)}
              </td>
              <td className="px-2 py-1">
                {(row.reasons ?? []).length > 0 ? (
                  <ul className="space-y-0.5">
                    {(row.reasons ?? []).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">
                    no reason recorded
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BranchRow({
  branch,
  tone,
}: {
  branch: PlanBranchRef;
  tone: "own" | "ancestor" | "adjacent";
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        tone === "own"
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-mono text-xs">{branch.key}</span>
        <span className="text-xs font-medium">{branch.label}</span>
        <span className="text-[11px] text-muted-foreground">
          {branch.size ?? 0} page{branch.size === 1 ? "" : "s"} ·{" "}
          {branch.relation}
        </span>
      </div>
      {branch.purpose ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
          {branch.purpose}
        </p>
      ) : (
        <p className="mt-0.5 text-[11px] italic leading-snug text-amber-700 dark:text-amber-400">
          No recorded purpose — this branch tells the agent nothing about what
          belongs in it.
        </p>
      )}
      {(branch.child_routes ?? []).length > 0 ? (
        <p className="mt-0.5 break-words font-mono text-[11px] leading-snug text-muted-foreground">
          {(branch.child_routes ?? []).join("  ")}
        </p>
      ) : null}
    </div>
  );
}

/** The walk, rendered so the tree shape is visible: own branch, then up
 * through the ancestors, then across to the branches it must not take. */
function BranchWalk({ view }: { view: PlanIndexView }) {
  const ctx = view.branch_context;
  if (!ctx?.own_branch) {
    return (
      <p className="text-xs text-muted-foreground">
        No branch context — this view was opened for the whole plan, not one
        page.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          This page&apos;s branch
        </p>
        <BranchRow branch={ctx.own_branch} tone="own" />
        {(ctx.own_branch.size ?? 0) <= 1 ? (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            This page has ZERO siblings. A &quot;compare against your
            family&quot; question has no family to compare against — the answer
            has to come from the neighbours and the branch purposes, or it is
            invented.
          </p>
        ) : null}
      </div>
      {(ctx.ancestors ?? []).length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Up the tree
          </p>
          {(ctx.ancestors ?? []).map((branch) => (
            <BranchRow key={branch.key} branch={branch} tone="ancestor" />
          ))}
        </div>
      ) : null}
      {(ctx.adjacent ?? []).length > 0 ? (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Neighbouring branches — territory this page must not take
          </p>
          {(ctx.adjacent ?? []).map((branch) => (
            <BranchRow key={branch.key} branch={branch} tone="adjacent" />
          ))}
          {(ctx.adjacent_omitted ?? 0) > 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {ctx.adjacent_omitted} further branch
              {ctx.adjacent_omitted === 1 ? " was" : "es were"} omitted from
              this list — the agent is not seeing them.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── the sheet ──────────────────────────────────────────────────────────────

export function AgentPayloadSheet({
  open,
  onOpenChange,
  siteId,
  nodeId,
  nodeRoute,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
  /** null → the whole-plan view: no neighbours, no branch walk. */
  nodeId: string | null;
  nodeRoute?: string | null;
}) {
  const [shape, setShape] = useState<PayloadShapeKey | null>(null);
  const query = usePlanIndex(siteId, nodeId, open);
  const view = query.data ?? null;

  const active: PayloadShapeKey =
    shape ?? (nodeId ? DEFAULT_NODE_SHAPE : DEFAULT_SITE_SHAPE);
  const activeShape =
    PAYLOAD_SHAPES.find((entry) => entry.key === active) ?? PAYLOAD_SHAPES[0];
  const rendered = view?.rendered ?? {};
  const text = rendered[active] ?? "";

  const title = nodeId
    ? `What the AI sees — ${nodeRoute ?? view?.node_route ?? "this page"}`
    : "What the AI sees — the whole plan";

  const agentPayload = useMemo(
    () => ({
      kind: "content_plan_agent_payload",
      location: webLocation("Content Plan — what the AI sees"),
      description:
        "The exact strings aidream interpolates into a content-plan page agent, plus the coverage and index-quality numbers that say what is NOT in them.",
      data: view,
      attributes: {
        site_id: siteId,
        node_id: nodeId,
        shape_shown: active,
        total: view?.total ?? null,
        full_index_offered: view?.full_index_offered ?? null,
      },
    }),
    [view, siteId, nodeId, active],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:w-[860px] sm:max-w-[860px]"
      >
        <SheetHeader>
          <SheetTitle className="text-sm">{title}</SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
          {query.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reading the plan exactly as the server assembles it…
            </div>
          ) : query.error ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-2 text-xs">
              <p className="font-medium">
                The payload could not be read, so nothing is being shown.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {extractErrorMessage(query.error)}
              </p>
            </div>
          ) : view ? (
            <>
              <CoverageBanner view={view} />

              <p className="text-[11px] leading-snug text-muted-foreground">
                Every block below is printed byte-for-byte as the server sends
                it — these are the values the{" "}
                <span className="font-mono">content_plan.family</span> provision
                offers at this call site. Which of them a given agent actually
                interpolates is a property of the agent, not of this payload:
                an offered value that the bound agent never reads is invisible
                to it, no matter how good it looks here.
              </p>

              <QualitySignals view={view} />

              <div className="flex flex-wrap items-center gap-1">
                {PAYLOAD_SHAPES.map((entry) => {
                  const body = rendered[entry.key] ?? "";
                  const empty = body.length === 0;
                  return (
                    <Button
                      key={entry.key}
                      variant={active === entry.key ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 gap-1.5 px-2 text-xs"
                      onClick={() => setShape(entry.key)}
                    >
                      {entry.title}
                      <span
                        className={cn(
                          "tabular-nums",
                          empty
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {empty ? "empty" : bytes(body)}
                      </span>
                    </Button>
                  );
                })}
                <span className="flex-1" />
                <CopyButtons
                  size="icon"
                  label="Agent payload"
                  human={() => text}
                  json={() => view}
                  agent={() => agentPayload}
                />
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs font-semibold">
                    {activeShape.title}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {activeShape.key}
                  </span>
                  {!activeShape.guaranteed ? (
                    <span className="text-[11px] text-muted-foreground">
                      not guaranteed — can arrive empty
                    </span>
                  ) : null}
                  {text ? (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {bytes(text)} · {roughTokens(text)}
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {activeShape.blurb}
                </p>
              </div>

              {text ? (
                <pre
                  className={cn(
                    "overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed",
                    BLOCK_MAX_HEIGHT,
                  )}
                >
                  {text}
                </pre>
              ) : (
                <div className="rounded-md border border-amber-400/60 bg-amber-50 px-2.5 py-2 text-xs text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">
                    This value is EMPTY. The agent receives nothing here.
                  </p>
                  <p className="mt-0.5">
                    {activeShape.scope === "node"
                      ? "It is a per-page shape and this view was opened for the whole plan, so no page was selected to build it from."
                      : "The plan is over the size threshold, so this whole-plan shape is withheld."}
                  </p>
                </div>
              )}

              {/* Structured twins — additive audit views, never the payload. */}
              {active === "plan_neighbours" ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    The same selection, structured — the audit view
                  </p>
                  <NeighbourTable view={view} />
                </div>
              ) : null}

              {active === "plan_branch_context" ? (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    The same walk, structured — the audit view
                  </p>
                  <BranchWalk view={view} />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The button that opens it. Lives wherever a human is about to trust an
 * agent's answer — the Family tab of a node, and the plan toolbar.
 */
export function AgentPayloadButton({
  siteId,
  nodeId,
  nodeRoute,
  className,
  label = "See what the AI sees",
}: {
  siteId: string | null;
  nodeId: string | null;
  nodeRoute?: string | null;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("h-6 gap-1 px-2 text-xs", className)}
        disabled={!siteId}
        onClick={() => setOpen(true)}
      >
        <Info className="h-3 w-3" />
        {label}
      </Button>
      <AgentPayloadSheet
        open={open}
        onOpenChange={setOpen}
        siteId={siteId}
        nodeId={nodeId}
        nodeRoute={nodeRoute}
      />
    </>
  );
}
