"use client";

// features/make/describe/DescribeBox.tsx — the describe box on /make: ONE GUIDED RUN (lane MAKE-WORKS).
//
// "When I go to /make and I tell it exactly what I want, there isn't a solid workflow that runs and gets
// it done for me properly." (Arman, 2026-10-09). Champions: Notion AI "build me a workspace", Airtable's
// AI app builder. What a person sees now:
//   1. the PLAN, the instant they press Make it (plan.ts reads the route from their words — no model):
//      data-shaped → template builder; page-shaped → Space Builder; both → the Space, then the template
//      builder reusing the Space's tables;
//   2. each step in plain words, with its own clock; every model run streams in the platform's floating
//      LiveRunWindow (never a spinner while AI works);
//   3. the result OPENS — a Space is opened; a data setup offers one Open and the list of what was made;
//   4. up to three one-line follow-ups that run through this same box (the template builder reuses what
//      exists, so a follow-up extends, never duplicates);
//   5. a failure names its step and Try again RESUMES from that step — a designed spec is never designed
//      twice, a built Space is never built twice.
//
// THE DOORS (no second builder): mandate `make.describe_template` (headless JSON → the store's
// describeCheck → custom.template_declare('org') → the gallery's runTemplateDoor) and the Spaces door
// `useSpaceBuild` (mandate `spaces.build`). Mandates are launched by key; this file writes no instruction.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleDashed, CircleX } from "lucide-react";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, type TemplateDoorAnswer } from "@ai-matrx/records/templates";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useFloatingAgentRun } from "@ai-matrx/chat/agents/hooks/useFloatingAgentRun";
import { HeadlessAgentRunError } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { SpaceBuildRefused, useSpaceBuild, type SpaceBuildOutcome } from "@/features/spaces/embed/useSpaceBuild";
import * as doors from "@/features/unified-data/hub/doors";
import { createClient } from "@/utils/supabase/client";
import { enterSendsHere } from "@ai-matrx/kit/composer-keys";
import { cn } from "@/lib/utils";
import { Landing } from "../gallery/TemplateGallery";
import { hrefForMade, openableMade, type MadeObject } from "../gallery/catalogue";
import { templatePreviewHref } from "../gallery/galleryHref";

import { secondsWords } from "./made";
import { followUpsFor, planFor, STEP_WORDS, type MakePlan, type MakeStepId } from "./plan";
import {
  AnswerRefused,
  bindReuses,
  declareDescribeSpec,
  DesignRefused,
  describeVariables,
  findBuiltSpace,
  readExistingTables,
  readDesign,
  readOrganizationFacts,
  type ReadDesign,
} from "./describeTemplate";

import { ProTextarea } from "@/components/official/ProTextarea";
import { keepRun, keptRun, newRequestKey, stampOf } from "./runStore";
// What the person reads when a step fails — plain, no internal words; the reason is in the console.
const WRITTEN_WRONG = "That did not come out right. Try again, or say it a little differently.";
const STOPPED = "That stopped before it finished. Try again.";

const DESCRIBE = MANDATE_KEYS.make__describe_template;
const DESCRIBE_DISCLOSURE = [{ mandateKey: DESCRIBE, does: "turns your sentence into tables, forms and a booking page" }] as const;

type StepState = "waiting" | "doing" | "done" | "failed";

/** A Space step started earlier is looked for this long before a second build is allowed to start. */
const SPACE_WAIT_MS = 3 * 60_000;
const SPACE_LOOK_EVERY_MS = 10_000;
const SPACE_RUN_MS = 12 * 60_000;

/**
 * One guided run. What each finished step produced is kept — in state and in this browser (runStore) — so Try again,
 * a reload or a paused tab resumes where it stopped and never starts a second build for the same press.
 */
interface Run {
  /** The request key: one per press of Make it. The one-off template is declared under it. */
  key: string;
  sentence: string;
  organizationId: string;
  plan: MakePlan;
  startedAt: number;
  endedAt: number | null;
  step: Partial<Record<MakeStepId, { state: StepState; at: number; ms?: number }>>;
  space: SpaceBuildOutcome | null;
  templateId: string | null;
  install: TemplateDoorAnswer | null;
  notes: string[];
  failed: { at: MakeStepId; why: string } | null;
  /** The first design was refused by the check and designed once more on its own. */
  redesigned?: boolean;
}

/** The run's one word for the page and for timing runs (data-make-describe). */
function phaseOf(run: Run | null): "idle" | "running" | "installed" | "failed" {
  if (!run) return "idle";
  if (run.failed) return "failed";
  return run.endedAt ? "installed" : "running";
}

export function DescribeBox() {
  // org-filter: write-target what the sentence makes is created in the organization new things go to; its tables are read only to reuse them
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const router = useRouter();
  const writer = useFloatingAgentRun({ instanceId: "make-describe" });
  const spaces = useSpaceBuild();
  useDeclaredSurfaceMandates(DESCRIBE_DISCLOSURE);
  const [sentence, setSentence] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [askOrganization, setAskOrganization] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // A press before the organization has loaded is KEPT, not dropped: it runs the moment the organization is ready.
  const [kept, setKept] = useState<string | null>(null);
  // The request key being driven right now: a second drive of the same run in this page is refused.
  const driving = useRef<string | null>(null);
  const phase = phaseOf(run);
  const busy = phase === "running";
  useEffect(() => {
    if (!busy) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [busy]);

  /** Drive the run from its first unfinished step. `from` is a new run or a failed one being resumed. */
  const drive = async (from: Run) => {
    if (driving.current === from.key) return;
    driving.current = from.key;
    let r: Run = { ...from, failed: null, endedAt: null };
    const commit = (next: Run) => {
      r = next;
      setRun(next);
      keepRun(next);
    };
    const mark = (id: MakeStepId, state: StepState) => {
      const was = r.step[id];
      const t = Date.now();
      commit({ ...r, step: { ...r.step, [id]: { state, at: was?.state === "doing" ? was.at : t, ms: state === "done" || state === "failed" ? t - (was?.at ?? t) : undefined } } });
    };
    let current: MakeStepId = r.plan.steps[0]!;
    try {
      const client = createClient();
      const source = supabaseDataSource(client);
      for (const id of r.plan.steps) {
        current = id;
        if (r.step[id]?.state === "done") continue;
        // When this step was started before (a reload, a paused tab, Try again), the server may have finished it already.
        const startedBefore = r.step[id]?.at ?? null;
        mark(id, "doing");
        if (id === "space") {
          const adopted = startedBefore ? await awaitBuiltSpace(client, r.organizationId, startedBefore) : null;
          const built =
            adopted ??
            (await spaces.build({ request: r.sentence, organizationId: r.organizationId, label: "Building your workspace" }));
          commit({ ...r, space: built });
        } else if (id === "design") {
          const [facts, listed] = await Promise.all([readOrganizationFacts(client, r.organizationId), doors.dataHomeTables(source, r.organizationId)]);
          // The Space's own tables first: the builder reuses them instead of making a second copy.
          const fromSpace = new Set(r.space?.tableIds ?? []);
          const own = listed.ok
            ? // org-filter: server-call the setup is built in this organization, so only its own tables are reused
              listed.data
                .filter((t) => t.organization_id === r.organizationId && t.kind === "table" && !t.platform_owned)
                .map((t) => ({ id: t.table_id, name: t.table_name }))
                .sort((a, b) => Number(fromSpace.has(b.id)) - Number(fromSpace.has(a.id)))
            : [];
          const tables = await readExistingTables(client, r.organizationId, own);
          for (let attempt = 0; attempt < 2; attempt++) {
            let design: ReadDesign;
            try {
              // readDesign is the run's coerce: a refused answer (unreadable, or refused by the store's check) fails the run itself.
              design = await writer.run<ReadDesign>({
                mandateKey: DESCRIBE,
                label: "Designing your tables and forms",
                surfaceKey: "make:describe",
                sourceFeature: "udt",
                expect: "json",
                initiation: "user",
                organizationId: r.organizationId,
                variables: describeVariables(r.sentence, facts, tables),
                coerce: (v) => readDesign(v, tables),
              });
            } catch (e) {
              // ONE automatic second design before the person is asked: a refused design costs one more model run,
              // never a press. The second refusal is said plainly and Try again designs afresh.
              if (!(e instanceof DesignRefused) || attempt === 1) throw e;
              commit({ ...r, redesigned: true, step: { ...r.step, design: undefined, check: undefined } });
              current = "design";
              mark("design", "doing");
              continue;
            }
            mark("design", "done");
            current = "check";
            mark("check", "doing");
            const { answer, safe, checked } = design;
            // The request key names the template: a second declare for this press updates the same one, never a second.
            const templateId = await declareDescribeSpec(client, r.organizationId, bindReuses(checked.spec, safe.reuses, tables), stampOf(r.key));
            commit({ ...r, templateId, notes: [...answer.notes, ...safe.notes, ...checked.autoFixes] });
            mark("check", "done");
            break;
          }
          continue;
        } else if (id === "check") {
          // Reached only on a resume whose design finished but whose check failed: design again.
          commit({ ...r, step: { ...r.step, design: undefined, check: undefined } });
          throw new Error("The design did not pass the check");
        } else if (id === "build") {
          const done = await runTemplateDoor(source, "template_install", r.organizationId, r.templateId!, {
            onCall: (a) => commit({ ...r, install: a }),
          });
          if (!done.ok || !done.answer) {
            const refusal = done.answer?.refusal as { message?: string } | null | undefined;
            commit({ ...r, install: done.answer ?? r.install });
            // access-errors: ok — carried to the console only; the person reads the plain STOPPED sentence
            throw new Error(refusal?.message ?? done.error?.message ?? "the install door answered nothing");
          }
          commit({ ...r, install: done.answer });
        }
        mark(id, "done");
      }
      commit({ ...r, endedAt: Date.now() });
      // A workspace is the home of everything made: open it.
      if (r.space?.url) router.push(r.space.url);
    } catch (err: unknown) {
      // The technical reason goes to the console; the person gets a plain sentence. The Space door's own
      // errors are already written for a person ("Build with AI is not available here").
      console.error(`[make:describe] the ${current} step failed`, err, (err as { detail?: string } | null)?.detail);
      const why =
        err instanceof AnswerRefused || err instanceof HeadlessAgentRunError || err instanceof DesignRefused
          ? WRITTEN_WRONG
          : err instanceof SpaceBuildRefused
            ? err.message
            : STOPPED;
      mark(current, "failed");
      commit({ ...r, failed: { at: current, why } });
    } finally {
      if (driving.current === from.key) driving.current = null;
    }
  };

  const start = (words = sentence) => {
    const said = words.trim();
    if (!said || busy) return;
    if (!organizationId) {
      setAskOrganization(true);
      setKept(said);
      return;
    }
    setAskOrganization(false);
    const startedAt = Date.now();
    setNow(startedAt);
    void drive({
      key: newRequestKey(),
      sentence: said,
      organizationId,
      plan: planFor(said),
      startedAt,
      endedAt: null,
      step: {},
      space: null,
      templateId: null,
      install: null,
      notes: [],
      failed: null,
    });
  };

  // REATTACH: a run this browser was driving when the page went away is picked up where it stopped (never started
  // again); a finished or failed one from the last half hour is shown as it ended.
  const reattached = useRef<string | null>(null);
  useEffect(() => {
    if (!organizationId || reattached.current === organizationId) return;
    reattached.current = organizationId;
    const found = keptRun<Run>(organizationId);
    if (!found) return;
    if (found.inFlight) void drive(found.run);
    else setRun(found.run);
    // drive is recreated each render; the run is reattached once per organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    if (kept && organizationId) {
      setKept(null);
      start(kept);
    }
    // `kept` is cleared before the run starts, so a press runs exactly once.
  }, [kept, organizationId, start]);

  // A check failure re-designs; anything else resumes at the step that failed.
  const resume = () => {
    if (!run?.failed) return;
    const redesign = run.failed.at === "check";
    void drive({ ...run, step: redesign ? { ...run.step, design: undefined, check: undefined } : run.step, templateId: redesign ? null : run.templateId });
  };

  const made = (run?.install?.made ?? []) as MadeObject[];
  const firstOpen = openableMade(made).find((m) => m.kind === "table") ?? openableMade(made)[0];
  const openHref = run?.space?.url ?? (firstOpen ? hrefForMade(firstOpen) : null);
  const followUps = phase === "installed" && run ? followUpsFor(run.sentence, run.plan.route, made) : [];

  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-describe" data-make-describe={phase} data-make-route={run?.plan.route}>
      <h2 id="make-describe" className="sr-only">
        Describe it
      </h2>
      <ProTextarea
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        onSubmit={() => start()}
        submitOnEnter={enterSendsHere(true)}
        submitLabel="Make it"
        isSubmitting={busy}
        placeholder="A patient intake form that books the first visit"
        aria-label="Describe what to make"
        rows={3}
        disabled={busy}
        enableTextStats={false}
        data-make-describe-input=""
      />

      {askOrganization && !organizationId ? (
        <OrganizationContextNotice
          state={active.organizationState === "ready" ? "required" : active.organizationState}
          what="What you describe"
          description="New things are saved in the organization you choose"
          compact
        />
      ) : null}

      {run ? (
        <ol className="flex flex-col gap-1 text-sm" aria-live="polite" data-make-run-steps={run.plan.steps.join(",")}>
          {run.plan.steps.map((id) => {
            const s = run.step[id];
            const state: StepState = id === "open" && phase === "installed" ? "done" : (s?.state ?? "waiting");
            const clock = state === "doing" && s ? secondsWords(now - s.at) : state === "done" && s?.ms != null && s.ms > 1500 ? secondsWords(s.ms) : null;
            return (
              <li key={id} className="flex min-w-0 items-center gap-2" data-make-run-step={id} data-state={state}>
                {state === "done" ? (
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                ) : state === "doing" ? (
                  <Spinner size="xs" className="shrink-0" />
                ) : state === "failed" ? (
                  <CircleX className="h-4 w-4 shrink-0 text-destructive" />
                ) : (
                  <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className={cn("truncate", state === "waiting" && "text-muted-foreground")}>{STEP_WORDS[id]}</span>
                {id === "build" && state === "doing" && run.install?.steps ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{`${Math.min(run.install.next_step ?? 0, run.install.steps as number)} of ${run.install.steps}`}</span>
                ) : null}
                {id === "design" && run.redesigned ? <span className="shrink-0 text-xs text-muted-foreground">2nd try</span> : null}
                {clock ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{clock}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      {phase === "installed" && run ? (
        <div className="flex flex-col gap-2" data-make-describe-result="" data-make-describe-ms={(run.endedAt ?? now) - run.startedAt}>
          <div className="flex flex-wrap items-center gap-2">
            {openHref ? (
              <Button asChild data-make-run-open="">
                <Link href={openHref}>{run.space?.url ? "Open your workspace" : "Open"}</Link>
              </Button>
            ) : null}
            <span className="text-sm text-muted-foreground">{`Made in ${secondsWords((run.endedAt ?? now) - run.startedAt)}`}</span>
          </div>
          {run.space?.summary ? <p className="line-clamp-2 text-sm text-muted-foreground">{run.space.summary}</p> : null}
          {made.length ? <Landing made={made} /> : null}
          <Notes notes={run.notes} />
          {followUps.length ? (
            <div className="flex flex-wrap gap-2" data-make-followups={followUps.length}>
              {followUps.map((f) => (
                <Button
                  key={f}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSentence(f);
                    start(f);
                  }}
                  data-make-followup=""
                >
                  {f}
                </Button>
              ))}
            </div>
          ) : null}
          {run.templateId ? (
            <Link href={templatePreviewHref(run.templateId)} className="text-sm text-primary underline-offset-2 hover:underline" data-make-describe-template="">
              Remove or save as a template
            </Link>
          ) : null}
        </div>
      ) : null}

      {phase === "failed" && run?.failed ? (
        <div className="flex flex-col gap-2" role="alert" data-make-describe-refusal="" data-make-failed-at={run.failed.at}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-destructive">{run.failed.why}</p>
            <Button type="button" variant="outline" onClick={resume} data-make-describe-retry="">
              Try again
            </Button>
          </div>
          {run.space?.url ? (
            <Link href={run.space.url} className="text-sm text-primary underline-offset-2 hover:underline">
              Open the workspace that was built
            </Link>
          ) : null}
          {run.templateId && run.install ? (
            <Link href={templatePreviewHref(run.templateId)} className="text-sm text-primary underline-offset-2 hover:underline">
              Remove what was made
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The mandate's assumptions, one line each — what it decided for the person. */
function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-make-describe-notes={notes.length}>
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

/**
 * The Space a step started at `since` built, waited for: looked for at once, then every 10 s for up to three minutes while
 * that build could still be running on the server. Null when none landed — only then may a new build start.
 */
async function awaitBuiltSpace(client: ReturnType<typeof createClient>, organizationId: string, since: number): Promise<SpaceBuildOutcome | null> {
  const until = Math.min(Date.now() + SPACE_WAIT_MS, since + SPACE_RUN_MS);
  for (;;) {
    const found = await findBuiltSpace(client, organizationId, since);
    if (found) return { summary: found.title, rootSpaceId: found.id, url: `/spaces/${found.id}`, spaceIds: [found.id], tableIds: [] };
    if (Date.now() + SPACE_LOOK_EVERY_MS > until) return null;
    await new Promise((resolve) => setTimeout(resolve, SPACE_LOOK_EVERY_MS));
  }
}
