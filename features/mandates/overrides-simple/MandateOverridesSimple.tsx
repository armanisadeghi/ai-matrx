"use client";

/**
 * MandateOverridesSimple — the simple Overrides tab for one mandate.
 *
 * Arman, 2026-09-24, on the existing tab: *"All it's really doing is showing
 * you what the current agent's settings are and then letting you override
 * them."* So that is all this does: one list of the agent's settings, each
 * with an Override button that turns the row into its editor.
 *
 * It is a SIBLING of the existing tab (`OneBindingWorkspace` → RunConfigOverrides),
 * which stays untouched. Same data, same writer:
 *   · the draft lives in the canonical `instanceModelOverrides` slice, seeded
 *     with the agent's own settings (plus anything a higher level already
 *     overrides) exactly as the existing tab seeds it;
 *   · Save builds the body with `buildBindingSavePayload` and writes it through
 *     `putMandateBinding` — the stored holder, mapping and auto-run are sent
 *     back unchanged, and `config_overrides` is `selectSettingsOverridesForApi`.
 */

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { isJsonObject, type JsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  fetchAgentExecutionFull,
  fetchAgentVersionSnapshot,
  resolveAgentVersionId,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentCustomExecutionPayload,
  selectBuiltinAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  initInstanceOverrides,
  markRemoved,
  removeInstanceOverrides,
  replaceOverrides,
  resetOverride,
  setOverrides,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { buildInstanceBaseSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/base-settings";
import {
  fetchModelById,
  selectAllModels,
  selectModelFullyLoaded,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { useModelControls } from "@/features/agents/hooks/useModelControls";
import { buildSettingsRows } from "@/lib/redux/slices/agent-settings/settings-catalogue";
import type { ControlDefinition } from "@/lib/redux/slices/agent-settings/types";
import { SettingControlInput } from "@/features/agents/components/settings-management/controls/SettingControlInput";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { fetchMandateLadder } from "@/features/mandates/workspace/useMandateLadder";
import {
  inheritedModelOverrides,
  MODEL_OVERRIDE_SOURCE,
} from "@/features/bindings/inherited-model-overrides";
import { parseBindingWave1 } from "@/features/mandates/provision-shapes";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import { describedOfferFrom } from "@/features/bindings/described-offer";
import { buildBindingSavePayload } from "@/features/mandates/workspace/save-payload";
import {
  putMandateBinding,
  putMandateDefaultHolder,
} from "@/features/mandates/overrides";
import { defaultAnswerSettingsOf } from "@/features/bindings/system-answer-record";
import {
  SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL,
  systemRungHolderIsPersonal,
} from "@/features/bindings/system-rung";
import { DEFAULT_HOLDER_RUNG } from "@/features/bindings/default-holder-rung";
import { GlobalBindAgentGuard } from "@/features/surfaces/components/bind/GlobalBindAgentGuard";
import { describeFailure } from "@/lib/failure/transport";
import type { WorkspaceRung } from "@/features/bindings/ScopeHolderBar";
import type {
  MandateBindingRowDb,
  MandateWorkspaceData,
} from "@/features/mandates/workspace/useMandateWorkspaceData";
import {
  defaultHolderDraftOf,
  effectiveAgentId,
  findBinding,
  holderChoiceForSave,
  holderDraftOf,
  overridesHolderOf,
  rungForLevel,
  withoutUnpicked,
  type OverridesLevel,
  type ResolvedHolderForOverrides,
} from "./binding-lookup";
import { agentSettingDisplay } from "./format-setting-value";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export type {
  OverridesLevel,
  ResolvedHolderForOverrides,
} from "./binding-lookup";

export interface MandateOverridesSimpleProps {
  data: MandateWorkspaceData;
  /** Which level's overrides this edits — the workspace's own perspective. */
  level: OverridesLevel;
  /** Required for `level="organization"`: the organization being edited. */
  organizationId?: string | null;
  /** Called after a successful save so the host re-reads the mandate. */
  onChanged: () => void;
  /**
   * Who runs this job for the viewer today (the server's verdict). Used when
   * this level names no holder of its own — the usual case for a person — so
   * the tab shows the settings of the agent that actually runs. Omitted on
   * the system level, which is the bottom of the ladder.
   */
  resolvedHolder?: ResolvedHolderForOverrides | null;
}

/**
 * Keyed to the exact stored row it edits, so a save (which moves
 * `updated_at`) re-seeds the draft from what the server now holds.
 */
export function MandateOverridesSimple({
  data,
  level,
  organizationId = null,
  onChanged,
  resolvedHolder = null,
}: MandateOverridesSimpleProps) {
  const userId = useAppSelector(selectUserId);
  const rung = rungForLevel(level, data);
  const orgId = level === "organization" ? organizationId : null;
  const binding = findBinding(data.bindings, rung, userId, orgId);
  const resolvedKey =
    resolvedHolder?.status === "ready"
      ? `${resolvedHolder.agentId}:${resolvedHolder.versionId ?? ""}`
      : (resolvedHolder?.status ?? "");
  // On the bottom rung the edited row IS the definition, so its `updated_at`
  // is what a save moves.
  const identity = `${data.mandate.id}:${rung}:${orgId ?? ""}:${binding?.id ?? "new"}:${binding?.updated_at ?? (rung === DEFAULT_HOLDER_RUNG ? (data.mandate.updated_at ?? "") : "")}:${resolvedKey}`;
  return (
    <OverridesBody
      key={identity}
      data={data}
      level={level}
      rung={rung}
      organizationId={orgId}
      binding={binding}
      onChanged={onChanged}
      resolvedHolder={resolvedHolder}
    />
  );
}

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

const deepEqual = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Key-order-independent serialization, for "is there anything unsaved?". */
function stableJson(value: Record<string, unknown> | null | undefined): string {
  if (!value) return "{}";
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = value[key];
  return JSON.stringify(sorted);
}

function OverridesBody({
  data,
  level,
  rung,
  organizationId,
  binding,
  onChanged,
  resolvedHolder,
}: {
  data: MandateWorkspaceData;
  level: OverridesLevel;
  rung: WorkspaceRung;
  organizationId: string | null;
  binding: MandateBindingRowDb | null;
  onChanged: () => void;
  resolvedHolder: ResolvedHolderForOverrides | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const activeOrganizationId = useAppSelector(selectOrganizationId);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  const { organizations } = useUserOrganizations();

  const ownHolder =
    rung === DEFAULT_HOLDER_RUNG
      ? defaultHolderDraftOf(data.mandate)
      : holderDraftOf(binding);
  // This level usually names nobody (a person rarely picks their own agent):
  // then the agent that actually runs — from a lower rung — is the one whose
  // settings are shown and overridden.
  const picked = overridesHolderOf(ownHolder, rung, data, resolvedHolder);
  const holder =
    picked.source === "own" || picked.source === "resolved"
      ? picked.holder
      : ownHolder;
  const inheritedHolder = picked.source === "resolved";
  const agentId =
    picked.source === "own" || picked.source === "resolved"
      ? effectiveAgentId(holder, data)
      : null;
  const selectedVersionId = holder.useLatest ? null : holder.agentVersionId;
  // The row the settings live on: the job's own default on the system level
  // (aidream 1037), the level's binding everywhere else.
  const settingsRow =
    rung === DEFAULT_HOLDER_RUNG
      ? defaultAnswerSettingsOf(data.mandate)
      : binding;
  const storedOverrides: JsonObject | null = isJsonObject(
    settingsRow?.config_overrides,
  )
    ? settingsRow.config_overrides
    : null;
  const storedJson = JSON.stringify(storedOverrides);

  // Its own scratch entry — never shared with the existing tab's draft.
  const instanceId = `mandate-overrides-simple-${data.mandate.id}-${rung}-${organizationId ?? "self"}`;
  const entry = useAppSelector(selectInstanceOverrideState(instanceId));
  const wireJson = useAppSelector((s) =>
    stableJson(selectSettingsOverridesForApi(instanceId)(s)),
  );

  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [holderSettings, setHolderSettings] = useState<Record<string, unknown>>(
    {},
  );
  const [sources, setSources] = useState<Record<string, string>>({});
  const [savedJson, setSavedJson] = useState<string>("{}");
  /** Rows the person opened with "Override" but has not changed yet. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [guardOpen, setGuardOpen] = useState(false);

  useEffect(
    () => () => {
      dispatch(removeInstanceOverrides(instanceId));
    },
    [dispatch, instanceId],
  );

  // ── Seed: the agent's own settings, plus what higher levels override ──────
  // Same sequence as the existing tab (OneBindingWorkspace "Settings
  // overrides"), so both show the same baseline for the same row.
  const inheritanceOrganizationId =
    rung === "org" ? organizationId : activeOrganizationId;
  useEffect(() => {
    if (holder.kind !== "agent" || !agentId) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    void (async () => {
      let referenceId = agentId;
      if (selectedVersionId) {
        const version = await dispatch(
          resolveAgentVersionId(selectedVersionId),
        ).unwrap();
        if (!version)
          throw new Error("The pinned agent version is unavailable.");
        await dispatch(
          fetchAgentVersionSnapshot({
            agentId: version.agentId,
            version: version.versionNumber,
          }),
        ).unwrap();
        referenceId = selectedVersionId;
      } else {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
      }
      if (cancelled) return;
      const payload = selectAgentCustomExecutionPayload(
        store.getState(),
        referenceId,
      );
      if (!payload.isReady)
        throw new Error("The agent's settings could not be read.");
      const own = buildInstanceBaseSettings(payload.settings, payload.modelId);
      // The org level reads ITS organization's rung, so it needs one. The
      // person level never waits on an organization: without one the ladder
      // simply has no organization rung.
      if (rung === "org" && !inheritanceOrganizationId) {
        throw new Error("Pick the organization first.");
      }
      const ladder =
        rung === "org" || rung === "user"
          ? await fetchMandateLadder(
              data.mandate.mandate_key,
              inheritanceOrganizationId,
            )
          : [];
      if (cancelled) return;
      const inherited = inheritedModelOverrides(ladder, rung);
      dispatch(
        initInstanceOverrides({
          conversationId: instanceId,
          baseSettings: { ...own, ...inherited.values },
        }),
      );
      const stored = JSON.parse(storedJson) as JsonObject | null;
      if (stored) {
        const changes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(stored)) {
          if (value === null)
            dispatch(markRemoved({ conversationId: instanceId, key }));
          else changes[key] = value;
        }
        if (Object.keys(changes).length)
          dispatch(setOverrides({ conversationId: instanceId, changes }));
      }
      setHolderSettings(own as Record<string, unknown>);
      setSources(inherited.sources);
      setSavedJson(
        stableJson(selectSettingsOverridesForApi(instanceId)(store.getState())),
      );
      setOpened(new Set());
      setLoad({ status: "ready" });
    })().catch((error: unknown) => {
      if (!cancelled)
        setLoad({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "The agent's settings could not be read.",
        });
    });
    return () => {
      cancelled = true;
    };
  }, [
    holder.kind,
    agentId,
    selectedVersionId,
    rung,
    inheritanceOrganizationId,
    data.mandate.mandate_key,
    instanceId,
    storedJson,
    retry,
    dispatch,
    store,
  ]);

  // ── The mandate's offer decides whether the mapping travels (unchanged) ───
  const surfaceState = useMandateInputSurface(
    data.provisionKey ? null : data.mandate.mandate_key,
  );
  const describedOffer =
    !data.provisionKey && surfaceState.status === "ready"
      ? describedOfferFrom({
          mandateKey: data.mandate.mandate_key,
          label: data.mandate.label,
          draftInputs: (data.mandate as { draft_inputs?: unknown })
            .draft_inputs,
          surface: surfaceState.surface,
        })
      : null;
  const offerKnown =
    Boolean(data.offer) ||
    Boolean(data.provisionKey) ||
    surfaceState.status !== "loading";
  const hasOffer = Boolean(data.offer ?? describedOffer);

  // ── The model's controls, for whichever model is effective ────────────────
  const models = useAppSelector(selectAllModels);
  const base = (entry?.baseSettings ?? {}) as Record<string, unknown>;
  const overrides = (entry?.overrides ?? {}) as Record<string, unknown>;
  const removals = entry?.removals ?? [];
  const effectiveModel = removals.includes("model")
    ? holderSettings.model
    : (overrides.model ?? base.model);
  const effectiveModelId =
    typeof effectiveModel === "string" ? effectiveModel : "";
  const isFull = useAppSelector((s) =>
    selectModelFullyLoaded(s, effectiveModelId),
  );
  const registryLoading = useAppSelector((s) => s.modelRegistry.isLoading);
  useEffect(() => {
    if (effectiveModelId && !isFull && !registryLoading) {
      dispatch(fetchModelById(effectiveModelId));
    }
  }, [dispatch, effectiveModelId, isFull, registryLoading]);
  const { normalizedControls } = useModelControls(models, effectiveModelId);
  // MATRX-EXCEPTION: settings-catalogue keys are dynamic; buildSettingsRows validates each control.
  const controlsMap = normalizedControls as unknown as Record<
    string,
    ControlDefinition
  > | null;

  const merged: Record<string, unknown> = { ...base, ...overrides };
  for (const key of removals) {
    if (holderSettings[key] != null) merged[key] = holderSettings[key];
    else delete merged[key];
  }
  const rows = buildSettingsRows(controlsMap, merged).flatMap((g) => g.rows);

  const wire = JSON.parse(wireJson) as Record<string, unknown>;
  const overriddenCount = Object.keys(wire).length;
  const dirty = load.status === "ready" && wireJson !== savedJson;

  /** What the agent (plus any higher level) sets — never the model default. */
  const agentValue = (key: string): unknown => base[key] ?? undefined;
  const isOverridden = (key: string) => key in wire;
  const isOpen = (key: string) => opened.has(key) || isOverridden(key);

  function change(key: string, value: unknown) {
    const current = agentValue(key);
    if (current !== undefined && deepEqual(value, current)) {
      dispatch(resetOverride({ conversationId: instanceId, key }));
      return;
    }
    dispatch(
      setOverrides({ conversationId: instanceId, changes: { [key]: value } }),
    );
  }
  function open(key: string) {
    setOpened((prev) => new Set(prev).add(key));
  }
  function reset(key: string) {
    dispatch(resetOverride({ conversationId: instanceId, key }));
    setOpened((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
  function cancel() {
    dispatch(
      replaceOverrides({
        conversationId: instanceId,
        changes: JSON.parse(savedJson) as Record<string, unknown>,
      }),
    );
    setOpened(new Set());
    setSaveError(null);
  }

  // ── Who may save, said beside the button (never a dead Save) ───────────────
  const systemLevel = level === "system";
  const orgRole = organizations.find((o) => o.id === organizationId)?.role;
  const refusal = !offerKnown
    ? "Reading this job…"
    : systemLevel && !isSuperAdmin
      ? "Only a super admin can change this for everyone."
      : systemLevel &&
          systemRungHolderIsPersonal(
            agentId,
            builtinAgents.map((a) => a.id),
          )
        ? SYSTEM_RUNG_PERSONAL_HOLDER_REFUSAL
        : level === "organization" && !organizationId
          ? "Pick the organization first."
          : level === "organization" &&
              orgRole !== "owner" &&
              orgRole !== "admin"
            ? "Only an owner or admin of this organization can change this."
            : null;

  async function write(bindAgentId: string | null) {
    setBusy(true);
    setSaveError(null);
    try {
      const captured = selectSettingsOverridesForApi(instanceId)(
        store.getState(),
      );
      const stored = parseBindingWave1(settingsRow);
      const consumptionMap = withoutUnpicked(stored.consumptionMap);
      if (systemLevel) {
        // 🚨 THE SYSTEM ANSWER IS THE JOB'S OWN DEFAULT (aidream 1037). Its
        // settings are written to the default itself — never to a
        // platform-wide binding beside it. The holder, map and auto-run go
        // back exactly as stored; only `config_overrides` changes here.
        const own = defaultHolderDraftOf(data.mandate);
        const swapped = bindAgentId != null && bindAgentId !== agentId;
        const result = await putMandateDefaultHolder(
          dispatch,
          data.mandate.mandate_key,
          own.kind === "workflow"
            ? {
                holderType: "workflow",
                agentId: null,
                agentVersionId: null,
                useLatest: true,
                holderId: own.workflowId,
                holderVersionId: null,
              }
            : {
                holderType: "agent",
                agentId: swapped
                  ? bindAgentId
                  : own.useLatest
                    ? own.agentId
                    : null,
                agentVersionId:
                  swapped || own.useLatest ? null : own.agentVersionId,
                useLatest: swapped ? true : own.useLatest,
                holderId: null,
                holderVersionId: null,
              },
          {
            configOverrides:
              captured && Object.keys(captured).length > 0
                ? (captured as JsonObject)
                : null,
          },
        );
        if (result.notes.length > 0) {
          toast.warning("Saved", {
            description: result.notes.join(" "),
            duration: 12_000,
          });
        } else {
          toast.success("Saved");
        }
        onChanged();
        return;
      }
      const payload = buildBindingSavePayload({
        holder: holderChoiceForSave({ picked, agentId, bindAgentId }),
        hasOffer,
        consumptionMap,
        autoRun: stored.autoRun,
        settingsOpened: true,
        capturedOverrides: isJsonObject(captured) ? captured : undefined,
        storedOverrides,
      });
      const report = await putMandateBinding(
        dispatch,
        data.mandate.mandate_key,
        level === "organization"
          ? { principalType: "org", organizationId: organizationId as string }
          : { principalType: "user" },
        payload,
      );
      if (report.notes.length > 0) {
        toast.warning("Saved", {
          description: report.notes.join(" "),
          duration: 12_000,
        });
      } else {
        toast.success("Saved");
      }
      onChanged();
    } catch (err) {
      const failure = describeFailure(err, {
        action: "saving these settings",
        retrySafe: true,
        fallback: "Save failed.",
      });
      setSaveError(
        failure.remedy
          ? `${failure.sentence} ${failure.remedy}`
          : failure.sentence,
      );
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (refusal || busy) return;
    // Every system-level write decides for everyone — the same audit the
    // existing tab runs before it (builtin agents pass straight through).
    if (systemLevel && agentId) {
      setGuardOpen(true);
      return;
    }
    void write(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (holder.kind === "workflow") {
    return (
      <p className="text-sm text-muted-foreground">
        This job is run by a workflow, which has no model settings to override.
      </p>
    );
  }
  if (picked.source === "loading") {
    return (
      <div className="space-y-1 rounded-lg border border-border p-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
    );
  }
  if (!agentId) {
    return (
      <p className="text-sm text-muted-foreground">
        {picked.source === "none" && picked.message
          ? picked.message
          : "No agent is set for this job yet."}
      </p>
    );
  }

  const agentName = data.agentsById[agentId]?.name ?? "this agent";

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="shrink-0">Settings from</span>
          <EntityRef
            token="agent"
            id={agentId}
            name={agentName}
            showIcon={false}
            labelClassName="font-medium text-foreground"
          />
          {inheritedHolder ? (
            <span className="shrink-0 text-xs text-muted-foreground/70">
              (runs for you today)
            </span>
          ) : null}
        </div>
        {overriddenCount > 0 ? (
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {overriddenCount} overridden
          </span>
        ) : null}
      </div>

      {load.status === "error" ? (
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="text-destructive">{load.message}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      ) : load.status === "loading" || !entry ? (
        <div
          className="space-y-1 rounded-lg border border-border p-2"
          aria-busy
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          <SettingRow
            label="Model"
            overridden={isOverridden("model")}
            open={isOpen("model")}
            onOverride={() => open("model")}
            onReset={() => reset("model")}
            disabled={busy}
            inheritedFrom={sourceWord(sources.model)}
            display={
              typeof base.model === "string" && base.model ? (
                <AiModelRef modelId={base.model} showIcon={false} />
              ) : (
                "Not set"
              )
            }
            editor={
              <ModelListDropdown
                value={effectiveModelId || null}
                onValueChange={(model) => change("model", model)}
                onClear={() => reset("model")}
                emptyOptionLabel="Use the agent's model"
                placeholder="Use the agent's model"
                inputModalities={[]}
                outputModalities={["text"]}
                disabled={busy}
              />
            }
          />
          {rows.map((row) =>
            row.control ? (
              <SettingRow
                key={row.key}
                label={row.label}
                overridden={isOverridden(row.key)}
                open={isOpen(row.key)}
                onOverride={() => open(row.key)}
                onReset={() => reset(row.key)}
                disabled={busy}
                inheritedFrom={sourceWord(sources[row.key])}
                display={
                  <AgentValue
                    value={agentValue(row.key)}
                    control={row.control}
                  />
                }
                editor={
                  removals.includes(row.key) ? (
                    <span className="text-sm text-muted-foreground">
                      <AgentValue
                        value={holderSettings[row.key]}
                        control={row.control}
                      />
                    </span>
                  ) : (
                    <SettingControlInput
                      settingKey={row.key}
                      control={row.control}
                      value={
                        row.key in overrides
                          ? overrides[row.key]
                          : // The editor needs a starting point; the model's
                            // default is only that, never shown as the agent's.
                            (agentValue(row.key) ?? row.control.default)
                      }
                      onChange={(v) => change(row.key, v)}
                      disabled={busy}
                      id={`overrides-simple-${row.key}`}
                    />
                  )
                }
              />
            ) : null,
          )}
        </div>
      )}

      {dirty || saveError ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {saveError ? (
            <span className="mr-auto text-sm text-destructive">
              {saveError}
              <ErrorAlchemyMenu error={saveError} />
            </span>
          ) : refusal ? (
            <span className="mr-auto text-sm text-muted-foreground">
              {refusal}
            </span>
          ) : null}
          {dirty ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={cancel}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={busy || refusal !== null}
              >
                {busy ? "Saving…" : "Save"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {systemLevel && agentId ? (
        <GlobalBindAgentGuard
          open={guardOpen}
          agentId={agentId}
          onProceed={(id) => {
            setGuardOpen(false);
            void write(id === agentId ? null : id);
          }}
          onUseSystemTwin={(twin) => {
            setGuardOpen(false);
            void write(twin.id);
          }}
          onCancel={() => setGuardOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** The agent's value, or a muted "Model default" when the agent leaves it unset. */
function AgentValue({
  value,
  control,
}: {
  value: unknown;
  control: ControlDefinition | null;
}) {
  const shown = agentSettingDisplay(value, control);
  return shown.modelDefault ? (
    <span className="text-muted-foreground/60">{shown.text}</span>
  ) : (
    <>{shown.text}</>
  );
}

/** "System" / "Organization" when a higher level set this value; else nothing. */
function sourceWord(source: string | undefined): string | null {
  if (!source) return null;
  const word = source.split(" · ")[0];
  return Object.values(MODEL_OVERRIDE_SOURCE).includes(word) ? word : null;
}

/** Label · value · action. Inline so the column plan never depends on a CSS rebuild. */
const ROW_COLUMNS = "minmax(8rem, 14rem) minmax(0, 1fr) auto";

function SettingRow({
  label,
  display,
  editor,
  overridden,
  open,
  inheritedFrom,
  disabled,
  onOverride,
  onReset,
}: {
  label: string;
  display: ReactNode;
  editor: ReactNode;
  overridden: boolean;
  open: boolean;
  inheritedFrom: string | null;
  disabled: boolean;
  onOverride: () => void;
  onReset: () => void;
}) {
  return (
    <div
      className={cn(
        "grid min-h-10 items-center gap-3 px-3 py-1.5",
        overridden && "border-l-2 border-l-primary bg-primary/5",
      )}
      style={{ gridTemplateColumns: ROW_COLUMNS }}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
        <span className="truncate">{label}</span>
        {overridden ? (
          <span className="shrink-0 text-[11px] font-medium text-primary">
            Overridden
          </span>
        ) : null}
      </div>
      <div className="min-w-0">
        {open ? (
          editor
        ) : (
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="min-w-0 truncate">{display}</span>
            {inheritedFrom ? (
              <span className="shrink-0 text-xs text-muted-foreground/70">
                (set by {inheritedFrom})
              </span>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex justify-end">
        {open ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onReset}
            disabled={disabled}
            aria-label={`Reset ${label} to the agent's value`}
            title="Back to the agent's value"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onOverride}
            disabled={disabled}
          >
            Override
          </Button>
        )}
      </div>
    </div>
  );
}
