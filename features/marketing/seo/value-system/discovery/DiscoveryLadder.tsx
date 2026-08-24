"use client";

/**
 * The Business Discovery Ladder (KI-040) — the screen where the six-rung
 * chain is RUN and RULED, one rung at a time.
 *
 * What this surface is: AI reads the site cold (its own crawled pages, no
 * operator input) and proposes, in order — business model → ideal customer →
 * money map → Offerings → Offering values (± from the 100 baseline) →
 * proposed setup. Every rung's result renders here from SERVER state (the
 * durable-run ledger), the human reads it, and only then runs the next rung.
 * Re-running any rung is always allowed — that is the tune-up / full-redo
 * path, and it supersedes what the later rungs will consume.
 *
 * Streaming: one durable command per rung through `useSeoCommandRun`, agent
 * output floated in `LiveRunWindow` (never a spinner while AI works).
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Loader2,
  Lock,
  Play,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import {
  DISCOVERY_STEP_ORDER,
  getDiscoveryStatus,
  type DiscoveryStepKey,
  type DiscoveryStepStatus,
} from "./data";

/**
 * `requires` is the rung's REAL prerequisite list, not its position.
 *
 * The screen used to gate every rung on "everything above it is done", which
 * was true until KI-031 added a rung that reads the site cold. Gating that one
 * behind five analyses it does not consume would have locked the door on
 * exactly the sites it exists for — the ones that have done nothing yet.
 */
const STEP_META: Record<
  DiscoveryStepKey,
  {
    title: string;
    question: string;
    agent: string;
    requires: readonly DiscoveryStepKey[];
  }
> = {
  business_model: {
    title: "1 · Business model",
    question: "What IS this business — who does it serve, which way does money flow?",
    agent: "Site Business Model Analyst",
    requires: [],
  },
  ideal_customer: {
    title: "2 · Ideal customer",
    question: "Who makes them money — and who only looks like a customer?",
    agent: "Ideal Customer Analyst",
    requires: ["business_model"],
  },
  money_map: {
    title: "3 · Money map",
    question: "Which lines earn big, which are loss leaders, which are noise?",
    agent: "Money Map Analyst",
    requires: ["business_model", "ideal_customer"],
  },
  offerings: {
    title: "4 · Offerings",
    question: "The canonical list of things this site wants traffic to reach.",
    agent: "Offering Extractor",
    requires: ["business_model", "ideal_customer", "money_map"],
  },
  offering_values: {
    title: "5 · Offering values",
    question: "Each Offering's proposed ± from the 100-point baseline.",
    agent: "Offering Valuer",
    requires: ["business_model", "ideal_customer", "money_map", "offerings"],
  },
  proposed_setup: {
    title: "6 · Proposed setup",
    question:
      "Dimensions, matchers, worths and guidelines — proposed for your approval.",
    agent: "Coming with the pack-content reshape",
    requires: ["business_model", "ideal_customer", "money_map", "offerings", "offering_values"],
  },
  guidelines_draft: {
    title: "Business guidelines",
    question:
      "The plain-text document every keyword agent reads — drafted from your site, proposed for your approval.",
    agent: "Business Guidelines Drafter",
    requires: [],
  },
};

const STAGE_LABELS: Record<string, string> = {
  "seo.discovery_step_started": "Reading the site…",
  "seo.discovery_step_completed": "Analysis complete",
};

interface StepResultDoc {
  step?: string;
  artifact?: Record<string, unknown>;
}

export function DiscoveryLadder({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ["marketing", "seo", "discovery", siteId],
    queryFn: () => getDiscoveryStatus(siteId),
    staleTime: 15_000,
  });
  const [runningStep, setRunningStep] = useState<DiscoveryStepKey | null>(null);
  const [openStep, setOpenStep] = useState<DiscoveryStepKey | null>(null);

  const run = useSeoCommandRun<StepResultDoc>({
    key: "business-discovery",
    path: "/seo/keywords/discovery/step",
    finalKind: "seo.discovery_step_completed",
    stageLabels: STAGE_LABELS,
    live: { label: "Business discovery" },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["marketing", "seo", "discovery", siteId],
    });
  }, [queryClient, siteId]);

  const launchStep = useCallback(
    async (step: DiscoveryStepKey) => {
      setRunningStep(step);
      try {
        await run.launch({ site_id: siteId, step });
        refresh();
        setOpenStep(step);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not start the step",
        );
      } finally {
        setRunningStep(null);
        refresh();
      }
    },
    [refresh, run, siteId],
  );

  const bySteps = useMemo(() => {
    const map = new Map<string, DiscoveryStepStatus>();
    for (const row of status.data?.steps ?? []) map.set(row.step, row);
    return map;
  }, [status.data]);

  if (status.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the ladder's server
        state…
      </div>
    );
  }
  if (status.isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
        Could not read discovery status —{" "}
        {status.error instanceof Error ? status.error.message : "unknown error"}
      </div>
    );
  }

  const isComplete = (step: DiscoveryStepKey) => {
    const row = bySteps.get(step);
    return row?.status === "completed" && row.artifact != null;
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5">
        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          AI reads this site cold — its own crawled pages, nothing else — and
          proposes each answer below in order. You read a rung's result, then
          run the next. Re-run any rung to redo it; later rungs consume the
          newest result. Every number in step 5 is a proposal from the 100-point
          baseline, never a final say.
        </p>
      </div>
      {DISCOVERY_STEP_ORDER.map((step) => {
        const meta = STEP_META[step];
        const row = bySteps.get(step);
        const implemented = row?.implemented ?? false;
        const completed = isComplete(step);
        const missing = meta.requires.filter((need) => !isComplete(need));
        const runnable = implemented && missing.length === 0;
        const isRunning =
          runningStep === step ||
          (run.status === "running" && runningStep === step);
        const open = openStep === step;
        const card = (
          <div
            key={step}
            className={cn(
              "rounded-lg border bg-card",
              completed ? "border-primary/30" : "border-border",
            )}
          >
            <div className="flex items-center gap-2 p-2.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setOpenStep(open ? null : step)}
                disabled={!completed}
              >
                {completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : implemented ? (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{meta.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {meta.question}
                  </span>
                </span>
                {completed ? (
                  open ? (
                    <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  )
                ) : null}
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {completed && row?.completed_at ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {new Date(row.completed_at).toLocaleString()}
                  </span>
                ) : null}
                {completed && row?.artifact ? (
                  <CopyButtons
                    size="xs"
                    label={`Discovery — ${meta.title}`}
                    human={() =>
                      humanLines(
                        Object.entries(row.artifact ?? {}).map(([k, v]) => [
                          k,
                          typeof v === "string" ? v : JSON.stringify(v),
                        ]),
                      )
                    }
                    agent={() => ({
                      kind: "seo-business-discovery-step",
                      location: webLocation("Business discovery"),
                      description: `${meta.title} — the ladder's ruled artifact for this site.`,
                      data: row.artifact,
                      attributes: { site_id: siteId, step },
                    })}
                    json={() => row.artifact}
                  />
                ) : null}
                {implemented ? (
                  <Button
                    size="sm"
                    variant={completed ? "ghost" : "default"}
                    className="h-7 gap-1 text-xs"
                    disabled={!runnable || isRunning || run.status === "running"}
                    title={
                      missing.length > 0
                        ? `This rung reads ${missing
                            .map((need) => STEP_META[need].title)
                            .join(", ")} — run those first.`
                        : completed
                          ? `Re-run ${meta.agent} — supersedes this result for later steps.`
                          : `Run ${meta.agent} on this site's pages.`
                    }
                    onClick={() => void launchStep(step)}
                  >
                    {isRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : completed ? (
                      <RotateCcw className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {isRunning ? "Running…" : completed ? "Re-run" : "Run"}
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {meta.agent}
                  </span>
                )}
              </div>
            </div>
            {open && completed && row?.artifact ? (
              <div className="border-t border-border p-2.5">
                <StepArtifact step={step} artifact={row.artifact} />
              </div>
            ) : null}
          </div>
        );
        return card;
      })}
    </div>
  );
}

/** Per-rung renderer: the decision, readable — never a JSON dump first. */
function StepArtifact({
  step,
  artifact,
}: {
  step: DiscoveryStepKey;
  artifact: Record<string, unknown>;
}) {
  const confidence =
    typeof artifact.confidence === "number" ? artifact.confidence : null;
  return (
    <div className="flex flex-col gap-2 text-xs">
      {confidence != null ? (
        <p className="text-[11px] text-muted-foreground">
          Agent confidence:{" "}
          <span className="font-medium text-foreground">{confidence}/100</span>
        </p>
      ) : null}
      {step === "business_model" ? <BusinessModelView a={artifact} /> : null}
      {step === "ideal_customer" ? <IdealCustomerView a={artifact} /> : null}
      {step === "money_map" ? <MoneyMapView a={artifact} /> : null}
      {step === "offerings" ? <OfferingsView a={artifact} /> : null}
      {step === "offering_values" ? <OfferingValuesView a={artifact} /> : null}
    </div>
  );
}

function asList(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => typeof x === "object" && x != null)
    : [];
}

function BusinessModelView({ a }: { a: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-semibold uppercase text-primary">
          {String(a.business_model ?? "?")}
        </span>{" "}
        · money flows: <span className="font-medium">{String(a.revenue_direction ?? "?")}</span>
      </p>
      <p className="text-muted-foreground">{String(a.model_explanation ?? "")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-medium">They sell / offer</p>
          {asList(a.what_they_sell).map((it, i) => (
            <p key={i} className="text-muted-foreground">
              <span className="text-foreground">{String(it.name)}</span>{" "}
              <span className="text-[10px]">({String(it.kind)})</span> —{" "}
              {String(it.description)}
            </p>
          ))}
        </div>
        <div>
          <p className="mb-1 font-medium">They buy / accept</p>
          {asList(a.what_they_buy_or_accept).map((it, i) => (
            <p key={i} className="text-muted-foreground">
              <span className="text-foreground">{String(it.name)}</span> —{" "}
              {String(it.description)}
            </p>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Audience: </span>
        {String(a.audience_notes ?? "")}
      </p>
      <details>
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          Evidence ({asList(a.evidence).length} observations)
        </summary>
        {asList(a.evidence).map((e, i) => (
          <p key={i} className="mt-1 text-muted-foreground">
            <a
              href={String(e.page_url)}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              {String(e.page_url)}
            </a>{" "}
            — {String(e.observation)}
          </p>
        ))}
      </details>
    </div>
  );
}

function IdealCustomerView({ a }: { a: Record<string, unknown> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 font-medium text-success">Ideal customers</p>
        {asList(a.ideal_customers).map((c, i) => (
          <div key={i} className="mb-2">
            <p className="font-medium">{String(c.profile)}</p>
            <p className="text-muted-foreground">{String(c.why_profitable)}</p>
            <p className="text-[10px] text-muted-foreground">
              Signals: {(c.signals as string[] | undefined)?.join(" · ")}
            </p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-1 font-medium text-warning">Tire-kickers</p>
        {asList(a.tire_kickers).map((c, i) => (
          <div key={i} className="mb-2">
            <p className="font-medium">{String(c.profile)}</p>
            <p className="text-muted-foreground">{String(c.why_low_value)}</p>
            <p className="text-[10px] text-muted-foreground">
              Signals: {(c.signals as string[] | undefined)?.join(" · ")}
            </p>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground sm:col-span-2">
        <span className="font-medium text-foreground">Targeting: </span>
        {String(a.targeting_notes ?? "")}
      </p>
    </div>
  );
}

const TIER_TONE: Record<string, string> = {
  major_earner: "bg-success/15 text-success",
  solid: "bg-primary/10 text-primary",
  minor: "bg-muted text-muted-foreground",
  loss_leader: "bg-warning/15 text-warning",
  noise: "bg-destructive/10 text-destructive",
  unclear: "bg-muted text-muted-foreground",
};

function MoneyMapView({ a }: { a: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {asList(a.lines).map((l, i) => (
        <div key={i} className="flex items-start gap-2">
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
              TIER_TONE[String(l.earn_tier)] ?? TIER_TONE.unclear,
            )}
          >
            {String(l.earn_tier).replace("_", " ")}
          </span>
          <p>
            <span className="font-medium">{String(l.name)}</span>{" "}
            <span className="text-muted-foreground">— {String(l.reasoning)}</span>
          </p>
        </div>
      ))}
      {a.model_notes ? (
        <p className="mt-1 text-muted-foreground">
          <span className="font-medium text-foreground">Would change the map: </span>
          {String(a.model_notes)}
        </p>
      ) : null}
    </div>
  );
}

function OfferingsView({ a }: { a: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {asList(a.offerings).map((o, i) => (
        <div key={i}>
          <p>
            <span className="font-medium">{String(o.name)}</span>{" "}
            <span className="text-[10px] text-muted-foreground">
              ({String(o.kind)})
            </span>{" "}
            <span className="text-muted-foreground">— {String(o.description)}</span>
          </p>
          {(o.aliases as string[] | undefined)?.length ? (
            <p className="text-[10px] text-muted-foreground">
              Also called: {(o.aliases as string[]).join(" · ")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function OfferingValuesView({ a }: { a: Record<string, unknown> }) {
  return (
    <div className="flex flex-col gap-1.5">
      {a.baseline_note ? (
        <p className="text-muted-foreground">{String(a.baseline_note)}</p>
      ) : null}
      {asList(a.valuations).map((v, i) => {
        const add = Number(v.value_add ?? 0);
        return (
          <div key={i} className="flex items-start gap-2">
            <span
              className={cn(
                "mt-0.5 w-14 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums",
                add > 0
                  ? "bg-success/15 text-success"
                  : add < 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {add > 0 ? `+${add}` : add}
            </span>
            <p>
              <span className="font-medium">{String(v.offering)}</span>{" "}
              <span className="text-muted-foreground">— {String(v.reasoning)}</span>
            </p>
          </div>
        );
      })}
      <p className="mt-1 text-[10px] text-muted-foreground">
        Proposals from the 100-point baseline — ratify or adjust them on the
        Topics screen (worth per Offering); step 6 will bring one-click adoption
        here.
      </p>
    </div>
  );
}
