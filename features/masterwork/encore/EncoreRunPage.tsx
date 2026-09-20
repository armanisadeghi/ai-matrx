"use client";

// features/masterwork/encore/EncoreRunPage.tsx
//
// The Encore run experience for ONE released Masterwork: what it does, who
// is behind it, the input box, the live streamed run, the result, and this
// Operator's own recent runs. The run machinery is the canonical
// TryMasterworkBox (typed run start + adoptForeignStream +
// followWorkflowRunStream + refresh rejoin) — never a second renderer.
//
// Operator copy only (THE MISMATCH RULE): no "workflow", no "compile", no
// version numbers. The Expert-facing doors (Rulebook, Studio) render only
// for viewers who can actually open them.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Clock3, Rocket, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { MasterworkRunRow } from "../components/masterworks/MasterworksPage";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import { AuditionProof } from "./AuditionProof";
import {
  getBenchProof,
  ORGANIZATION_REQUIRED,
  UNAVAILABLE,
  type BenchProofState,
} from "./benchProof";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { ExpertSignOff } from "../review/ExpertSignOff";
import { MASTERWORK_RUN_SUBJECT_TYPE } from "../review/signature";
import { RunTheBench } from "./RunTheBench";
import { MasterworkRulesProvider } from "../rules-context/MasterworkRulesContext";
import { setMasterworkReleased } from "../service";
import { toast } from "@/lib/toast";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { MASTERWORK_RESULT_KIND } from "@/features/content-ir/kinds/masterwork-result";
import {
  getEncoreMasterwork,
  getEncoreRunResult,
  listMyEncoreRuns,
  type EncoreMasterwork,
  type EncoreRun,
} from "./service";

export function EncoreRunPage({ masterworkId }: { masterworkId: string }) {
  const userId = useAppSelector(selectUserId);
  const [masterwork, setMasterwork] = useState<EncoreMasterwork | null>(null);
  const [runs, setRuns] = useState<EncoreRun[]>([]);
  // 🚨 THE DELIVERABLE OPENS WHERE THE OPERATOR IS STANDING (walk 13, N10).
  // `?run=<id>` is a real address — linkable, bookmarkable, shareable — and it
  // renders the run's result through the SAME registered kind component the
  // run box uses. It replaces a link that sent a non-technical Expert to the
  // developer run page, THE PLAN / LIVE ACTIVITY and a Cancel button included.
  const router = useRouter();
  const searchParams = useSearchParams();
  const openRunId = searchParams.get("run");
  const [openRun, setOpenRun] = useState<{
    runId: string;
    result: Record<string, unknown> | null;
    state: "loading" | "ready";
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // THE PROOF is a separate question from the quick check, and it is asked out
  // loud: the panel shows the bench verdict, or says plainly there is none.
  const [bench, setBench] = useState<BenchProofState>({ status: "loading" });

  const [releasing, setReleasing] = useState(false);

  const refreshRuns = useCallback(() => {
    listMyEncoreRuns(masterworkId)
      .then(setRuns)
      .catch(() => undefined); // History is enrichment — never blanks the page.
  }, [masterworkId]);

  useEffect(() => {
    if (!openRunId) {
      setOpenRun(null);
      return;
    }
    let cancelled = false;
    setOpenRun({ runId: openRunId, result: null, state: "loading" });
    getEncoreRunResult(openRunId)
      .then((result) => {
        if (!cancelled)
          setOpenRun({ runId: openRunId, result, state: "ready" });
      })
      .catch(() => {
        // A refused read is "we could not open it", said out loud below —
        // never a blank panel and never a silent bounce back to the list.
        if (!cancelled)
          setOpenRun({ runId: openRunId, result: null, state: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [openRunId]);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const m = await getEncoreMasterwork(masterworkId);
        if (isCancelled()) return;
        setMasterwork(m);
        setError(null);
      } catch (err) {
        // NEVER swallow this — the error is what tells AccessGate whether the
        // Operator is denied, signed out, or looking at a real fault.
        if (!isCancelled()) setError(err);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [masterworkId],
  );

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  // The Bench is asked for by RULEBOOK, so it can only be asked once the
  // Masterwork has loaded. A viewer who cannot read the Rulebook gets the
  // "can't tell from here" sentence rather than a false "no proof".
  //
  // 🚨 AND IT WAITS FOR THE ORGANIZATION (production walk 4, wall W3). Every
  // Matrx transport refuses BEFORE networking when no organization is selected
  // ("Select an organization before sending this request." — the production
  // error row this wall left behind, 9ce676a8 at 02:58:27Z). This effect used
  // to fire on `rulebookId` alone, so on a fresh load it raced the boot that
  // selects the organization, ate that refusal, and rendered it as a PERMISSION
  // message to the admin reloading mid-trial. `useOrganizationRequired` is the
  // platform's one reading of that state: hold the skeleton while it resolves,
  // ask only once a request can actually be sent, and say the honest thing when
  // boot settles with no organization at all.
  const rulebookId = masterwork?.rulebook?.id ?? null;
  const { canLoad, organizationRequired, resolving } =
    useOrganizationRequired();
  const refreshBench = useCallback(() => {
    if (!rulebookId || !canLoad) return;
    void getBenchProof(rulebookId).then(setBench);
  }, [rulebookId, canLoad]);
  useEffect(() => {
    let cancelled = false;
    if (!rulebookId) {
      setBench(UNAVAILABLE);
      return;
    }
    if (organizationRequired) {
      setBench(ORGANIZATION_REQUIRED);
      return;
    }
    setBench({ status: "loading" });
    if (resolving) return; // still booting — the skeleton is the honest screen
    void getBenchProof(rulebookId).then((state) => {
      if (!cancelled) setBench(state);
    });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, organizationRequired, resolving]);

  const releaseThis = async () => {
    if (!masterwork) return;
    setReleasing(true);
    try {
      const updated = await setMasterworkReleased({
        masterworkId: masterwork.id,
        expectedVersion: masterwork.version,
        released: true,
      });
      setMasterwork((prev) =>
        prev ? { ...prev, ...updated, rulebook: prev.rulebook } : prev,
      );
      toast.success("Released — anyone you share it with can run it now.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not release this one.",
      );
    } finally {
      setReleasing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoadingSpinner />
        <span>Loading Masterwork…</span>
      </div>
    );
  }
  if (error || !masterwork) {
    // NEVER hand-write "isn't here or no access" copy. Under RLS an empty read
    // means four different things (denied · deleted · never existed · signed
    // out); AccessGate resolves the TRUE state. A Masterwork is a
    // workflow.definition row, so the workflow token resolves it.
    return (
      <AccessGate
        token="workflow"
        id={masterworkId}
        error={error}
        onRetry={() => void load(() => false)}
        fallbackHref="/masterwork/encore"
        fallbackLabel="Back to Encore"
      />
    );
  }

  const ownsRulebook =
    masterwork.rulebook !== null &&
    userId !== null &&
    masterwork.rulebook.created_by === userId;

  const isDraft = masterwork.released_at === null;

  if (isDraft && !ownsRulebook) {
    // Someone ELSE's draft never runs from here — release is what makes a
    // Masterwork other people's to run. The Expert's own draft does run (see
    // the draft notice below): sending her away from her own work is exactly
    // the dead end the cold walk hit.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This one isn&apos;t ready to run yet — the expert behind it
          hasn&apos;t released it.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/masterwork/encore">Back to Encore</Link>
        </Button>
      </div>
    );
  }

  return (
    // THE RULES IN SCOPE. The Operator holds a REFERENCE to the Rulebook, never
    // its rules — so the provider reads them, and the `masterwork_result` kind
    // component can turn a stored rule id the ruling cites into that rule's
    // name with a door to it (walk 12, D14). `rulebook` is null exactly when
    // this viewer cannot read it; then nothing resolves and the ruling renders
    // exactly as the agent wrote it.
    <MasterworkRulesProvider rulebookId={masterwork.rulebook?.id ?? null}>
      <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {masterwork.name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {masterwork.rulebook ? (
                  <Link
                    href={`/masterwork/${masterwork.rulebook.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    By {masterwork.rulebook.expert}
                  </Link>
                ) : null}
                {masterwork.rule_count !== null ? (
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] text-muted-foreground"
                  >
                    {masterwork.rule_count} rules
                  </Badge>
                ) : null}
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                  title={`Last updated ${formatAbsoluteDate(masterwork.updated_at)}`}
                >
                  <Clock3 className="h-3 w-3" />
                  {formatRelativeTime(masterwork.updated_at)}
                </span>
              </div>
            </div>
            {ownsRulebook && masterwork.rulebook ? (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Open in Studio"
              >
                <Link
                  href={`/masterwork/${masterwork.rulebook.id}/masterworks`}
                  aria-label="Open in Studio"
                >
                  <Wrench className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
          {masterwork.deliverable ? (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              <span className="text-foreground">Creates: </span>
              {masterwork.deliverable}
            </p>
          ) : null}
          {/* 🚨 YOUR OWN DRAFT RUNS, AND SAYS IT IS A DRAFT. Run it, check it,
            sign off on what it said — then release it when you are ready.
            The screen never pretends it is already shared. */}
          {isDraft ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                Draft — only you can see this one. Run it as much as you like.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={releasing}
                onClick={() => void releaseThis()}
              >
                <Rocket className="mr-1 h-3.5 w-3.5" />
                {releasing ? "Releasing…" : "Release it"}
              </Button>
            </div>
          ) : null}
          <AuditionProof
            variant="panel"
            score={masterwork.auditionScore}
            verdict={masterwork.auditionVerdict}
            auditionedAt={masterwork.auditionedAt}
            bench={bench}
          />
          {/* THE PROOF HAS A DOOR. It sits beside the quick check because that
            is the comparison being made: one is a two-arm check, the other is
            the six-arm trial that can establish a win. When the server cannot
            start one here, this renders its reason — never a dead button. */}
          {rulebookId ? (
            <RunTheBench
              rulebookId={rulebookId}
              bench={bench}
              onVerdict={refreshBench}
            />
          ) : null}

          <div className="mt-4 border-t border-border pt-4">
            <TryMasterworkBox
              masterworkId={masterwork.id}
              masterworkKind={masterwork.masterwork_kind}
              submitLabel={masterwork.submit_label}
              fieldLabels={
                masterwork.masterwork_kind === "edit"
                  ? ["Your text", "Key facts"]
                  : undefined
              }
              onRunFinished={refreshRuns}
            />
          </div>

          {runs.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Your recent runs
              </h3>
              {/* ONE RUN ROW, NOT TWO (jobs-bar-2026-09-16, item 18). This list
                used to print its own line — a dot, a status word and an age —
                so eight runs of the same Masterwork read as eight copies of
                "Finished · 1d ago" with nothing to tell them apart, while the
                Masterworks lane, three clicks away, showed the first line of
                what each run actually said. `MasterworkRunRow` is that row;
                Encore mounts it and hangs its own sign-off off `trailing`. */}
              <div className="mt-2">
                {runs.map((run) => (
                  <MasterworkRunRow
                    key={run.id}
                    run={run}
                    // The Operator's door, not the developer's.
                    href={`/masterwork/encore/${masterworkId}?run=${run.id}`}
                    trailing={
                      /* 🚨 THE SIGNATURE OUTLIVES THE RUN BOX. The Try box shows
                       the thumbs the moment a run ends, and then forgets the
                       run on purpose — so without this, an Expert who came
                       back an hour later had no way to say "yes, that one was
                       mine" and the most important signal we have was lost to
                       a page reload. Same control, same row in
                       `platform.output_feedback`. Only a FINISHED run: there
                       is nothing to sign on a run that failed. */
                      run.status === "completed" ? (
                        <ExpertSignOff
                          subjectType={MASTERWORK_RUN_SUBJECT_TYPE}
                          subjectId={run.id}
                          showPrompt={false}
                        />
                      ) : null
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </MasterworkRulesProvider>
  );
}
