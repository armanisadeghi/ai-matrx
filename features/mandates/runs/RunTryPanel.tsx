"use client";

// features/mandates/runs/RunTryPanel.tsx — RIGHT side of the Runs tab: the
// selected run's exact values against a holder picked HERE. The picker is the
// Binding tab's own `HolderAssignment` (purpose "pick" — nothing is ever
// saved), model/settings are the Overrides tab's `RunConfigOverrides` over a
// local overrides instance. On pick → `POST /mandates/{key}/placement` →
// PlacementTable; Run → `POST /ai/mandates/{key}` with `test_holder`, streamed.

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { PropertyRow } from "@ai-matrx/design-system/controls";
import { HolderAssignment } from "@/features/bindings/HolderAssignment";
import type { HolderDraft } from "@/features/bindings/ScopeHolderBar";
import { JOB_OVERRIDE_WORDS } from "@/features/bindings/words";
import { resolveAgentVersionId, fetchAgentVersionSnapshot } from "@/features/agents/redux/builder-versions.thunks";
import { fetchAgentExecutionFull } from "@/features/agents/redux/builder-tier.thunks";
import { selectAgentCustomExecutionPayload } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  initInstanceOverrides,
  removeInstanceOverrides,
  updateBaseSettings,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectSettingsOverridesForApi,
} from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { buildInstanceBaseSettings } from "@ai-matrx/chat/agents/redux/execution-system/instance-model-overrides/base-settings";
import { RunConfigOverrides } from "@ai-matrx/chat/agents/components/run-controls/RunConfigOverrides";
import { isJsonObject, toJsonRecord, type JsonObject, type JsonValue } from "@/types/json";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { PlacementTable } from "./PlacementTable";
import { RunSectionTitle, StoredRunGate } from "./RunAsItHappened";
import { StreamedRunBlock } from "./RunFacts";
import { previewPlacement, streamTestRun, type PlacementPreview, type StoredRun, type TestHolder } from "./service";
import type { StoredRunState } from "./useStoredRun";
import { useStreamedRun } from "./useStreamedRun";

function draftOf(run: StoredRun): HolderDraft {
  const h = run.placement?.holder ?? run.holder;
  return h.type === "workflow"
    ? { kind: "workflow", agentId: null, agentVersionId: null, useLatest: true, workflowId: h.id, workflowVersionId: h.versionId }
    : { kind: "agent", agentId: h.id, agentVersionId: h.versionId, useLatest: !h.versionId, workflowId: null };
}

function testHolderOf(draft: HolderDraft): TestHolder | null {
  if (draft.kind === "workflow") {
    return draft.workflowId ? { type: "workflow", id: draft.workflowId, version_id: draft.workflowVersionId ?? null } : null;
  }
  return draft.agentId ? { type: "agent", id: draft.agentId, version_id: draft.useLatest ? null : draft.agentVersionId } : null;
}

/** The run's supplied values by provision name; an old run supplies what it delivered. */
function provisionValuesOf(run: StoredRun): JsonObject {
  const out: Record<string, JsonValue> = {};
  for (const p of run.provisions) if (p.value !== undefined) out[p.name] = p.value;
  if (Object.keys(out).length === 0 && run.delivered) Object.assign(out, run.delivered.variables);
  return out;
}

/** The overrides as JSON, read back from their serialized form (a stable effect key). */
function jsonObjectOf(serialized: string): JsonObject {
  const parsed: unknown = JSON.parse(serialized);
  return isJsonObject(parsed as JsonValue) ? toJsonRecord(parsed as JsonObject) : {};
}

/** The picked agent's own settings as the overrides baseline (the Overrides tab's read). */
function useTryOverrides(overridesId: string, draft: HolderDraft) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const ready = useAppSelector((s) => Boolean(selectInstanceOverrideState(overridesId)(s)));
  const agentId = draft.kind === "agent" ? draft.agentId : null;
  const versionId = draft.kind === "agent" && !draft.useLatest ? draft.agentVersionId : null;

  useEffect(() => () => void dispatch(removeInstanceOverrides(overridesId)), [dispatch, overridesId]);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setError(null);
    void (async () => {
      let referenceId = agentId;
      if (versionId) {
        const version = await dispatch(resolveAgentVersionId(versionId)).unwrap();
        if (!version) throw new Error("Selected version unavailable");
        await dispatch(fetchAgentVersionSnapshot({ agentId: version.agentId, version: version.versionNumber })).unwrap();
        referenceId = versionId;
      } else {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
      }
      if (cancelled) return;
      const payload = selectAgentCustomExecutionPayload(store.getState(), referenceId);
      if (!payload.isReady) throw new Error("Agent settings unavailable");
      const baseSettings = buildInstanceBaseSettings(payload.settings, payload.modelId);
      if (selectInstanceOverrideState(overridesId)(store.getState())) {
        dispatch(updateBaseSettings({ conversationId: overridesId, baseSettings }));
      } else {
        dispatch(initInstanceOverrides({ conversationId: overridesId, baseSettings }));
      }
    })().catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : "Agent settings unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, store, overridesId, agentId, versionId]);

  return { ready: Boolean(agentId) && ready, error };
}

export function RunTryPanel(props: {
  stored: StoredRunState;
  mandateKey: string;
  outputKind: string | null;
  audience: "admin" | "product";
}) {
  return (
    <StoredRunGate stored={props.stored}>
      {(run) => <TryWithRun key={run.conversationId} run={run} {...props} />}
    </StoredRunGate>
  );
}

function TryWithRun({
  run,
  mandateKey,
  outputKind,
  audience,
}: {
  run: StoredRun;
  mandateKey: string;
  outputKind: string | null;
  audience: "admin" | "product";
}) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<HolderDraft>(() => draftOf(run));
  const overridesId = `mandate-runs-try-${run.conversationId}`;
  const overrides = useTryOverrides(overridesId, draft);
  const overridesKey = JSON.stringify(useAppSelector(selectSettingsOverridesForApi(overridesId)) ?? {});
  const configOverrides = jsonObjectOf(overridesKey);
  const holder = testHolderOf(draft);
  const provisions = provisionValuesOf(run);
  const [preview, setPreview] = useState<PlacementPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const tryRun = useStreamedRun();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const holder = testHolderOf(draft);
    const provisions = provisionValuesOf(run);
    const configOverrides = jsonObjectOf(overridesKey);
    if (!holder) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setPreviewError(null);
    const timer = setTimeout(() => {
      previewPlacement(dispatch, mandateKey, { provisions, holder, configOverrides })
        .then((next) => {
          if (!cancelled) setPreview(next);
        })
        .catch((e: unknown) => {
          if (!cancelled) setPreviewError(e instanceof Error ? e.message : "The placement could not be read.");
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dispatch, mandateKey, draft, run, overridesKey]);

  const blocked = preview?.problems.some((p) => p.severity === "error") ?? false;

  return (
    <div>
      <RunSectionTitle>Try a new intelligence</RunSectionTitle>
      <HolderAssignment
        holder={draft}
        onHolderChange={setDraft}
        holderName={run.holder.name}
        mandateKey={mandateKey as AnyMandateKey}
        outputKind={outputKind}
        purpose="pick"
        consumerId={`mandate-runs-pick-${mandateKey}`}
      />

      <RunSectionTitle>Model and settings</RunSectionTitle>
      {draft.kind === "workflow" ? (
        <PropertyRow label="Model" value="Set by the workflow" />
      ) : !draft.agentId ? (
        <PropertyRow label="Model" value="Pick an agent" />
      ) : overrides.error ? (
        <p className="flex items-center gap-1 text-[12px] text-destructive">
          {overrides.error}
          <ErrorAlchemyMenu error={overrides.error} operation="Read the agent settings" />
        </p>
      ) : overrides.ready ? (
        // One line by default — the agent's own settings, or how many are changed; the full
        // Overrides table opens on request (it is twelve rows nobody needs to read to run).
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">
              {Object.keys(configOverrides).length === 0
                ? "The agent's own model and settings"
                : `${Object.keys(configOverrides).length} changed from the agent's settings`}
            </span>
            <Button variant="quiet" onClick={() => setSettingsOpen((o) => !o)}>
              {settingsOpen ? "Hide" : "Change"}
            </Button>
          </div>
          {settingsOpen ? (
            <RunConfigOverrides
              conversationId={overridesId}
              words={{ ...JOB_OVERRIDE_WORDS, modelEmptyChoiceLabel: "Agent's model" }}
              structured
            />
          ) : null}
        </div>
      ) : (
        <RegionSkeleton shape="form" count={2} aria-label="Reading the agent settings" />
      )}

      <RunSectionTitle>Placement</RunSectionTitle>
      {!holder ? (
        <p className="text-[12px] text-muted-foreground">Pick an agent or workflow</p>
      ) : previewError ? (
        <p className="flex items-center gap-1 text-[12px] text-destructive">
          {previewError}
          <ErrorAlchemyMenu error={previewError} operation="Preview the placement" />
        </p>
      ) : preview ? (
        <div className={previewing ? "opacity-60" : undefined}>
          <PlacementTable
            label="Placement for the picked holder"
            placement={preview.placement}
            // The values the preview was sent — a run without saved placement has none of its
            // own provisions, so the table reads the same values the server placed.
            values={
              run.provisions.length > 0
                ? run.provisions
                : Object.entries(provisions).map(([name, value]) => ({ name, kind: null, value, truncated: false }))
            }
            problems={preview.problems}
          />
        </div>
      ) : (
        <RegionSkeleton shape="rows" count={4} aria-label="Reading the placement" />
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          icon={<Play />}
          variant="primary"
          disabled={!holder || tryRun.running}
          title={blocked ? "A red problem above may stop this run" : "Runs the model once and stores a test run"}
          onClick={() =>
            holder &&
            void tryRun.start((d, onAdopted) =>
              streamTestRun(
                d,
                mandateKey,
                { provisions, holder, configOverrides, userInput: run.delivered?.userInput ?? null },
                onAdopted,
              ),
            )
          }
        >
          {tryRun.running ? "Running…" : "Run"}
        </Button>
      </div>
      <div className="mt-2">
        <StreamedRunBlock label="Test run" state={tryRun} original={run} audience={audience} />
      </div>
    </div>
  );
}
