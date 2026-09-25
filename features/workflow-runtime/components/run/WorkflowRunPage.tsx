"use client";

/**
 * WorkflowRunPage — the `(core)` body behind BOTH run routes:
 *   /workflows/[id]          → set it up, run it, watch it (`?run=` on start)
 *   /workflows/runs/[runId]  → the permalink for a run that already exists
 *
 * One component because they are one experience seen from two doors: the only
 * difference is which end of the pair is known up front, and each resolves the
 * other (a run knows its definition; a definition mints a run). A mid-run
 * refresh therefore always lands back on the live run — never on a blank form.
 *
 * Route conformance: chrome lives in `RouteHeader` (shell header center), the
 * body wrapper is `h-full overflow-hidden` with ONE inner scroll area, and
 * content flows behind the glass header. No in-body title bar.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, PenLine, RotateCcw } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { TapTargetButton } from "@ai-matrx/tap-target";
import { toast } from "@/lib/toast";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
  getDefaultSurface,
} from "../../surface/service";
import type { RunSurfaceConfig } from "../../surface/config";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { RunStartForm } from "../RunStartForm";
import { RunStage } from "./RunStage";
import { MasterworkRulesProvider } from "@/features/masterwork/rules-context/MasterworkRulesContext";
import { replaceAddressOrNavigate } from "@/lib/url-state/addressWithoutNavigating";

interface LoadedWorkflow {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig | null;
}

/** The calm, honest first paint — never a bare "Loading…" string. */
function LoadingBody() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 py-3 sm:px-5 sm:py-4">
      <div className="h-32 animate-pulse rounded-2xl bg-muted/60" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    </div>
  );
}

export function WorkflowRunPage({
  definitionId: definitionIdProp,
  runId: runIdProp,
}: {
  /** Known on /workflows/[id]; resolved from the run on the permalink. */
  definitionId?: string;
  /** Known on the permalink; carried in `?run=` on /workflows/[id]. */
  runId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = runIdProp ?? searchParams.get("run") ?? null;

  const [definitionId, setDefinitionId] = useState<string | null>(
    definitionIdProp ?? null,
  );
  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  // The one record this page is about could not be shown — which record (the
  // run on the permalink, else the workflow) and the read error, if any. The
  // canonical access gate decides what to say.
  const [failure, setFailure] = useState<{
    token: "workflow" | "workflow_run";
    id: string;
    error?: unknown;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryLoad = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);
  const [showForm, setShowForm] = useState(false);

  // A run permalink knows its definition — that is how a `?run=` deep link and
  // a mid-run refresh restore the workflow they were started from.
  useEffect(() => {
    if (definitionId || !runId) return;
    let cancelled = false;
    void fetchRunDefinitionId(runId)
      .then((id) => {
        if (cancelled) return;
        // No row = the run is gone or not this viewer's; left unhandled this
        // was a skeleton forever.
        if (id) setDefinitionId(id);
        else setFailure({ token: "workflow_run", id: runId });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure({ token: "workflow_run", id: runId, error });
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, runId, attempt]);

  useEffect(() => {
    if (!definitionId) return;
    let cancelled = false;
    void Promise.all([
      fetchWorkflowDefinition(definitionId),
      // A workflow with no authored surface is not a broken workflow — the
      // stage derives one from the definition, so this failing is never fatal.
      getDefaultSurface(definitionId, {
        audience: "consumer",
        profile: "full",
      }).catch(() => null),
    ])
      .then(([loaded, surface]) => {
        if (cancelled) return;
        if (!loaded) {
          setFailure({ token: "workflow", id: definitionId });
          return;
        }
        setWorkflow({
          id: loaded.id,
          name: loaded.name,
          definition: loaded.definition,
          config: surface?.config ?? null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure({ token: "workflow", id: definitionId, error });
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, attempt]);

  /**
   * ADOPTED (Volley 5): a started run is announced by ID, whichever branch of
   * the form started it. The served branch calls the contract's own start verb
   * (it alone may stamp `input_sources`) and hands the id back here; the legacy
   * branch hands back derived `node_inputs` for `begin` to start. One landing
   * for both, so the URL and the toast can never diverge by branch.
   */
  const adopt = useCallback(
    (started: string) => {
      if (!definitionId) return;
      setShowForm(false);
      toast.success("Off it goes.");
      // The run id rides the URL so a refresh re-adopts and resumes.
      replaceAddressOrNavigate(router, `/workflows/${definitionId}?run=${started}`);
    },
    [definitionId, router],
  );

  /**
   * "Run it again" always returns to the start surface. What a workflow asks
   * for is the SERVED surface's answer, and there is no client-side derivation
   * of it left anywhere — so the page never guesses in order to skip the form.
   * A workflow that asks for nothing shows one button and one click, which the
   * form itself renders.
   */
  const runAgain = useCallback(() => {
    if (!definitionId) return;
    setShowForm(true);
    replaceAddressOrNavigate(router, `/workflows/${definitionId}`);
  }, [definitionId, router]);

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton
            href="/workflows/all"
            ariaLabel="All workflows"
          />
          <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
            {workflow?.name ?? "Workflow"}
          </span>
        </div>
      }
      right={
        <div className="flex items-center">
          {runId ? (
            <TapTargetButton
              icon={<RotateCcw />}
              ariaLabel="Run it again"
              onClick={runAgain}
            />
          ) : null}
          {definitionId ? (
            <TapTargetButton
              icon={<CalendarClock />}
              ariaLabel="Run it without me"
              href={`/workflows/${definitionId}/triggers`}
            />
          ) : null}
          {definitionId ? (
            <TapTargetButton
              icon={<PenLine />}
              ariaLabel="Design this workflow"
              href={`/workflows/${definitionId}/design`}
            />
          ) : null}
        </div>
      }
    />
  );

  let body: React.ReactNode;
  if (failure) {
    body = (
      <AccessGate
        token={failure.token}
        id={failure.id}
        error={failure.error}
        onRetry={retryLoad}
        fallbackHref="/workflows/all"
        fallbackLabel="Your workflows"
      />
    );
  } else if (!workflow) {
    body = <LoadingBody />;
  } else if (runId && !showForm) {
    body = (
      <RunStage
        runId={runId}
        definitionId={workflow.id}
        definition={workflow.definition}
        workflowName={workflow.name}
        config={workflow.config}
        onRetry={runAgain}
      />
    );
  } else {
    body = (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {workflow.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell it what to work with, then press Run.
        </p>
        <div className="mt-5">
          <RunStartForm
            definitionId={workflow.id}
            startLabel="Run it"
            onStarted={adopt}
            onCancel={() => {
              if (runId) setShowForm(false);
              else router.push("/workflows/all");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    // 🚨 A MASTERWORK'S RULEBOOK TRAVELS WITH ITS RUN (walk 13, N3). This page
    // draws the same `masterwork_result` component every other surface draws,
    // and it drew it with no rules in scope — so a ruling that cites the
    // Expert's own rules printed twelve raw ids here. The provider resolves the
    // Rulebook from the run itself (run → definition →
    // metadata.built_from_rulebook) and answers null for every run that is not
    // a Masterwork, which costs one read and changes nothing else on this page.
    <MasterworkRulesProvider runId={runId}>
      {header}
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          {body}
        </div>
      </div>
    </MasterworkRulesProvider>
  );
}
