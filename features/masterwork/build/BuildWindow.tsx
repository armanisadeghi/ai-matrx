"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Hammer,
  Layers,
  PenLine,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { LiveRunProgress } from "@/features/agents/components/live-run/LiveRunProgress";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import { getRulebook } from "../service";
import type { Rulebook } from "../types";
import { emitBuildEvent } from "./callbacks";
import { useBuildRun, type MasterworkKind } from "./useBuildRun";

/**
 * BUILD A MASTERWORK — the payoff moment of the whole product, on a window
 * panel instead of a blocking modal.
 *
 * ## Why this file exists (Arman, 2026-08-18)
 *
 * > "you're telling me all of it's gonna render inside of that shitty little
 * > fucking model that blocks the page … and just has so much fucking text
 * > that it shits on itself every time it moves."
 *
 * He had already ruled once, on 2026-08-17: *"I hate these blocking freaking
 * models… it should be a window panel. Look at how project-new works."* The
 * Add-rule surface was converted then; the Build — the moment hours of expert
 * work becomes a working system — was left in a `sm:max-w-lg` dialog whose
 * live progress was hand-drawn `<p>` lines in a 192px scroller.
 *
 * ## The three laws this obeys
 *
 * 1. **THE FLOATING LAW.** The Build now lives on a `WindowPanel`: draggable,
 *    resizable, minimisable, survivable. The page behind it stays usable while
 *    the Build runs, and a Build that outlives a refresh is rejoined by the
 *    durable-run pointer rather than lost.
 * 2. **The canonical renderer.** Progress renders through `LiveRunProgress` —
 *    stable rows updating in place. The Build emits no tokens (see
 *    `useBuildRun`), so `MarkdownStream` is the wrong half of the law here;
 *    nothing in this file parses, buckets, or routes a stream.
 * 3. **No dead ends.** The finished Masterwork is not a success line. It is a
 *    set of real doors — open it in the studio, see it beside its siblings,
 *    see the Rulebook it was built from — and it is RUNNABLE right here
 *    through the canonical `TryMasterworkBox`, in a frame with room.
 */

const OVERLAY_ID = "masterworkBuildWindow";

/** How many rules this Masterwork will actually be built from. */
function liveRuleCount(rulebook: Rulebook): number {
  return rulebook.rules.filter((r) => !r.draft && !r.retired).length;
}

/**
 * Which shape to recommend, from the Expert's OWN intake answer. A goal that
 * describes producing something ("a system that finds…", "writes…") wants the
 * system to do the work; a goal about reviewing/checking existing work wants
 * the reviewer. Ties go to reviewing, which is the cheaper thing to try first.
 */
function recommendKind(rulebook: Rulebook): MasterworkKind {
  const goal = String(
    (rulebook.metadata as { intake?: { goal?: unknown } } | null)?.intake?.goal ??
      rulebook.description ??
      "",
  ).toLowerCase();
  if (!goal) return "edit";
  const reviewWords =
    /\b(review|check|audit|proofread|edit|correct|critique|grade|score|evaluate)\b/;
  const produceWords =
    /\b(write|writes|writing|create|creates|draft|drafts|generate|generates|produce|produces|find|finds|build|builds|plan|plans|system that)\b/;
  const wantsReview = reviewWords.test(goal);
  const wantsProduce = produceWords.test(goal);
  if (wantsProduce && !wantsReview) return "generate";
  return "edit";
}

export interface BuildWindowProps {
  isOpen: boolean;
  onClose: () => void;
  rulebookId: string;
  callbackGroupId?: string | null;
}

export default function BuildWindow({
  isOpen,
  onClose,
  rulebookId,
  callbackGroupId,
}: BuildWindowProps) {
  if (!isOpen || !rulebookId) return null;
  return (
    <BuildWindowInner
      onClose={onClose}
      rulebookId={rulebookId}
      callbackGroupId={callbackGroupId ?? null}
    />
  );
}

function BuildWindowInner({
  onClose,
  rulebookId,
  callbackGroupId,
}: {
  onClose: () => void;
  rulebookId: string;
  callbackGroupId: string | null;
}) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<MasterworkKind | null>(null);
  const [name, setName] = useState("");
  const [deliverable, setDeliverable] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getRulebook(rulebookId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setLoadError("That Rulebook isn't there any more.");
          return;
        }
        setRulebook(row);
        setKind((current) => current ?? recommendKind(row));
      })
      .catch(() => {
        if (!cancelled) setLoadError("We couldn't load that Rulebook.");
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  const recommended = rulebook ? recommendKind(rulebook) : "edit";
  const chosenKind: MasterworkKind = kind ?? recommended;
  const fallbackName = rulebook ? `${rulebook.name} Masterwork` : "Your Masterwork";
  const runLabel = name.trim() || fallbackName;

  const run = useBuildRun(rulebookId, runLabel);
  const { running, result, progress, error } = run;

  // The Rulebook page's Masterworks list must reflect a Build that finished
  // while the Expert was on another page — not only one they watched finish.
  const announcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!result || announcedRef.current === result.workflowId) return;
    announcedRef.current = result.workflowId;
    emitBuildEvent(callbackGroupId, {
      type: "built",
      workflowId: result.workflowId,
      name: result.name,
      masterworkKind: result.masterworkKind,
    });
  }, [result, callbackGroupId]);

  // Emit window-close exactly once, on unmount — covers X, Esc, programmatic.
  const groupRef = useRef(callbackGroupId);
  useEffect(() => {
    groupRef.current = callbackGroupId;
  }, [callbackGroupId]);
  useEffect(
    () => () => {
      emitBuildEvent(groupRef.current, { type: "window-close" });
    },
    [],
  );

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const build = useCallback(() => {
    run.launch(
      {
        rulebook_id: rulebookId,
        masterwork_kind: chosenKind,
        name: name.trim() || undefined,
        deliverable:
          chosenKind === "generate" ? deliverable.trim() || undefined : undefined,
      },
      runLabel,
    );
  }, [run, rulebookId, chosenKind, name, deliverable, runLabel]);

  const approvedCount = useMemo(
    () => (rulebook ? liveRuleCount(rulebook) : 0),
    [rulebook],
  );

  // ── Body ─────────────────────────────────────────────────────────────────
  const body = (() => {
    if (loadError) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      );
    }
    if (!rulebook) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </div>
      );
    }

    // ── Built. Real doors, and it runs right here. ─────────────────────────
    if (result) {
      const studioHref = `${WORKFLOWS_APP_URL}/workflows/${result.workflowId}`;
      return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-base font-medium text-foreground">
                “{result.name}” is ready.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Built from your {approvedCount} approved{" "}
                {approvedCount === 1 ? "rule" : "rules"} in {rulebook.name}
                {result.agentCount > 0
                  ? `, as ${result.agentCount} working ${result.agentCount === 1 ? "part" : "parts"}`
                  : ""}
                . It does{" "}
                {result.masterworkKind === "generate"
                  ? "the work for you"
                  : "the reviewing and fixing"}
                , every time, the way you said.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={studioHref} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight className="h-4 w-4" />
                    Open it in the studio
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link
                    href={`/masterwork/${rulebook.id}/masterworks`}
                    target="_blank"
                  >
                    <Layers className="h-4 w-4" />
                    All Masterworks from this Rulebook
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/masterwork/${rulebook.id}`} target="_blank">
                    <BookOpen className="h-4 w-4" />
                    See what it was built from
                  </Link>
                </Button>
              </div>
            </div>

            {/* Run it. Here. Now. The SAME canonical run box the Masterworks
                page and Encore use — never a second run surface. */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                Try it right now
              </p>
              <TryMasterworkBox
                masterworkId={result.workflowId}
                masterworkKind={result.masterworkKind}
                whatItRuns={`“${result.name}”`}
                onRunFinished={() => undefined}
              />
            </div>
          </div>
        </div>
      );
    }

    // ── Building. The canonical non-token renderer. ────────────────────────
    if (progress) {
      return (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LiveRunProgress progress={progress} />
        </div>
      );
    }

    // ── Setup. ─────────────────────────────────────────────────────────────
    return (
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Building from{" "}
              <span className="font-medium text-foreground">
                {approvedCount} approved {approvedCount === 1 ? "rule" : "rules"}
              </span>{" "}
              in {rulebook.name}. Every one of them is applied and checked, every
              time it runs.
            </p>
          </div>

          <div className="space-y-2">
            <Label>What should it do for you?</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <KindCard
                icon={<PenLine className="mb-1 h-4 w-4 text-muted-foreground" />}
                title="Review work and fix it"
                body="You give it something already written. It finds everything that breaks your rules, fixes it, and shows you what it changed and why."
                selected={chosenKind === "edit"}
                recommended={recommended === "edit"}
                onSelect={() => setKind("edit")}
              />
              <KindCard
                icon={<Hammer className="mb-1 h-4 w-4 text-muted-foreground" />}
                title="Do the work for you"
                body="You tell it the job. It does the work following your rules, checks its own work against them, and hands you the version that holds up."
                selected={chosenKind === "generate"}
                recommended={recommended === "generate"}
                onSelect={() => setKind("generate")}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended from what you told us at the start. Change it any time
              — you can build the other one too.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="masterwork-name">Give it a name (optional)</Label>
            <Input
              id="masterwork-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={fallbackName}
            />
          </div>

          {chosenKind === "generate" ? (
            <div className="space-y-1.5">
              <Label htmlFor="masterwork-deliverable">What should it make?</Label>
              <ProTextarea
                id="masterwork-deliverable"
                value={deliverable}
                onChange={(e) => setDeliverable(e.target.value)}
                placeholder="e.g. a keyword plan for one page, advertising copy, a patient letter…"
                rows={3}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  })();

  // ── Footer: ONE row of primary actions. ──────────────────────────────────
  const footer = (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 px-2 py-1.5">
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {result
          ? "Built. It is saved and yours — this window can go."
          : running
            ? run.rejoining
              ? "Picking this Build back up — it kept running while you were away."
              : "Building. You can keep working; this keeps going without you."
            : `Turns ${approvedCount} approved ${approvedCount === 1 ? "rule" : "rules"} into a working system.`}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {result ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => run.reset()}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Build another
            </Button>
            <Button size="sm" className="h-7" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-7"
            onClick={build}
            disabled={running || !rulebook || approvedCount === 0}
          >
            <Hammer className="h-3.5 w-3.5" />
            {running ? "Building…" : "Build the Masterwork"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <WindowPanel
      id="masterwork-build-window"
      overlayId={OVERLAY_ID}
      titleNode={
        <span className="flex min-w-0 items-center gap-1.5">
          <Hammer className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">
            Build a Masterwork
            {rulebook ? ` from “${rulebook.name}”` : ""}
          </span>
        </span>
      }
      width={880}
      height={760}
      minWidth={360}
      minHeight={420}
      footer={footer}
      footerVariant="rich"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          A working system that does this job the way you do it. It keeps
          running on our servers — move this window, shrink it, reload the page,
          go somewhere else; it comes back to where it got to.
        </p>
        {body}
      </div>
    </WindowPanel>
  );
}

function KindCard({
  icon,
  title,
  body,
  selected,
  recommended,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent/40",
      )}
    >
      {icon}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {recommended ? (
          <span className="rounded border border-primary/40 px-1 py-0 text-[10px] text-primary">
            Recommended
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
    </button>
  );
}
