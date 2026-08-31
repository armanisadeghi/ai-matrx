"use client";

// features/mandates/workspace/OverrideFlow.tsx
//
// §4 of the mandate workspace — YOUR OVERRIDE, as Arman's stepwise doctrine
// (2026-08-26): never everything at once.
//
//   Step 1  HOLDER      keep the system agent, or choose your own — an AGENT
//                       or a WORKFLOW. Both execute end to end (aidream
//                       services/mandates/workflow_holder.py); a workflow runs
//                       as a child run and answers with the deliverable whose
//                       kind is this mandate's output kind. The version choice
//                       (latest vs pin) lives HERE — rule 6.
//   Step 2  VALIDATION  automatic on selection. For an AGENT Holder the
//                       server's own rules run client-side first (output keys
//                       both eras; legacy variable superset). For a WORKFLOW
//                       Holder the bind gate is the ONLY judge — it compiles
//                       the graph, checks deliverables and the input surface,
//                       and its refusals are worth reading, so they surface
//                       VERBATIM instead of being guessed at here.
//   Step 3  MAP VALUES  target-centric: the chosen Holder's declared variables
//                       and context policies are the rows; each picks its
//                       source from the Provision's offer. The wire map is
//                       natively keyed by HOLDER INPUT name with
//                       `target` = offered value (provision-shapes.ts).
//                       Unconsumed offered values render calmly available.
//                       MANY sources may feed ONE input (D18.2) — joined in
//                       order with a blank line; context slots are targets
//                       exactly like variables (D18.3). Only a mandate that
//                       offers NOTHING skips this step.
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
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Settings2,
  Trash2,
  X,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
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
  fetchWorkflowHolderCandidates,
  type WorkflowHolderCandidate,
  type WorkflowHolderCandidates,
} from "../workflow-holders";
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
import type { BindingTarget } from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import { useServedRunForm } from "@/features/workflow-runtime/served-form/useServedRunForm";
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
  type OfferedValue,
} from "../provision-shapes";
import { useMandateInputSurface } from "../input-surface";
import type { ProvisionOffer } from "../provisions";
import { putMandateBinding, removeMandateBinding } from "../overrides";
import { EffectiveConfigLayers } from "../components/EffectiveConfigLayers";
import { buildBindingSavePayload } from "./save-payload";
import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
} from "@/lib/supabase/mandateStorage";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import { ProTextarea } from "@/components/official/ProTextarea";

export type WorkspacePrincipal =
  | { kind: "user" }
  | { kind: "org"; orgId: string };

export interface OverrideFlowProps {
  data: MandateWorkspaceData;
  userId: string | null;
  /** Whose binding this flow edits. The USER principal on /mandates;
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
  //
  // A binding names ONE Holder: an agent or a workflow. `holderKind` is the
  // switch; the two identity slots are never both populated (the server 422s,
  // and buildBindingSavePayload refuses before the wire).
  const storedHolder = parseBindingWave1(myBinding);
  const [holderKind, setHolderKind] = useState<"agent" | "workflow">(
    storedHolder.holderType === "workflow" ? "workflow" : "agent",
  );
  const [workflowId, setWorkflowId] = useState<string | null>(
    storedHolder.holderId ?? null,
  );
  // The AGENT half of the stored binding. `agentHolderOfBinding` is null-ing
  // for a workflow Holder, exactly as the old agent-only columns were — the
  // workflow identity is `storedHolder` above and must never leak into these.
  const storedAgent = agentHolderOfBinding(myBinding ?? {});
  const [agentId, setAgentId] = useState<string | null>(storedAgent.holderId);
  const [agentVersionId, setAgentVersionId] = useState<string | null>(
    storedAgent.versionId,
  );
  const [useLatest, setUseLatest] = useState<boolean>(
    myBinding ? isFloatingBinding(myBinding) : true,
  );
  useEffect(() => {
    const stored = parseBindingWave1(myBinding);
    setHolderKind(stored.holderType === "workflow" ? "workflow" : "agent");
    setWorkflowId(stored.holderId ?? null);
    const agent = agentHolderOfBinding(myBinding ?? {});
    setAgentId(agent.holderId);
    setAgentVersionId(agent.versionId);
    setUseLatest(myBinding ? isFloatingBinding(myBinding) : true);
  }, [myBinding?.id, myBinding?.updated_at]);

  // The effective master the later steps reason about (a pinned version's
  // master resolves through versionsById once known).
  const effectiveAgentId =
    holderKind === "workflow"
      ? null
      : (agentId ??
        (agentVersionId
          ? (data.versionsById[agentVersionId]?.agentId ?? null)
          : null));

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

  // ── THE OFFER — whatever this job actually offers ─────────────────────────
  //
  // 🚨 D18.1 (Arman, live, 2026-08-30): **a mandate's described inputs ARE its
  // provision.** This flow used to gate the whole mapping step on
  // `data.offer` — the row behind `provision_key` — so a mandate a PERSON
  // authored skipped step 3 entirely and silently: he was told his job had "no
  // provision" and given nothing to map, while his five described inputs sat
  // right there in the triad above.
  //
  // The served input surface is the ONE place that knows every declaration, so
  // the source side comes from there when there is no code provision. Its
  // names are the server's own, which is what makes a map saved here land on
  // the same values at run time.
  const surfaceState = useMandateInputSurface(
    data.provisionKey ? null : data.mandate.mandate_key,
  );
  const describedOffer: ProvisionOffer | null = useMemo(() => {
    if (data.provisionKey) return null;
    if (surfaceState.status !== "ready") return null;
    const values: OfferedValue[] = surfaceState.surface.inputs
      .filter((input) => input.origin === "mandate_input" || input.origin === "provision")
      .map((input) => ({
        name: input.name,
        kind: input.kind,
        guaranteed: input.sourcing === "require",
        lazy: false,
        description: input.label !== input.name ? input.label : input.help,
      }));
    if (values.length === 0) return null;
    return {
      // No `agent.provision` ROW exists for a described offer — it is
      // synthesized from the mandate's own inputs, and the key says so (the
      // same key aidream's `offer.offer_for` builds, so an error message from
      // either half names the same thing).
      id: `mandate:${data.mandate.mandate_key}`,
      provisionKey: `mandate:${data.mandate.mandate_key}`,
      label: data.mandate.label ?? data.mandate.mandate_key,
      description:
        "This job's own described inputs. They ARE its provision — map them onto whatever fulfils it.",
      offerKindSlug: null,
      values,
      isEnabled: true,
    };
  }, [data.provisionKey, data.mandate.label, data.mandate.mandate_key, surfaceState]);
  const offer = data.offer ?? describedOffer;
  // Still fetching the described offer: the step must not render "nothing to
  // map" in the meantime, which is the same silent skip in a shorter form.
  const offerPending =
    !data.provisionKey && !data.offer && surfaceState.status === "loading";

  // ── Step 3 state — the consumption map ────────────────────────────────────
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
    const seedAgent = effectiveAgentId ?? holderOfMandate(data.mandate).holderId;
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
  // The bind gate's refusal, kept ON THE PAGE. Its messages name the exact
  // missing deliverable kind or the exact input the workflow does not accept —
  // far too useful to live only in a toast that disappears in four seconds.
  const [saveError, setSaveError] = useState<string | null>(null);
  const holderChosen =
    holderKind === "workflow" ? Boolean(workflowId) : Boolean(effectiveAgentId);
  const mapProblems =
    offer && holderChosen ? consumptionMapProblems(offer, draftMap) : [];
  const canSave =
    holderChosen &&
    !busy &&
    mapProblems.length === 0 &&
    // A workflow Holder has no client-side capability pre-flight: the bind
    // gate compiles the graph and is the only judge. It is allowed to say no,
    // and when it does its words go on the page.
    (holderKind === "workflow" || verdict.passed);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      const captured = overridesReady
        ? selectSettingsOverridesForApi(overridesId)(store.getState())
        : undefined;
      const payload = buildBindingSavePayload({
        holder:
          holderKind === "workflow"
            ? { kind: "workflow", workflowId: workflowId as string }
            : {
                agentId: useLatest ? effectiveAgentId : null,
                agentVersionId: useLatest ? null : agentVersionId,
                useLatest,
              },
        // D18.1 — described inputs ARE the provision, so the map channel is
        // open whenever this job offers anything at all.
        hasOffer: Boolean(offer),
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
        holderKind === "workflow"
          ? principal.kind === "org"
            ? "Your organization's workflow now fulfils this job."
            : "Your workflow now fulfils this job."
          : principal.kind === "org"
            ? "Your organization's agent now fulfils this job."
            : "Your agent now fulfils this job.",
      );
      onChanged();
    } catch (err) {
      // The server's 422 detail VERBATIM — never flattened, and it STAYS.
      const message = err instanceof Error ? err.message : "Save failed.";
      setSaveError(message);
      toast.error(message);
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
          Holder fulfils this job for you.
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
            label={
              holderKind === "agent" && effectiveAgentId
                ? "Change agent"
                : "Choose your agent"
            }
            onSelect={(id) => {
              setHolderKind("agent");
              setWorkflowId(null);
              setAgentId(id);
              setAgentVersionId(null);
              setUseLatest(true);
            }}
          />
          <Button
            variant={holderKind === "workflow" ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setHolderKind("workflow");
              setAgentId(null);
              setAgentVersionId(null);
            }}
          >
            <WorkflowIcon className="h-3.5 w-3.5" />
            {holderKind === "workflow" && workflowId
              ? "Change workflow"
              : "Use a Workflow"}
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
        {holderKind === "workflow" ? (
          <WorkflowHolderPicker
            mandateOutputKind={data.mandate.output_kind}
            value={workflowId}
            onChange={setWorkflowId}
            disabled={busy}
          />
        ) : null}
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

      {/* Step 2 — Validation. A WORKFLOW Holder is judged by the server's bind
          gate alone: it compiles the graph, checks the deliverable kinds and
          the compiled input surface. Guessing at that here would only produce
          a second, weaker verdict. */}
      {holderKind === "workflow" && workflowId ? (
        <StepBlock index={2} title="Does it meet the mandate?">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Checked when you save. The server compiles this workflow and
            confirms it can produce{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {data.mandate.output_kind ?? "this mandate's output"}
            </code>{" "}
            and accept the values this job offers. If it can&apos;t, it says
            exactly what is missing.
          </p>
          {saveError ? (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {saveError}
            </p>
          ) : null}
        </StepBlock>
      ) : null}
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
          STRUCTURALLY — the wire carries no map for them). A WORKFLOW Holder
          maps onto its compiled input surface; an AGENT onto its declared
          variables and context policies. Same rows, same wire shape — the
          server checks exactly this map either way. */}
      {holderKind === "workflow" && workflowId && offer ? (
        <StepBlock index={3} title="Map the offered values">
          <WorkflowMappingStep
            data={data}
            offer={offer}
            workflowId={workflowId}
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
      {effectiveAgentId && verdict.passed && offerPending ? (
        <StepBlock index={3} title="Map the offered values">
          <p className="text-[12px] text-muted-foreground">
            Reading what this job offers…
          </p>
        </StepBlock>
      ) : null}
      {effectiveAgentId && verdict.passed && offer ? (
        <StepBlock index={3} title="Map the offered values">
          <MappingStep
            data={data}
            offer={offer}
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
        <StepBlock index={offer ? 4 : 3} title="Settings" optional>
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
      {effectiveAgentId || (holderKind === "workflow" && workflowId) ? (
        <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              const stored = parseBindingWave1(myBinding);
              setHolderKind(
                stored.holderType === "workflow" ? "workflow" : "agent",
              );
              setWorkflowId(stored.holderId ?? null);
              const agent = agentHolderOfBinding(myBinding ?? {});
              setAgentId(agent.holderId);
              setAgentVersionId(agent.versionId);
              setUseLatest(myBinding ? isFloatingBinding(myBinding) : true);
              setDraftMap(storedMap);
              setSaveError(null);
              if (!myBinding) setFlow("collapsed");
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} className="min-w-[110px]" onClick={() => void save()}>
            {busy
              ? "Saving…"
              : myBinding
                ? "Save"
                : holderKind === "workflow"
                  ? "Use this workflow"
                  : "Use my agent"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── The workflow Holder picker ───────────────────────────────────────────────
//
// Workflows that DECLARE this mandate's output kind come first — those are the
// ones the bind gate can accept on the declaration alone. The rest are listed,
// not hidden: the gate also accepts a workflow whose computed DELIVERABLES
// produce the kind, and deliverables are compiled from the graph, so no column
// here can know. The gate decides; its refusals are shown verbatim.

function WorkflowHolderPicker({
  mandateOutputKind,
  value,
  onChange,
  disabled,
}: {
  mandateOutputKind: string | null;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [candidates, setCandidates] = useState<WorkflowHolderCandidates | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowHolderCandidates(mandateOutputKind)
      .then((result) => {
        if (!cancelled) {
          setCandidates(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mandateOutputKind]);

  if (error) {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Workflows could not be read: {error}
      </p>
    );
  }
  if (!candidates) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        Loading workflows…
      </p>
    );
  }

  const { matching, others } = candidates;
  const shown = showAll ? [...matching, ...others] : matching;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        {mandateOutputKind ? (
          <>
            This job answers in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              {mandateOutputKind}
            </code>
            . {matching.length} workflow{matching.length === 1 ? "" : "s"}{" "}
            declare{matching.length === 1 ? "s" : ""} it.
          </>
        ) : (
          "This job declares no output kind, so no workflow can match on its declaration alone — the server decides when you save."
        )}
      </p>

      {shown.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          No workflow declares this kind.{" "}
          {others.length > 0
            ? "One of the others may still qualify through its deliverables."
            : "Nothing to choose from."}
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-border/40 overflow-y-auto rounded-lg border border-border/50">
          {shown.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              selected={workflow.id === value}
              disabled={disabled}
              onSelect={() => onChange(workflow.id)}
            />
          ))}
        </ul>
      )}

      {others.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11.5px] text-muted-foreground"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? `Show only the ${matching.length} that declare it`
            : `Show all ${matching.length + others.length} workflows — the rest may still qualify through their deliverables`}
        </Button>
      ) : null}
    </div>
  );
}

function WorkflowRow({
  workflow,
  selected,
  disabled,
  onSelect,
}: {
  workflow: WorkflowHolderCandidate;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
          selected ? "bg-muted/60" : "hover:bg-muted/30",
        )}
      >
        <WorkflowIcon
          className={cn(
            "mt-0.5 h-3.5 w-3.5 shrink-0",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-foreground">
            {workflow.name}
          </span>
          {workflow.description ? (
            <span className="block truncate text-[11px] text-muted-foreground">
              {workflow.description}
            </span>
          ) : null}
        </span>
        {workflow.declaresMandateKind ? (
          <Badge
            variant="outline"
            className="shrink-0 border-emerald-500/30 py-0 text-[9.5px] text-emerald-700 dark:text-emerald-400"
          >
            {workflow.outputKind}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 py-0 text-[9.5px] text-muted-foreground"
          >
            {workflow.outputKind ?? "undeclared"}
          </Badge>
        )}
        {selected ? (
          <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        ) : null}
      </button>
    </li>
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


function MappingStep({
  data,
  offer,
  agentId,
  value,
  onChange,
  disabled,
}: {
  data: MandateWorkspaceData;
  offer: ProvisionOffer;
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

  if (!payload.isReady) {
    return <p className="text-[12px] text-muted-foreground">Loading the agent&apos;s inputs…</p>;
  }
  if (targets.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This agent declares no variables or context policies — it runs on the
        job&apos;s user text alone. Nothing to map.
      </p>
    );
  }
  return (
    <MappingRows
      data={data}
      offer={offer}
      targets={targets}
      contextKeys={contextKeys}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/**
 * THE WORKFLOW's mapping rows. The targets are the workflow's ONE compiled
 * input surface, served by `GET /workflows/{id}/run-form` — never derived from
 * the definition here. That surface is exactly what the server's bind gate
 * checks the consumption map against (`bindings.py::_check_target`), so the
 * rows an author fills in ARE the thing that is validated.
 */
function WorkflowMappingStep({
  data,
  offer,
  workflowId,
  value,
  onChange,
  disabled,
}: {
  data: MandateWorkspaceData;
  offer: ProvisionOffer;
  workflowId: string;
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  disabled: boolean;
}) {
  const form = useServedRunForm(workflowId);

  if (form.status === "loading") {
    return (
      <p className="text-[12px] text-muted-foreground">
        Loading the workflow&apos;s inputs…
      </p>
    );
  }
  if (form.status === "error") {
    return (
      <p className="flex items-start gap-1.5 text-[12px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        The workflow&apos;s inputs could not be read: {form.message}
      </p>
    );
  }
  if (!form.form.surfaceServed) {
    return (
      <p className="flex items-start gap-1.5 text-[12px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        The server answered without a compiled input surface, so there is
        nothing honest to map onto. Point at a server that serves it.
      </p>
    );
  }
  const targets = form.form.inputs.map((input) => ({
    name: input.name,
    label: input.label || input.name,
    description: input.help || undefined,
    required: input.sourcing !== "optional",
  }));
  if (targets.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This workflow declares no inputs — nothing to map.
      </p>
    );
  }
  return (
    <MappingRows
      data={data}
      offer={offer}
      targets={targets}
      // A workflow input surface has no context channel — every value lands
      // on a named input.
      contextKeys={EMPTY_CONTEXT_KEYS}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

const EMPTY_CONTEXT_KEYS: ReadonlySet<string> = new Set<string>();


/**
 * THE TWO SIDES AND THE MIDDLE — the agent's inputs down the left, the job's
 * offered values chosen on the right, MANY of them per input.
 *
 * 🚨 D18.2 / D18.3 (Arman, live, 2026-08-30). Two rulings shape this component:
 *
 *  · **Many-to-one is required, generally.** A job may offer fifty values while
 *    the bound agent has two variables. Several offered values landing on ONE
 *    input are CONCATENATED into that input's text, in the order listed here,
 *    separated by a blank line. The old row could hold exactly one source, so
 *    the answer to "I have five inputs and three variables" was "pick two and
 *    lose the rest".
 *  · **Context slots are first-class targets**, symmetric with variables —
 *    same rows, same many-to-one, only the channel differs. `buildBindingTargets`
 *    already returns both; this component now SAYS which is which, because a
 *    value delivered to a context slot behaves differently from one substituted
 *    into a prompt and the author is entitled to know which they chose.
 */
function MappingRows({
  data,
  offer,
  targets,
  contextKeys,
  value,
  onChange,
  disabled,
}: {
  data: MandateWorkspaceData;
  offer: ProvisionOffer;
  targets: BindingTarget[];
  contextKeys: ReadonlySet<string>;
  value: ConsumptionMap;
  onChange: (next: ConsumptionMap) => void;
  disabled: boolean;
}) {
  const consumedSources = new Set(
    Object.values(value).flatMap((sources) => sources.map((entry) => entry.target)),
  );
  const unconsumed = offer.values.filter(
    (v) => !consumedSources.has(v.name) && !data.pinnedContext.includes(v.name),
  );
  const selectable = offer.values.filter(
    (v) => !data.pinnedContext.includes(v.name),
  );

  const channelFor = (targetName: string): ConsumptionEntry["deliver"] =>
    contextKeys.has(targetName) ? "context" : "variable";

  /** Build one source entry for a target, with absence handled up front. */
  const entryFor = (
    targetName: string,
    sourceName: string,
  ): ConsumptionEntry => {
    const offered = offer.values.find((v) => v.name === sourceName);
    const entry: ConsumptionEntry = {
      mapType: "offered_value",
      target: sourceName,
      deliver: channelFor(targetName),
    };
    if (offered && !offered.guaranteed) entry.when_absent = "skip";
    return entry;
  };

  const setSources = (targetName: string, next: ConsumptionEntry[]) => {
    const map: ConsumptionMap = { ...value };
    if (next.length === 0) delete map[targetName];
    else map[targetName] = next;
    onChange(map);
  };

  const addSource = (targetName: string, sourceName: string) => {
    const current = value[targetName] ?? [];
    // The same value twice would be the same paragraph twice — silently, and
    // for no reason anyone could later explain.
    if (current.some((entry) => entry.target === sourceName)) return;
    setSources(targetName, [...current, entryFor(targetName, sourceName)]);
  };

  const removeSource = (targetName: string, index: number) => {
    const current = value[targetName] ?? [];
    setSources(
      targetName,
      current.filter((_, i) => i !== index),
    );
  };

  const moveSource = (targetName: string, index: number, delta: number) => {
    const current = [...(value[targetName] ?? [])];
    const next = index + delta;
    if (next < 0 || next >= current.length) return;
    [current[index], current[next]] = [current[next], current[index]];
    setSources(targetName, current);
  };

  const patchSource = (
    targetName: string,
    index: number,
    patch: Partial<ConsumptionEntry>,
  ) => {
    const current = [...(value[targetName] ?? [])];
    if (!current[index]) return;
    current[index] = { ...current[index], ...patch };
    setSources(targetName, current);
  };

  return (
    <div className="space-y-2">
      {targets.map((target) => {
        const sources = value[target.name] ?? [];
        const isContext = contextKeys.has(target.name);
        const remaining = selectable.filter(
          (v) => !sources.some((entry) => entry.target === v.name),
        );
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
                {/* D18.3 — a context slot is a first-class target, and says so. */}
                <Badge
                  variant="outline"
                  className="ml-1.5 py-0 text-[9px] text-muted-foreground"
                >
                  {isContext ? "context slot" : "variable"}
                </Badge>
                {target.required ? (
                  <Badge
                    variant="outline"
                    className="ml-1.5 border-amber-500/40 py-0 text-[9px] text-amber-700 dark:text-amber-400"
                  >
                    Required
                  </Badge>
                ) : null}
              </div>
              {/* THE ADD CONTROL. Always an add, never a replace — picking a
                  second value must never silently drop the first. */}
              <select
                value=""
                disabled={disabled || remaining.length === 0}
                onChange={(e) => {
                  if (e.target.value) addSource(target.name, e.target.value);
                }}
                className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground disabled:opacity-50"
                style={{ fontSize: "14px" }}
                aria-label={`Add a value to ${target.name}`}
              >
                <option value="">
                  {sources.length === 0
                    ? "Not fed (agent default)"
                    : remaining.length === 0
                      ? "Everything is mapped"
                      : "Add another value…"}
                </option>
                {remaining.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.kind}
                    {v.guaranteed ? "" : " · optional"})
                  </option>
                ))}
              </select>
            </div>

            {sources.length > 1 ? (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
                {sources.length} values, joined in this order with a blank line
                between them.
              </p>
            ) : null}

            {sources.map((entry, index) => {
              const offered = offer.values.find((v) => v.name === entry.target);
              const structuredAsVariable =
                entry.deliver === "variable" &&
                offered !== undefined &&
                !SCALAR_VALUE_KINDS.has(offered.kind) &&
                !MEDIA_VALUE_KINDS.has(offered.kind);
              const unjoinable =
                sources.length > 1 &&
                offered !== undefined &&
                !SCALAR_VALUE_KINDS.has(offered.kind);
              return (
                <div
                  key={`${entry.target}-${index}`}
                  className="mt-1.5 rounded-md border border-border/40 bg-card/40 px-2 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sources.length > 1 ? (
                      <span className="font-mono text-[10px] text-muted-foreground/70">
                        {index + 1}.
                      </span>
                    ) : null}
                    <code className="text-[12px] text-foreground">{entry.target}</code>
                    {offered ? (
                      <Badge variant="outline" className="py-0 font-mono text-[9px]">
                        {offered.kind}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="py-0 text-[9px] text-destructive">
                        no longer offered
                      </Badge>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      {sources.length > 1 ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={disabled || index === 0}
                            aria-label={`Move ${entry.target} earlier`}
                            onClick={() => moveSource(target.name, index, -1)}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            disabled={disabled || index === sources.length - 1}
                            aria-label={`Move ${entry.target} later`}
                            onClick={() => moveSource(target.name, index, 1)}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground"
                        disabled={disabled}
                        aria-label={`Remove ${entry.target} from ${target.name}`}
                        onClick={() => removeSource(target.name, index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {offered && !offered.guaranteed ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                      <span>If absent:</span>
                      <select
                        value={entry.when_absent ?? "skip"}
                        disabled={disabled}
                        onChange={(e) =>
                          patchSource(target.name, index, {
                            when_absent: e.target
                              .value as ConsumptionEntry["when_absent"],
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
                        <ProTextarea
                          wrapperClassName="h-8 min-w-0 flex-1"
                          value={typeof entry.default === "string" ? entry.default : ""}
                          disabled={disabled}
                          onChange={(e) =>
                            patchSource(target.name, index, { default: e.target.value })
                          }
                          placeholder="Default value"
                          className="h-8 min-h-8 flex-1 resize-none py-1 text-[12px]"
                          style={{ fontSize: "14px" }}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {structuredAsVariable ? (
                    <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {offered?.kind} is a structured shape — it can only feed a
                      context slot, never a prompt variable. Map it to a context
                      slot, or pick a scalar value.
                    </p>
                  ) : null}
                  {unjoinable ? (
                    <p className="mt-1 flex items-start gap-1.5 text-[11.5px] text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {offered?.kind} has no text form, so it can&apos;t be joined
                      with the other values here — give it an input of its own.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </article>
        );
      })}

      {/* THE CALM RULE — unconsumed offered values are NORMAL, never warnings. */}
      {unconsumed.length > 0 ? (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground/80">
          Also available, unused: {unconsumed.map((v) => v.name).join(" · ")}
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
