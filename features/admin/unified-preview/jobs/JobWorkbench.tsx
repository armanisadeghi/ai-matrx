"use client";

/**
 * The workbench drawer — one job, opened from the board.
 *
 * Kept from the harvest (family 1, all `working-well`):
 *  - ISSUE-DRIVEN ORDERING, worst first. You read what the thing IS, then what
 *    is wrong with it, then the machinery (`MandateDetailPanel.tsx:1526-1639`).
 *  - THE REBIND GUARD — an impact preflight on every holder swap, loud and
 *    never blocking (`useGuardedRebind.tsx:65-209`).
 *  - THE PRECEDENCE RIBBON, reused verbatim from
 *    `features/agents/mandates/components/MandateResolutionRibbon.tsx`.
 *
 * New here, because it exists NOWHERE in the product today (harvest gap #9):
 *  - THE GOAL EDITOR. The frozen triad's first element has no management
 *    surface anywhere; the workspace literally prints "No written goal — a
 *    registry gap worth fixing". Here it is front and centre, editable, with
 *    an H / V / A grounding badge.
 *  - The FALLBACK leg of the ribbon, with a door to the leader, and the
 *    follower count stated inside the rebind confirm.
 */

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Lock,
  Pencil,
  ShieldQuestion,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { MandateResolutionRibbon } from "@/features/agents/mandates/components/MandateResolutionRibbon";
import type { MandateResolutionLayer } from "@/features/agents/mandates/components/MandateResolutionRibbon";
import { cn } from "@/lib/utils";
import {
  findJobByKey,
  type PreviewJob,
  type PrincipalScope,
} from "./mock-data";
import {
  COVERAGE_META,
  CoverageBadge,
  GROUNDING_META,
  GroundingBadge,
  HolderChip,
  PreviewSection,
  previewToast,
} from "./preview-ui";

const INPUT_SOURCE_LABEL: Record<PreviewJob["input_source"], string> = {
  provision: "Provision — the code position's frozen manifest",
  surface_manifest: "Surface manifest — the slot's offered values",
  known_values: "Known values — the shared middle vocabulary",
  context_items: "Context items — resolved by UUID, keys as labels",
};

/** The candidate holders a rebind picker would offer. Mock, deliberately short. */
const CANDIDATE_HOLDERS = [
  { id: "cand-1", name: "SERP Intent Specialist", kind: "agent" as const },
  { id: "cand-2", name: "Intent Classification Flow", kind: "workflow" as const },
  { id: "cand-3", name: "Generalist SEO Analyst", kind: "agent" as const },
];

export function JobWorkbench({
  job,
  scope,
  onOpenJobKey,
}: {
  job: PreviewJob;
  scope: PrincipalScope;
  onOpenJobKey: (key: string) => void;
}) {
  const at = job.altitudes[scope];
  const [goalDraft, setGoalDraft] = useState(job.goal);
  const [editingGoal, setEditingGoal] = useState(false);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [preflight, setPreflight] = useState(false);

  // A different row opened into the same drawer: reset the local drafts, or the
  // previous job's goal would appear to belong to this one.
  useEffect(() => {
    setGoalDraft(job.goal);
    setEditingGoal(false);
    setCandidate(null);
    setPreflight(false);
  }, [job.id, job.goal]);

  if (!at) return null;

  const leader = at.fallback_mandate_key
    ? findJobByKey(at.fallback_mandate_key)
    : undefined;
  const followerCount = at.follower_keys.length;
  const decidingLayer: MandateResolutionLayer | null =
    at.deciding_layer === "fallback"
      ? null
      : (at.deciding_layer as MandateResolutionLayer);

  async function runRebind() {
    const chosen = CANDIDATE_HOLDERS.find((c) => c.id === candidate);
    if (!chosen) return;
    const ok = await confirm({
      title: `Rebind ${job.mandate_key} to ${chosen.name}?`,
      description:
        followerCount > 0
          ? `${followerCount} follower${followerCount === 1 ? "" : "s"} will change with it: ${at?.follower_keys.join(", ")}. Two variables map by name, one is renamed (topic → subject), none are lost.`
          : "Two variables map by name, one is renamed (topic → subject), none are lost. No other job follows this one.",
      confirmLabel: "Rebind",
      cancelLabel: "Keep the current holder",
    });
    if (ok) {
      previewToast(
        `Would rebind ${job.mandate_key}${followerCount > 0 ? ` and ${followerCount} follower${followerCount === 1 ? "" : "s"}` : ""} to ${chosen.name}.`,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      {/* ── WORST FIRST ─────────────────────────────────────────────────────
          The issue leads only when there IS one. A met job opens on its goal. */}
      {at.coverage !== "met" ? (
        <PreviewSection
          title={
            at.coverage === "unmet"
              ? "This job is unmet"
              : "This job is running on a fallback"
          }
          tone={at.coverage === "unmet" ? "danger" : "warn"}
          action={<CoverageBadge state={at.coverage} />}
        >
          <p className="text-xs leading-relaxed text-foreground/90">
            {at.issue}
          </p>
          {leader ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>Following</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 font-mono text-[11px]"
                onClick={() => onOpenJobKey(leader.mandate_key)}
                title={`Open ${leader.mandate_key} — THE DOOR LAW: a job that is following shows what it follows, and opens it.`}
              >
                {leader.mandate_key}
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          ) : null}
          <Button
            size="sm"
            className="mt-2 h-7"
            onClick={() =>
              previewToast(
                "Would open the holder picker scoped to intelligences that can produce this output kind.",
              )
            }
          >
            Bind an intelligence
          </Button>
        </PreviewSection>
      ) : null}

      {/* ── THE GOAL EDITOR ─────────────────────────────────────────────────
          The field that exists nowhere in the product today. */}
      <PreviewSection
        title="Goal"
        subtitle="What this job is for, in a sentence a non-technical expert would recognise. Frozen once set — changing it makes a different job."
        action={
          <div className="flex items-center gap-1.5">
            <GroundingBadge grounding={job.goal_grounding} />
            <Button
              size="sm"
              variant={editingGoal ? "default" : "outline"}
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                if (editingGoal) {
                  previewToast("Would save the goal and stamp it human-written.");
                }
                setEditingGoal((v) => !v);
              }}
            >
              {editingGoal ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> Save
                </>
              ) : (
                <>
                  <Pencil className="mr-1 h-3 w-3" /> Edit
                </>
              )}
            </Button>
          </div>
        }
      >
        {editingGoal ? (
          <Textarea
            value={goalDraft}
            onChange={(e) => setGoalDraft(e.target.value)}
            rows={3}
            className="text-sm"
            placeholder="Say what this job is for…"
          />
        ) : (
          <p className="text-sm leading-relaxed">{goalDraft}</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {GROUNDING_META[job.goal_grounding].label}
          {job.goal_grounding === "ai"
            ? " Saving an edit here promotes it to human-written."
            : ""}
        </p>
      </PreviewSection>

      <Tabs defaultValue="workbench">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="workbench">Workbench</TabsTrigger>
          <TabsTrigger value="bench">Test bench</TabsTrigger>
          <TabsTrigger value="drift">Drift</TabsTrigger>
        </TabsList>

        <TabsContent value="workbench" className="mt-3 flex flex-col gap-3">
          {/* ── THE FROZEN TRIAD ────────────────────────────────────────── */}
          <PreviewSection
            title="The frozen triad"
            subtitle="Goal, output kind and input contract are this job's identity. Everything behind the contract is swappable; these three are not."
          >
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { label: "Goal", value: goalDraft, mono: false },
                { label: "Output kind", value: job.output_kind, mono: true },
                {
                  label: "Input source",
                  value: INPUT_SOURCE_LABEL[job.input_source],
                  mono: false,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-border bg-muted/30 p-2"
                >
                  <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Lock className="h-2.5 w-2.5" />
                    {item.label}
                  </dt>
                  <dd
                    className={cn(
                      "mt-1 text-xs leading-snug",
                      item.mono && "font-mono",
                    )}
                  >
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Consumption — which offered or known values the holder actually
              uses — is per-binding and freely different. It is not part of the
              triad.
            </p>
          </PreviewSection>

          {/* ── THE PRECEDENCE RIBBON, WITH ITS FALLBACK LEG ─────────────── */}
          <PreviewSection
            title="Who decides"
            subtitle="Highest precedence first. The fallback is not a layer — it is what answers when no layer decided at all."
          >
            <MandateResolutionRibbon
              provenance={decidingLayer ?? undefined}
              className="bg-card"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11.5px] ring-1 ring-inset",
                  at.deciding_layer === "fallback"
                    ? "bg-amber-500/15 font-semibold text-amber-700 ring-amber-500/40 dark:text-amber-400"
                    : "bg-card text-muted-foreground ring-border/40",
                )}
                title="A mandate may name another mandate as its fallback. It self-dissolves the moment a real intelligence is assigned."
              >
                Fallback
              </span>
              {leader ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 font-mono text-[11px]"
                  onClick={() => onOpenJobKey(leader.mandate_key)}
                >
                  {leader.mandate_key}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {at.coverage === "unmet"
                    ? "no fallback named — this is why it errors"
                    : "not in use; an explicit intelligence is assigned"}
                </span>
              )}
            </div>
            {followerCount > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {followerCount} job
                  {followerCount === 1 ? "" : "s"} follow this one as their
                  fallback. Rebinding here moves {followerCount === 1 ? "it" : "them"} too:{" "}
                  {at.follower_keys.map((key, i) => (
                    <span key={key}>
                      {i > 0 ? ", " : ""}
                      <button
                        type="button"
                        className="font-mono underline underline-offset-2"
                        onClick={() => onOpenJobKey(key)}
                      >
                        {key}
                      </button>
                    </span>
                  ))}
                </span>
              </p>
            ) : null}
          </PreviewSection>

          {/* ── THE GUARDED REBIND ──────────────────────────────────────── */}
          <PreviewSection
            title="Rebind the holder"
            subtitle="Every swap runs an impact preflight first. Loud, itemised, and never blocking — you are told what breaks, then you decide."
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Currently</span>
                <HolderChip at={at} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CANDIDATE_HOLDERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCandidate(c.id);
                      setPreflight(false);
                    }}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      candidate === c.id
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    {c.name}
                    <span className="ml-1.5 text-[10px] uppercase text-muted-foreground">
                      {c.kind}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={!candidate}
                  onClick={() => setPreflight(true)}
                >
                  <ShieldQuestion className="mr-1.5 h-3.5 w-3.5" />
                  Run impact preflight
                </Button>
                <Button
                  size="sm"
                  className="h-7"
                  disabled={!preflight}
                  onClick={runRebind}
                >
                  Rebind…
                </Button>
              </div>

              {preflight ? (
                <div className="rounded-lg border border-border bg-muted/30 p-2 text-xs">
                  <div className="mb-1.5 font-medium">Impact preflight</div>
                  <ul className="flex flex-col gap-1">
                    <li className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        <span className="font-mono">keywords</span>,{" "}
                        <span className="font-mono">locale</span> — map by name.
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        <span className="font-mono">topic</span> → the holder
                        declares <span className="font-mono">subject</span>.
                        Renamed automatically; confirm it means the same thing.
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0 text-rose-600 dark:text-rose-400" />
                      <span>
                        {followerCount > 0 ? (
                          <>
                            <strong>
                              {followerCount} follower
                              {followerCount === 1 ? "" : "s"} will change
                            </strong>{" "}
                            with this rebind —{" "}
                            {at.follower_keys.join(", ")}.
                          </>
                        ) : (
                          <>
                            No job follows this one. The blast radius is this
                            job alone.
                          </>
                        )}
                      </span>
                    </li>
                  </ul>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1.5 h-6 px-2 text-[11px]"
                    onClick={() =>
                      previewToast(
                        "Would copy a paste-ready fix brief: the mismatch, the code truth, the call sites, and the four legal fixes.",
                      )
                    }
                  >
                    Copy fix brief for AI
                  </Button>
                </div>
              ) : null}
            </div>
          </PreviewSection>

          {/* ── FACTS ───────────────────────────────────────────────────── */}
          <PreviewSection title="Where this job meets a place">
            <div className="flex flex-wrap gap-1.5">
              {job.places.map((place) => (
                <Badge
                  key={place}
                  variant="outline"
                  className="font-mono text-[10px]"
                >
                  {place}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {job.discovery === "referenced"
                ? "REFERENCED — a position in code or a surface slot names this key. The provision is that place's frozen manifest, and the normal path needs no user input."
                : job.discovery === "discovered"
                  ? "DISCOVERED — nothing names this job. It binds to known values by identity and appears wherever the keys it needs exist. Places acquire it; it never requires a place."
                  : "BOTH — code references this key AND it is discovered wherever its keys exist. One mandate may be both."}
            </p>
          </PreviewSection>
        </TabsContent>

        <TabsContent value="bench" className="mt-3 flex flex-col gap-3">
          <PreviewSection
            title="Baseline vs candidate"
            subtitle="Every saved exemplar runs through the current setup plus any candidate configurations, in one batch."
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Exemplar</th>
                    <th className="py-1 pr-3 font-medium">Baseline</th>
                    <th className="py-1 pr-3 font-medium">Candidate A</th>
                    <th className="py-1 font-medium">Candidate B</th>
                  </tr>
                </thead>
                <tbody className="[&_td]:py-1.5 [&_td]:pr-3">
                  {[
                    ["Long-tail batch (240 rows)", "ran · 8.2s", "ran · 5.1s", "wrong structure"],
                    ["Non-English keywords", "ran · 9.7s", "ran · 6.0s", "ran · 7.4s"],
                    ["Empty input guard", "failed", "ran · 0.4s", "ran · 0.5s"],
                  ].map(([name, a, b, c]) => (
                    <tr key={name} className="border-b border-border/50">
                      <td className="font-medium">{name}</td>
                      <td className="text-muted-foreground">{a}</td>
                      <td className="text-muted-foreground">{b}</td>
                      <td className="text-muted-foreground">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7"
              onClick={() =>
                previewToast(
                  "Would run every exemplar through the baseline and both candidate columns in one batch.",
                )
              }
            >
              Run comparison
            </Button>
          </PreviewSection>
          <PreviewSection
            title="Try it now"
            subtitle="A cold-start ad-hoc run against a scaffolded typed form. No exemplar required; a good run becomes the first test case in one click."
          >
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
              The typed input form for{" "}
              <span className="font-mono">{job.output_kind}</span> renders here,
              scaffolded from the pinned version&apos;s declarations.
            </div>
          </PreviewSection>
        </TabsContent>

        <TabsContent value="drift" className="mt-3 flex flex-col gap-3">
          <PreviewSection
            title="Version drift"
            subtitle="Running v4 → newest v7. Both remedies are offered here, at the drift, with what each one costs."
            tone="warn"
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="mb-1 font-medium">Running — v4</div>
                <p className="text-muted-foreground">
                  Declares <span className="font-mono">keywords</span>,{" "}
                  <span className="font-mono">locale</span>,{" "}
                  <span className="font-mono">topic</span>.
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-2">
                <div className="mb-1 font-medium">Newest — v7</div>
                <p className="text-muted-foreground">
                  Declares <span className="font-mono">keywords</span>,{" "}
                  <span className="font-mono">locale</span>,{" "}
                  <span className="font-mono">subject</span>.
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() =>
                  previewToast("Would move the pin from v4 to v7 for this job only.")
                }
              >
                Bump the pin to v7
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() =>
                  previewToast(
                    "Would drop the pin so this job always tracks the newest version.",
                  )
                }
              >
                Stop pinning, follow latest
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() =>
                  previewToast("Would arm AND run the v4-vs-v7 comparison on the bench.")
                }
              >
                Test old vs new first
              </Button>
            </div>
          </PreviewSection>
          <PreviewSection title="Code ↔ holder drift">
            <p className="text-xs text-muted-foreground">
              The code that calls this job offers{" "}
              <span className="font-mono">keywords, locale, topic</span>; the
              bound holder declares{" "}
              <span className="font-mono">keywords, locale, subject</span>. Four
              named remedies would appear here — never a guess.
            </p>
          </PreviewSection>
        </TabsContent>
      </Tabs>

      <p className="px-1 text-[11px] italic text-muted-foreground">
        Preview — every control on this page reports what it would do and
        changes nothing. Coverage at this altitude:{" "}
        {COVERAGE_META[at.coverage].label.toLowerCase()}.
      </p>
    </div>
  );
}
