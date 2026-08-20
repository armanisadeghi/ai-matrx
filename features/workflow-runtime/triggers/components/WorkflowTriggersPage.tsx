"use client";

/**
 * WorkflowTriggersPage — the `(core)` body behind /workflows/[id]/triggers:
 * how this workflow runs when you are not here.
 *
 * The whole server stack behind it (trigger CRUD, the webhook fire endpoint,
 * the `CronWatcher` inside the deployed workflow worker) has been live and
 * idle since it was built — it had no door. This is the door. Nothing here
 * schedules anything itself; a second scheduler would be the defect.
 *
 * Route conformance: chrome in `RouteHeader`, body `h-full overflow-hidden`
 * with ONE inner scroll area, content flowing behind the glass header.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, KeyRound, Plus } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { toast } from "@/lib/toast";

import { fetchWorkflowDefinition } from "../../surface/service";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import type { CreateTriggerArgs } from "../useWorkflowTriggers";
import { useWorkflowTriggers } from "../useWorkflowTriggers";
import { CopyableValue } from "./CopyableValue";
import { NewTriggerForm } from "./NewTriggerForm";
import { TriggerCard } from "./TriggerCard";

interface LoadedWorkflow {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
}

export function WorkflowTriggersPage({
  definitionId,
}: {
  definitionId: string;
}) {
  const router = useRouter();
  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * The plaintext webhook secret, held ONLY in component state for the one
   * moment it exists. The server never returns it again — not in Redux, not in
   * storage, not in a URL.
   */
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const {
    triggers,
    loading,
    loadError: triggersError,
    busyId,
    creating,
    create,
    setActive,
    remove,
    fireNow,
    listFires,
  } = useWorkflowTriggers(definitionId);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkflowDefinition(definitionId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setLoadError(
            "This workflow could not be opened. It may have been removed, or it belongs to another account.",
          );
          return;
        }
        setWorkflow({
          id: loaded.id,
          name: loaded.name,
          definition: loaded.definition,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("This workflow could not be opened.");
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  const onCreate = useCallback(
    (args: CreateTriggerArgs, plaintextSecret: string | null) => {
      void create(args).then((created) => {
        if (!created) return;
        setAdding(false);
        if (plaintextSecret) setFreshSecret(plaintextSecret);
        toast.success(
          created.kind === "cron"
            ? "It'll run on its own from now on."
            : "Its address is ready.",
        );
      });
    },
    [create],
  );

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton
            href={`/workflows/${definitionId}`}
            ariaLabel="Back to this workflow"
          />
          <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
            {workflow?.name ?? "Workflow"}
          </span>
        </div>
      }
      right={
        <TapTargetButton
          icon={<Plus />}
          ariaLabel="Add another way to run it"
          onClick={() => setAdding(true)}
        />
      }
    />
  );

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h1 className="text-base font-semibold text-foreground">
            We couldn&apos;t open this
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => router.push("/workflows/all")}
            className="mt-4 inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Back to your workflows
          </button>
        </div>
      </div>
    );
  } else if (!workflow) {
    body = (
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted/60" />
        <div className="h-24 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  } else {
    body = (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Run it without me
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set {workflow.name} to run on a schedule, or let another tool start
            it. Everything it produces lands where your other runs do.
          </p>
        </div>

        {freshSecret ? (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <KeyRound className="h-4 w-4" />
              Copy this password now
            </p>
            <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
              This is the only time it can be shown. Whoever calls the address
              needs it. If it&apos;s lost, remove that entry and make a new one.
            </p>
            <CopyableValue value={freshSecret} label="Password" />
            <button
              type="button"
              onClick={() => setFreshSecret(null)}
              className="mt-2 min-h-8 rounded-md border border-border px-2.5 text-xs text-foreground"
            >
              I&apos;ve saved it
            </button>
          </div>
        ) : null}

        {adding ? (
          <NewTriggerForm
            definitionId={definitionId}
            definition={workflow.definition}
            workflowName={workflow.name}
            creating={creating}
            onCreate={onCreate}
            onCancel={() => setAdding(false)}
          />
        ) : null}

        {triggersError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
            {triggersError}
          </p>
        ) : loading ? (
          <div className="space-y-2">
            <div className="h-20 animate-pulse rounded-xl bg-muted/50" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          </div>
        ) : triggers.length === 0 ? (
          !adding ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center">
              <CalendarClock className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Right now it only runs when you press Run.
              </p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Give it a schedule and it will do the work before you ask —
                every morning, every Monday, or whenever suits you.
              </p>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
              >
                <Plus className="h-4 w-4" />
                Set one up
              </button>
            </div>
          ) : null
        ) : (
          <div className="space-y-2">
            {triggers.map((trigger) => (
              <TriggerCard
                key={trigger.id}
                trigger={trigger}
                busy={busyId === trigger.id}
                onSetActive={(next) => void setActive(trigger.id, next)}
                onDelete={() => void remove(trigger.id)}
                onFireNow={() => {
                  void fireNow(trigger.id).then((runId) => {
                    if (!runId) return;
                    toast.success("Off it goes.");
                    router.push(`/workflows/runs/${runId}`);
                  });
                }}
                loadFires={listFires}
              />
            ))}
            {!adding ? (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-foreground"
              >
                <Plus className="h-4 w-4" />
                Add another
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          {body}
        </div>
      </div>
    </>
  );
}
