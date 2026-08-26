"use client";

// features/agents/mandates/workspace/OverrideFlow.tsx
//
// §4 of the mandate workspace — YOUR OVERRIDE, as Arman's stepwise doctrine
// (2026-08-26): never everything at once.
//
//   Step 1  HOLDER      keep the system agent, or choose your own (agent now;
//                       workflow is a registered promise). The version choice
//                       (latest vs pin) lives HERE — rule 6.
//   Step 2  VALIDATION  automatic on selection, the server's own rules run
//                       client-side first (output keys both eras; legacy
//                       variable superset); the server's 422 stays the
//                       authority and surfaces VERBATIM.
//   Step 3  MAP VALUES  target-centric: the chosen Holder's declared variables
//                       and context policies are the rows; each picks its
//                       source from the Provision's offer. The wire map is
//                       natively keyed by HOLDER INPUT name with
//                       `target` = offered value (provision-shapes.ts).
//                       Unconsumed offered values render calmly available.
//                       Legacy mandates SKIP this step structurally.
//   Step 4  SETTINGS    rare, de-emphasized: the canonical instance-overrides
//                       layer (RunConfigOverrides + selectSettingsOverridesFor
//                       Api — genuine diffs only), seeded per the bench recipe
//                       PLUS the stored binding overrides. Never hand-rolled.
//
// Save/remove ride the ONE bind path; the payload goes through the pure
// buildBindingSavePayload (jest-covered wipe guards).

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Settings2,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  fetchAgentExecutionFull,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentCustomExecutionPayload,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { AgentVersionPicker } from "@/features/agent-shortcuts/components/AgentVersionPicker";
import {
  initInstanceOverrides,
  markRemoved,
  removeInstanceOverrides,
  setOverrides,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import {
  selectInstanceOverrideState,
  selectOverriddenKeys,
  selectSettingsOverridesForApi,
} from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import { buildInstanceBaseSettings } from "@/features/agents/redux/execution-system/instance-model-overrides/base-settings";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { buildBindingTargets } from "@/features/surfaces/utils/buildBindingTargets";
import { isJsonObject, type JsonObject } from "@/types/json";
import { compareStoredContract } from "../contract-compare";
import { missingOutputKeys, fetchAgentOutputSchemas } from "../output-contract";
import {
  consumptionMapProblems,
  parseBindingWave1,
  SCALAR_VALUE_KINDS,
  MEDIA_VALUE_KINDS,
  type ConsumptionEntry,
  type ConsumptionMap,
} from "../provision-shapes";
import { putMandateBinding, removeMandateBinding } from "../overrides";
import { EffectiveConfigLayers } from "../components/EffectiveConfigLayers";
import { buildBindingSavePayload } from "./save-payload";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";

export type WorkspacePrincipal =
  | { kind: "user" }
  | { kind: "org"; orgId: string };

export interface OverrideFlowProps {
  data: MandateWorkspaceData;
  userId: string | null;
  /** Whose binding this flow edits. The USER principal on /agents/mandates;
   * the ORG principal on the org-scoped route (org fixed by the route, the
   * server's is_org_admin gate enforces authority). */
  principal: WorkspacePrincipal;
  onChanged: () => void;
}

type FlowState = "collapsed" | "editing";

export function OverrideFlow({ data, userId, principal, onChanged }: OverrideFlowProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const myBinding = useMemo(
    () =>
      data.bindings.find((b) =>
        principal.kind === "org"
          ? b.principal_type === "org" && b.organization_id === principal.orgId
          : b.principal_type === "user" && b.subject_user_id === userId,
      ) ?? null,
    [data.bindings, userId, principal],
  );
  const wirePrincipal = useMemo(
    () =>
      principal.kind === "org"
        ? { principalType: "org" as const, organizationId: principal.orgId }
        : { principalType: "user" as const },
    [principal],
  );
  const storedMap = useMemo(
    () => parseBindingWave1(myBinding).consumptionMap,
    [myBinding],
  );
  const storedOverrides = useMemo(
    () => (isJsonObject(myBinding?.config_overrides) ? myBinding.config_overrides : null),
    [myBinding],
  );

  const [flow, setFlow] = useState<FlowState>(myBinding ? "editing" : "collapsed");
  useEffect(() => {
    setFlow(myBinding ? "editing" : "collapsed");
    // Re-derive on binding identity change (save/remove refresh).
  }, [myBinding?.id, myBinding?.updated_at]);

  // ── Step 1 state — the Holder + version choice ────────────────────────────
  const [agentId, setAgentId] = useState<string | null>(myBinding?.agent_id ?? null);
  const [agentVersionId, setAgentVersionId] = useState<string | null>(
    myBinding?.agent_version_id ?? null,
  );
  const [useLatest, setUseLatest] = useState<boolean>(
    myBinding ? myBinding.use_latest === true : true,
  );
  useEffect(() => {
    setAgentId(myBinding?.agent_id ?? null);
    setAgentVersionId(myBinding?.agent_version_id ?? null);
    setUseLatest(myBinding ? myBinding.use_latest === true : true);
  }, [myBinding?.id, myBinding?.updated_at]);

  // The effective master the later steps reason about (a pinned version's
  // master resolves through versionsById once known).
  const effectiveAgentId =
    agentId ??
    (agentVersionId ? (data.versionsById[agentVersionId]?.agentId ?? null) : null);

  // ── Step 2 — validation (client pre-flight; server stays the authority) ───
  const [verdict, setVerdict] = useState<{
    checking: boolean;
    problems: string[];
    passed: boolean;
  }>({ checking: false, problems: [], passed: false });

  useEffect(() => {
    if (!effectiveAgentId) {
      setVerdict({ checking: false, problems: [], passed: false });
      return;
    }
    let cancelled = false;
    setVerdict({ checking: true, problems: [], passed: false });
    (async () => {
      await dispatch(fetchAgentExecutionMinimal(effectiveAgentId)).unwrap();
      const payload = selectAgentExecutionPayload(store.getState(), effectiveAgentId);
      const problems: string[] = [];
      if (!payload.isReady) {
        problems.push(
          "This agent could not be read — it may be deleted or not shared with you.",
        );
      } else {
        // Output side — enforced in BOTH eras; a failing holder is DROPPED by
        // the server, so it fails validation here, loudly, with the keys named.
        if (data.contract.requiredOutputKeys.length > 0) {
          const schemas = await fetchAgentOutputSchemas([effectiveAgentId]);
          const missing = missingOutputKeys(
            data.contract.requiredOutputKeys,
            schemas[effectiveAgentId] ?? null,
          );
          if (missing.length > 0) {
            problems.push(
              `Its structured output is missing ${missing.map((m) => `\`${m}\``).join(", ")} — whatever reads this job's result requires ${missing.length === 1 ? "it" : "them"}.`,
            );
          }
        }
        // Legacy input side — the variable-superset rule. Provisioned mandates
        // skip it by design (the consumption map is the input contract).
        if (!data.provisionKey) {
          const check = compareStoredContract(data.contract, {
            variableNames: (payload.variableDefinitions ?? []).map((v) => v.name),
            contextPolicyKeys: (payload.contextPolicies ?? []).map((s) => s.key),
          });
          if (!check.passing) {
            const missing = [...check.missingVariables, ...check.missingPolicies]
              .map((r) => `\`${r.name}\``)
              .join(", ");
            problems.push(
              `It doesn't declare ${missing} — this job's caller passes ${missing.includes(",") ? "them" : "it"} and the agent could never receive ${missing.includes(",") ? "them" : "it"}.`,
            );
          }
        }
      }
      if (!cancelled) {
        setVerdict({ checking: false, problems, passed: problems.length === 0 });
      }
    })().catch((err: unknown) => {
      if (cancelled) return;
      setVerdict({
        checking: false,
        problems: [err instanceof Error ? err.message : String(err)],
        passed: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveAgentId, data.contract, data.provisionKey, dispatch, store]);

  // ── Step 3 state — the consumption map (provisioned mandates only) ────────
  const [draftMap, setDraftMap] = useState<ConsumptionMap>(storedMap);
  useEffect(() => setDraftMap(storedMap), [myBinding?.id, myBinding?.updated_at, storedMap]);

  // ── Step 4 — canonical settings overrides (the bench recipe) ──────────────
  const overridesId =
    principal.kind === "org"
      ? `mandate-binding-${data.mandate.id}-org-${principal.orgId}`
      : `mandate-binding-${data.mandate.id}-user`;
  const overridesReady = useAppSelector((s) =>
    Boolean(selectInstanceOverrideState(overridesId)(s)),
  );
  const overriddenKeys = useAppSelector(selectOverriddenKeys(overridesId));
  const overriddenCount =
    (overriddenKeys?.changed.length ?? 0) + (overriddenKeys?.removed.length ?? 0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tear the draft slice down when the workspace unmounts — synthetic ids must
  // not accumulate across mandates.
  useEffect(
    () => () => {
      dispatch(removeInstanceOverrides(overridesId));
    },
    [dispatch, overridesId],
  );

  async function openSettings() {
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    setSettingsOpen(true);
    if (overridesReady) return; // idempotent — seed once
    const seedAgent = effectiveAgentId ?? data.mandate.default_agent_id;
    let baseSettings: Record<string, unknown> = {};
    if (seedAgent) {
      try {
        await dispatch(fetchAgentExecutionFull(seedAgent)).unwrap();
        const payload = selectAgentCustomExecutionPayload(store.getState(), seedAgent);
        if (payload.isReady) {
          baseSettings = buildInstanceBaseSettings(payload.settings, payload.modelId);
        }
      } catch {
        toast.error(
          "Couldn't load the agent's settings — starting from a blank base.",
        );
      }
    }
    dispatch(initInstanceOverrides({ conversationId: overridesId, baseSettings }));
    // Seed the STORED binding overrides so an existing override renders as
    // overridden, not untouched (the bench never needed this; a binding does).
    // Stored nulls are REMOVALS — re-seeding them as values would turn
    // "removed" into "override to null", a different instruction.
    if (storedOverrides) {
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(storedOverrides)) {
        if (value === null) dispatch(markRemoved({ conversationId: overridesId, key }));
        else changes[key] = value;
      }
      if (Object.keys(changes).length > 0) {
        dispatch(setOverrides({ conversationId: overridesId, changes }));
      }
    }
  }

  // ── Save / remove ─────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const holderChosen = Boolean(effectiveAgentId);
  const mapProblems =
    data.offer && holderChosen
      ? consumptionMapProblems(data.offer, draftMap)
      : [];
  const canSave = holderChosen && verdict.passed && mapProblems.length === 0 && !busy;

  async function save() {
    setBusy(true);
    try {
      const captured = overridesReady
        ? selectSettingsOverridesForApi(overridesId)(store.getState())
        : undefined;
      const payload = buildBindingSavePayload({
        holder: {
          agentId: useLatest ? effectiveAgentId : null,
          agentVersionId: useLatest ? null : agentVersionId,
          useLatest,
        },
        hasProvision: Boolean(data.provisionKey),
        consumptionMap: draftMap,
        capturedOverrides:
          captured === undefined
            ? undefined
            : isJsonObject(captured)
              ? (captured as JsonObject)
              : undefined,
        storedOverrides,
      });
      await putMandateBinding(dispatch, data.mandate.mandate_key, wirePrincipal, payload);
      toast.success(
        principal.kind === "org"
          ? "Your organization's agent now fulfils this job."
          : "Your agent now fulfils this job.",
      );
      onChanged();
    } catch (err) {
      // The server's 422 detail VERBATIM — never flattened.
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: "Remove your override?",
      description:
        "This job goes back to the layer below — your organization's agent if one is set, otherwise the system agent.",
      confirmLabel: "Remove override",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeMandateBinding(dispatch, data.mandate.mandate_key, wirePrincipal);
      toast.success("Override removed — the default fulfils this job again.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  // ── Collapsed state — one honest line + the door in ───────────────────────
  if (flow === "collapsed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <p className="text-[13px] text-muted-foreground">
          The {data.bindings.some((b) => b.principal_type === "org") ? "current" : "system"}{" "}
          agent fulfils this job for you.
        </p>
        <Button size="sm" onClick={() => setFlow("editing")}>
          Override
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
      {/* Step 1 — Holder */}
      <StepBlock index={1} title="Choose who fulfils it">
        <div className="flex flex-wrap items-center gap-2">
          <AgentListDropdown
            label={effectiveAgentId ? "Change agent" : "Choose your agent"}
            onSelect={(id) => {
              setAgentId(id);
              setAgentVersionId(null);
              setUseLatest(true);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void announceComingSoon("mandates.workflow-holder")}
          >
            <WorkflowIcon className="h-3.5 w-3.5" />
            Use a Workflow
            <Badge variant="outline" className="py-0 text-[9px]">Soon</Badge>
          </Button>
          {myBinding ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              className="gap-1.5 text-muted-foreground"
              onClick={() => void remove()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove override
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setFlow("collapsed")}
            >
              Keep the system agent
            </Button>
          )}
        </div>
        {effectiveAgentId ? (
          <div className="mt-2 space-y-2">
            <EntityRef
              token="agent"
              id={effectiveAgentId}
              className="text-[13px] font-medium"
            />
            {/* Rule 6 — the version choice is first-class, with honest risk copy. */}
            <AgentVersionPicker
              agentId={effectiveAgentId}
              agentVersionId={agentVersionId}
              useLatest={useLatest}
              onAgentVersionIdChange={(next) => setAgentVersionId(next)}
              onUseLatestChange={(next) => {
                setUseLatest(next);
                if (next) setAgentVersionId(null);
              }}
              disabled={busy}
            />
            <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
              {useLatest
                ? "Latest: your edits to this agent apply here automatically — convenient, but an edit that changes its inputs or output can break this job until you fix it."
                : "Pinned: this job keeps running exactly this version, immune to later edits — you choose when to update, and the workspace shows drift when the agent moves on."}
            </p>
          </div>
        ) : null}
      </StepBlock>

      {/* Step 2 — Validation */}
      {effectiveAgentId ? (
        <StepBlock index={2} title="Does it meet the mandate?">
          {verdict.checking ? (
            <p className="text-[12.5px] text-muted-foreground">Checking…</p>
          ) : verdict.passed ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="h-3.5 w-3.5" />
              It meets this mandate.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {verdict.problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-destructive"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {problem}
                </li>
              ))}
              <li className="pl-5 text-[11.5px] text-muted-foreground">
                Fix the agent in the builder, then re-select it here.
              </li>
            </ul>
          )}
        </StepBlock>
      ) : null}

      {/* Step 3 — Map values (provisioned mandates only; legacy skips it
          STRUCTURALLY — the wire carries no map for them) */}
      {effectiveAgentId && verdict.passed && data.offer ? (
        <StepBlock index={3} title="Map the offered values">
          <MappingStep
            data={data}
            agentId={effectiveAgentId}
            value={draftMap}
            onChange={setDraftMap}
            disabled={busy}
          />
          {mapProblems.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {mapProblems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-[12px] text-destructive"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {problem}
                </li>
              ))}
            </ul>
          ) : null}
        </StepBlock>
      ) : null}

      {/* Step 4 — Settings (rare, de-emphasized disclosure) */}
      {effectiveAgentId && verdict.passed ? (
        <StepBlock index={data.offer ? 4 : 3} title="Settings" optional>
          <Button
            variant={overriddenCount > 0 ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            onClick={() => void openSettings()}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {overriddenCount > 0 ? `Settings (${overriddenCount} overridden)` : "Settings"}
          </Button>
          {settingsOpen ? (
            overridesReady ? (
              <div className="mt-2 space-y-2">
                <RunConfigOverrides conversationId={overridesId} />
                <EffectiveConfigLayers
                  pins={data.pins}
                  bindingOverrides={storedOverrides}
                />
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-muted-foreground">Loading settings…</p>
            )
          ) : null}
        </StepBlock>
      ) : null}

      {/* Sticky-footer anatomy (BindingFormLayout shape, inline here). */}
      {effectiveAgentId ? (
        <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setAgentId(myBinding?.agent_id ?? null);
              setAgentVersionId(myBinding?.agent_version_id ?? null);
              setUseLatest(myBinding ? myBinding.use_latest === true : true);
              setDraftMap(storedMap);
              if (!myBinding) setFlow("collapsed");
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} className="min-w-[110px]" onClick={() => void save()}>
            {busy ? "Saving…" : myBinding ? "Save" : "Use my agent"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StepBlock({
  index,
  title,
  optional,
  children,
}: {
  index: number;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-[10.5px] font-semibold text-muted-foreground">
          {index}
        </span>
        <h4 className="text-[12.5px] font-semibold text-foreground">{title}</h4>
        {optional ? (
          <span className="text-[10.5px] text-muted-foreground/70">
            rarely needed
          </span>
        ) : null}
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

// ── Step 3 — the target-centric mapping rows ─────────────────────────────────
//
// Rows = the chosen Holder's declared variables + context policies
// (buildBindingTargets — the SAME util surfaces and shortcuts use). Each row
// picks its SOURCE from the Provision's offer. The wire shape is natively
// this direction: key = holder input name, entry.target = offered value.
// Visual anatomy mirrors SurfaceVariableBinding (fixed-height detail, calm
// unconsumed strip) without extending its type-incompatible props.

const NOT_FED = "__not_fed__";

function MappingStep({
  data,
  agentId,
  value,
  onChange,
  disabled,
}: {
  data: MandateWorkspaceData;
  agentId: string;
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  disabled: boolean;
}) {
  const store = useAppStore();
  const payload = selectAgentExecutionPayload(store.getState(), agentId);
  const targets = useMemo(() => {
    if (!payload.isReady) return [];
    return buildBindingTargets({
      variableDefinitions: payload.variableDefinitions,
      contextPolicies: payload.contextPolicies ?? [],
    });
  }, [payload]);

  const contextKeys = useMemo(
    () => new Set((payload.contextPolicies ?? []).map((s) => s.key)),
    [payload],
  );

  const offer = data.offer;
  if (!offer) return null;

  const consumedSources = new Set(
    Object.values(value).map((entry) => entry.target),
  );
  const unconsumed = offer.values.filter(
    (v) => !consumedSources.has(v.name) && !data.pinnedContext.includes(v.name),
  );

  const setRow = (targetName: string, sourceName: string | null) => {
    const next: ConsumptionMap = { ...value };
    if (!sourceName) {
      delete next[targetName];
    } else {
      const offered = offer.values.find((v) => v.name === sourceName);
      const deliver: ConsumptionEntry["deliver"] = contextKeys.has(targetName)
        ? "context"
        : "variable";
      const entry: ConsumptionEntry = {
        mapType: "offered_value",
        target: sourceName,
        deliver,
      };
      if (offered && !offered.guaranteed) entry.when_absent = "skip";
      next[targetName] = entry;
    }
    onChange(next);
  };

  const patchRow = (targetName: string, patch: Partial<ConsumptionEntry>) => {
    const current = value[targetName];
    if (!current) return;
    onChange({ ...value, [targetName]: { ...current, ...patch } });
  };

  if (!payload.isReady) {
    return <p className="text-[12px] text-muted-foreground">Loading the agent's inputs…</p>;
  }
  if (targets.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This agent declares no variables or context policies — it runs on the
        job's user text alone. Nothing to map.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {targets.map((target) => {
        const entry = value[target.name];
        const source = entry?.target ?? NOT_FED;
        const offered = entry
          ? offer.values.find((v) => v.name === entry.target)
          : undefined;
        const structuredAsVariable =
          entry?.deliver === "variable" &&
          offered !== undefined &&
          !SCALAR_VALUE_KINDS.has(offered.kind) &&
          !MEDIA_VALUE_KINDS.has(offered.kind);
        return (
          <article
            key={target.name}
            className="rounded-lg border border-border/50 bg-background/40 px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-[12.5px] font-medium text-foreground">
                  {target.label ?? target.name}
                </span>
                <code className="ml-1.5 text-[10px] text-muted-foreground/70">
                  {target.name}
                </code>
                {target.required ? (
                  <Badge
                    variant="outline"
                    className="ml-1.5 border-amber-500/40 py-0 text-[9px] text-amber-700 dark:text-amber-400"
                  >
                    Required
                  </Badge>
                ) : null}
              </div>
              <select
                value={source}
                disabled={disabled}
                onChange={(e) =>
                  setRow(target.name, e.target.value === NOT_FED ? null : e.target.value)
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
                style={{ fontSize: "14px" }}
                aria-label={`Source for ${target.name}`}
              >
                <option value={NOT_FED}>Not fed (agent default)</option>
                {offer.values
                  .filter((v) => !data.pinnedContext.includes(v.name))
                  .map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.kind}{v.guaranteed ? "" : " · optional"})
                    </option>
                  ))}
              </select>
            </div>
            {entry && offered && !offered.guaranteed ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                <span>If absent:</span>
                <select
                  value={entry.when_absent ?? "skip"}
                  disabled={disabled}
                  onChange={(e) =>
                    patchRow(target.name, {
                      when_absent: e.target.value as ConsumptionEntry["when_absent"],
                    })
                  }
                  className="h-7 rounded-md border border-border bg-background px-1.5 text-[11.5px]"
                  style={{ fontSize: "14px" }}
                  aria-label={`When ${entry.target} is absent`}
                >
                  <option value="skip">Skip it</option>
                  <option value="use_default">Use a default</option>
                  <option value="fail">Fail the run</option>
                </select>
                {entry.when_absent === "use_default" ? (
                  <Textarea
                    value={typeof entry.default === "string" ? entry.default : ""}
                    disabled={disabled}
                    onChange={(e) => patchRow(target.name, { default: e.target.value })}
                    placeholder="Default value"
                    className="h-8 min-h-8 flex-1 resize-none py-1 text-[12px]"
                    style={{ fontSize: "14px" }}
                  />
                ) : null}
              </div>
            ) : null}
            {structuredAsVariable ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px] text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {offered?.kind} is a structured shape — it can only feed a
                context policy, never a prompt variable. Pick a context policy
                target or a scalar value.
              </p>
            ) : null}
          </article>
        );
      })}

      {/* THE CALM RULE — unconsumed offered values are NORMAL, never warnings. */}
      {unconsumed.length > 0 ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
          Also available, unused:{" "}
          {unconsumed.map((v) => v.name).join(" · ")}
        </p>
      ) : null}
      {data.pinnedContext.length > 0 ? (
        <p className="text-[11.5px] text-muted-foreground/80">
          Delivered automatically (platform-locked):{" "}
          {data.pinnedContext.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
