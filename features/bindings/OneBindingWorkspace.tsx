"use client";

// features/bindings/OneBindingWorkspace.tsx
//
// THE ONE BINDING UI. One screen binds a job to whoever runs it, at any rung,
// for an agent holder or a workflow holder.
//
// Arman's sentence, which is the spine:
//
//   "on one side, they showed you what the mandate (surface) offered and on the
//    other side, they showed you the agent and then you were able to match
//    things directly in the middle."
//
// So: the job's offered inventory stands open on the left, the holder's input
// inventory stands open on the right, and the match is made in the middle by
// the SAME row component the agent↔surface workspace, the surface bind panel,
// the shortcut editor and the batch grid already share. Above all three, one
// bar answers who this is for and what runs.
//
// This replaces `features/mandates/workspace/OverrideFlow.tsx` — a four-step
// wizard whose mapping step was a list of bare `<select>`s that met 2 of 68
// cells of the binding-UI standard, and which did not render at all when a
// mandate had no code provision. Both are gone, not deprecated.
//
// Standard: common-docs/projects/workflow-mandate-program/UI-STANDARD.md
// Plan:     common-docs/projects/workflow-mandate-program/PLAN-ONE-BINDING-UI.md
// Rulings:  common-docs/systems/mandates/DECISIONS.md D18

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CircleCheck, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import {
  fetchAgentExecutionFull,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentCustomExecutionPayload,
  selectAgentExecutionPayload,
} from "@/features/agents/redux/agent-definition/selectors";
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
import { isJsonObject, type JsonObject } from "@/types/json";
import {
  agentHolderOfBinding,
  isFloatingBinding,
} from "@/lib/supabase/mandateStorage";
import { compareStoredContract } from "@/features/mandates/contract-compare";
import {
  fetchAgentOutputSchemas,
  missingOutputKeys,
} from "@/features/mandates/output-contract";
import {
  consumptionMapProblems,
  parseBindingWave1,
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import { parseDraftInputs } from "@/features/mandates/authoring/service";
import type { ProvisionOffer } from "@/features/mandates/provisions";
import {
  putMandateBinding,
  removeMandateBinding,
} from "@/features/mandates/overrides";
import { buildBindingSavePayload } from "@/features/mandates/workspace/save-payload";
import { EffectiveConfigLayers } from "@/features/mandates/components/EffectiveConfigLayers";
import { useGuardedRebind } from "@/features/mandates/admin/useGuardedRebind";
import type {
  MandateBindingRowDb,
  MandateWorkspaceData,
} from "@/features/mandates/workspace/useMandateWorkspaceData";

import { BindingMiddle } from "./BindingMiddle";
import { HolderInputsColumn } from "./HolderInputsColumn";
import { OfferedInventoryColumn } from "./OfferedInventoryColumn";
import {
  ScopeHolderBar,
  rungWords,
  type BindingRung,
  type HolderDraft,
} from "./ScopeHolderBar";
import { seedAutoBinds, sourcesFor } from "./consumption-writer";
import { useHolderInputs } from "./useHolderInputs";

export interface OneBindingWorkspaceProps {
  data: MandateWorkspaceData;
  /** Which rung the host's route pre-selects. Always visible, always movable. */
  initialRung?: BindingRung;
  /** Pre-selected organization for the org rung (the org route supplies it). */
  initialOrganizationId?: string | null;
  /** Offer the system rung. Super-admin authority is checked here too. */
  allowGlobal?: boolean;
  onChanged: () => void;
}

/**
 * The rung lives OUT here, above the draft, because it is the one choice that
 * must survive changing which binding is being edited. Everything else —
 * holder, map, refusals — is seeded from the stored row, so the draft is keyed
 * by that row's identity and REMOUNTS when it moves. Re-seeding half a dozen
 * useStates from an effect is the cascading-render defect; a key is the whole
 * fix, and it also guarantees the org answer never starts from the user
 * answer's draft.
 */
export function OneBindingWorkspace({
  data,
  initialRung = "user",
  initialOrganizationId = null,
  allowGlobal = false,
  onChanged,
}: OneBindingWorkspaceProps) {
  const userId = useAppSelector(selectUserId);
  const { organizations } = useUserOrganizations();

  const [rung, setRung] = useState<BindingRung>(
    initialRung === "global" && !allowGlobal ? "user" : initialRung,
  );
  const [organizationId, setOrganizationId] = useState<string | null>(
    initialOrganizationId,
  );

  const binding = findBinding(data.bindings, rung, userId, organizationId);
  const bindingIdentity = `${rung}:${organizationId ?? ""}:${binding?.id ?? "new"}:${binding?.updated_at ?? ""}`;

  return (
    <BindingDraft
      key={bindingIdentity}
      data={data}
      binding={binding}
      rung={rung}
      organizationId={organizationId}
      allowGlobal={allowGlobal}
      onRungChange={(nextRung, nextOrgId) => {
        setRung(nextRung);
        setOrganizationId(
          nextRung === "org" ? (nextOrgId ?? organizations[0]?.id ?? null) : null,
        );
      }}
      onChanged={onChanged}
    />
  );
}

function BindingDraft({
  data,
  binding,
  rung,
  organizationId,
  allowGlobal,
  onRungChange,
  onChanged,
}: {
  data: MandateWorkspaceData;
  binding: MandateBindingRowDb | null;
  rung: BindingRung;
  organizationId: string | null;
  allowGlobal: boolean;
  onRungChange: (rung: BindingRung, organizationId: string | null) => void;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const userId = useAppSelector(selectUserId);
  const canBindGlobal = allowGlobal && isSuperAdmin;

  // ── The holder draft — seeded once, from the row this instance is keyed to ─
  const [holder, setHolder] = useState<HolderDraft>(() => holderDraftOf(binding));
  const [draftMap, setDraftMap] = useState<ConsumptionMap>(
    () => parseBindingWave1(binding).consumptionMap,
  );
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [autoBound, setAutoBound] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seededFor, setSeededFor] = useState<string | null>(null);

  const storedOverrides = useMemo(
    () =>
      isJsonObject(binding?.config_overrides) ? binding.config_overrides : null,
    [binding],
  );

  // ── THE OFFER — whatever this job actually offers (D18.1) ─────────────────
  //
  // A mandate's DESCRIBED inputs ARE its provision. The served input surface is
  // the one place that knows every declaration, so it answers when there is no
  // code provision. Never re-derived here.
  const surfaceState = useMandateInputSurface(
    data.provisionKey ? null : data.mandate.mandate_key,
  );
  const describedOffer: ProvisionOffer | null = useMemo(() => {
    if (data.provisionKey) return null;
    if (surfaceState.status !== "ready") return null;
    // 🚨 GUARANTEED COMES FROM THE MANDATE'S OWN draft_inputs, NOT from the
    // served surface's `sourcing`. They answer DIFFERENT questions and the
    // wizard this replaced conflated them, which is why the first real save
    // 422'd: aidream `offer.described_offered_values` sets
    // `guaranteed = item["required"] is True`, while the input surface serves a
    // described input as `sourcing="require"` to make the RUN FORM ask for it.
    // Reading the asking policy as the guarantee told the client every value
    // always arrives, so no row ever declared `when_absent`, and the server
    // (rightly) refused the whole map. Same column, same rule, both halves.
    // The slug a nameless described input gets is the SERVER's rule
    // (`slug_for_description`), so it is never recomputed here: declared names
    // match by name, and the rest match BY POSITION, which is safe because both
    // lists are the same `draft_inputs` array in author order.
    const drafts = parseDraftInputs(
      (data.mandate as { draft_inputs?: unknown }).draft_inputs,
    );
    const requiredByName = new Map(
      drafts
        .filter((input) => Boolean(input.name?.trim()))
        .map((input) => [input.name as string, input.required === true]),
    );
    const described = surfaceState.surface.inputs.filter(
      (input) =>
        input.origin === "mandate_input" || input.origin === "provision",
    );
    const values: OfferedValue[] = described.map((input, index) => ({
      name: input.name,
      kind: input.kind,
      guaranteed:
        requiredByName.get(input.name) ??
        (drafts.length === described.length
          ? drafts[index].required === true
          : // Lists disagree — refuse to guess a guarantee. Optional makes
            // absence a declared decision, which is never wrong to require.
            false),
      lazy: false,
      description: input.label !== input.name ? input.label : input.help,
    }));
    if (values.length === 0) return null;
    return {
      id: `mandate:${data.mandate.mandate_key}`,
      provisionKey: `mandate:${data.mandate.mandate_key}`,
      label: data.mandate.label ?? data.mandate.mandate_key,
      description:
        "This job's own described inputs. They ARE its provision — map them onto whatever fulfils it.",
      offerKindSlug: null,
      values,
      isEnabled: true,
    };
  }, [
    data.provisionKey,
    data.mandate.label,
    data.mandate.mandate_key,
    surfaceState,
  ]);
  const offer = data.offer ?? describedOffer;
  const offerPending =
    !data.provisionKey && !data.offer && surfaceState.status === "loading";
  const offeredValues = offer?.values ?? [];

  const offerSourceLine = offerPending
    ? "Reading what this job offers…"
    : data.provisionKey
    ? `Declared by the ${data.provisionKey} provision — the call site supplies these every launch.`
    : offer
      ? "This job's own described inputs. They ARE its provision."
      : surfaceState.status === "error"
        ? `The job's inputs could not be read: ${surfaceState.message}`
        : "Nothing described yet.";

  // ── The holder's inputs (the consuming side) ──────────────────────────────
  const holderInputs = useHolderInputs(
    holder.kind === "workflow"
      ? { kind: "workflow", workflowId: holder.workflowId }
      : { kind: "agent", agentId: effectiveAgentId(holder, data) },
  );

  // P4 — a row must never open blank when the answer is obvious. Seed exact
  // name matches into the DRAFT once per (binding × holder inputs), and tell
  // each seeded row it was seeded.
  //
  // This is an ADJUSTMENT DURING RENDER, not an effect: the seed depends only
  // on props/state already in hand, and doing it in an effect would render the
  // blank rows once and then re-render them filled — the cascading-render
  // defect this repo has fixed twice already.
  const seedKey = `${holder.kind}:${holder.agentId ?? holder.workflowId ?? ""}|${holderInputs.targets.map((t) => t.name).join(",")}`;
  if (
    holderInputs.status === "ready" &&
    holderInputs.targets.length > 0 &&
    offeredValues.length > 0 &&
    seededFor !== seedKey
  ) {
    const seeded = seedAutoBinds({
      map: draftMap,
      targetNames: holderInputs.targets.map((t) => t.name),
      offeredByName: new Map(offeredValues.map((v) => [v.name, v])),
      deliverFor: (name): ConsumptionEntry["deliver"] =>
        holderInputs.contextKeys.has(name) ? "context" : "variable",
    });
    setSeededFor(seedKey);
    if (seeded.autoBound.size > 0) {
      setDraftMap(seeded.map);
      setAutoBound(seeded.autoBound);
    }
  }

  // ── The agent pre-flight (the server stays the authority) ─────────────────
  //
  // ONE SETTLED SLOT, stamped with the agent it answers for. `checking` is
  // DERIVED — writing it from the effect body is the same cascading-render
  // defect, and a verdict stamped with a stale agent id is a lie.
  const agentId = effectiveAgentId(holder, data);
  const [settledVerdict, setSettledVerdict] = useState<{
    agentId: string;
    problems: string[];
  } | null>(null);
  const currentVerdict =
    settledVerdict?.agentId === agentId ? settledVerdict : null;
  const verdict = {
    checking: agentId !== null && currentVerdict === null,
    problems: currentVerdict?.problems ?? [],
    passed: currentVerdict !== null && currentVerdict.problems.length === 0,
  };

  useEffect(() => {
    if (holder.kind === "workflow" || !agentId) return;
    let cancelled = false;
    (async () => {
      await dispatch(fetchAgentExecutionMinimal(agentId)).unwrap();
      const payload = selectAgentExecutionPayload(store.getState(), agentId);
      const problems: string[] = [];
      if (!payload.isReady) {
        problems.push(
          "This agent could not be read — it may be deleted or not shared with you.",
        );
      } else {
        if (data.contract.requiredOutputKeys.length > 0) {
          const schemas = await fetchAgentOutputSchemas([agentId]);
          const missing = missingOutputKeys(
            data.contract.requiredOutputKeys,
            schemas[agentId] ?? null,
          );
          if (missing.length > 0) {
            problems.push(
              `Its structured output is missing ${missing.map((m) => `\`${m}\``).join(", ")} — whatever reads this job's result requires ${missing.length === 1 ? "it" : "them"}.`,
            );
          }
        }
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
      if (!cancelled) setSettledVerdict({ agentId, problems });
    })().catch((err: unknown) => {
      if (cancelled) return;
      setSettledVerdict({
        agentId,
        problems: [err instanceof Error ? err.message : String(err)],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, holder.kind, data.contract, data.provisionKey, dispatch, store]);

  // ── Settings overrides — the canonical instance-overrides layer ───────────
  const overridesId = `mandate-binding-${data.mandate.id}-${rung}-${organizationId ?? "self"}`;
  const overridesReady = useAppSelector((s) =>
    Boolean(selectInstanceOverrideState(overridesId)(s)),
  );
  const overriddenKeys = useAppSelector(selectOverriddenKeys(overridesId));
  const overriddenCount =
    (overriddenKeys?.changed.length ?? 0) + (overriddenKeys?.removed.length ?? 0);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    if (overridesReady) return;
    let baseSettings: Record<string, unknown> = {};
    if (agentId) {
      try {
        await dispatch(fetchAgentExecutionFull(agentId)).unwrap();
        const payload = selectAgentCustomExecutionPayload(
          store.getState(),
          agentId,
        );
        if (payload.isReady) {
          baseSettings = buildInstanceBaseSettings(
            payload.settings,
            payload.modelId,
          );
        }
      } catch {
        toast.error(
          "Couldn't load the agent's settings — starting from a blank base.",
        );
      }
    }
    dispatch(initInstanceOverrides({ conversationId: overridesId, baseSettings }));
    if (storedOverrides) {
      const changes: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(storedOverrides)) {
        if (value === null)
          dispatch(markRemoved({ conversationId: overridesId, key }));
        else changes[key] = value;
      }
      if (Object.keys(changes).length > 0) {
        dispatch(setOverrides({ conversationId: overridesId, changes }));
      }
    }
  }

  // ── Save / remove ─────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const holderChosen =
    holder.kind === "workflow" ? Boolean(holder.workflowId) : Boolean(agentId);
  // A source whose value has not been picked yet is an UNFINISHED CHOICE, not
  // an invalid map — it gets its own words, on its own row and here, instead of
  // the pre-flight's "consumes something this job does not offer".
  const awaitingPick = Object.values(draftMap).some((sources) =>
    sources.some((entry) => entry.target === ""),
  );
  const mapProblems =
    offer && holderChosen
      ? consumptionMapProblems(offer, withoutUnpicked(draftMap))
      : [];
  const rungReady = rung !== "org" || Boolean(organizationId);
  const refusalCount = Object.values(refusals).filter(Boolean).length;

  /** Why Save cannot act — adjacent to the button, never a transient toast. */
  const saveRefusal = !holderChosen
    ? "Choose an agent or a workflow first — a binding names who runs the job."
    : !rungReady
      ? "Pick the organization this answer is for."
      : rung === "global" && !canBindGlobal
        ? "The system answer is a super-admin decision — the server refuses this write."
        : holder.kind === "agent" && !verdict.passed
          ? verdict.checking
            ? "Checking whether this agent meets the mandate…"
            : "This agent does not meet the mandate yet — see the problems above."
          : awaitingPick
            ? "One input is still waiting for you to pick which offered value feeds it."
            : mapProblems.length > 0
            ? "Fix the mapping problems named on the rows above."
            : refusalCount > 0
              ? "One of your picks can't be stored on a job binding — see the rows above."
              : null;

  const storedAgentId = binding ? agentHolderOfBinding(binding).holderId : null;
  const holderChanged =
    binding !== null &&
    holder.kind === "agent" &&
    agentId !== null &&
    storedAgentId !== null &&
    agentId !== storedAgentId;

  async function writeBinding() {
    const captured = overridesReady
      ? selectSettingsOverridesForApi(overridesId)(store.getState())
      : undefined;
    const payload = buildBindingSavePayload({
      holder:
        holder.kind === "workflow"
          ? { kind: "workflow", workflowId: holder.workflowId as string }
          : {
              agentId: holder.useLatest ? agentId : null,
              agentVersionId: holder.useLatest ? null : holder.agentVersionId,
              useLatest: holder.useLatest,
            },
      hasOffer: Boolean(offer),
      // An unfinished pick never reaches the wire — Save is refused while one
      // stands, so this is a belt on top of the braces, not a silent drop.
      consumptionMap: withoutUnpicked(draftMap),
      capturedOverrides:
        captured === undefined
          ? undefined
          : isJsonObject(captured)
            ? (captured as JsonObject)
            : undefined,
      storedOverrides,
    });
    await putMandateBinding(
      dispatch,
      data.mandate.mandate_key,
      rung === "org"
        ? { principalType: "org", organizationId: organizationId as string }
        : rung === "global"
          ? { principalType: "global" }
          : { principalType: "user" },
      payload,
    );
  }

  // THE REBIND GUARD — the same impact check the admin console runs, fired
  // here when a SAVED binding's holder swaps. Loud, never blocking: it names
  // exactly which variables stop flowing and still lets you proceed.
  const {
    requestRebind,
    dialog: rebindDialog,
    checking: rebindChecking,
  } = useGuardedRebind({
    mandate: data.mandate,
    currentAgentId: storedAgentId,
    onSaved: () => {
      toast.success(savedWords(rung));
      onChanged();
    },
    performWrite: async () => {
      await writeBinding();
    },
  });

  async function save() {
    if (saveRefusal) {
      toast.error(saveRefusal);
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      if (holderChanged && agentId) {
        await requestRebind({
          agentId,
          agentName: data.agentsById[agentId]?.name ?? "the selected agent",
          versionId: holder.useLatest ? null : holder.agentVersionId,
          useLatest: holder.useLatest,
          successMessage: savedWords(rung),
        });
        return;
      }
      await writeBinding();
      toast.success(savedWords(rung));
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const words = rungWords(rung);
    const ok = await confirm({
      title: `Remove ${words.noun}?`,
      description:
        rung === "user"
          ? "This job goes back to the layer below — your organization's holder if one is set, otherwise the system's."
          : rung === "org"
            ? "Everyone in this organization goes back to the system answer, unless they set their own."
            : "Everybody goes back to the mandate's own default holder.",
      confirmLabel: "Remove it",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeMandateBinding(
        dispatch,
        data.mandate.mandate_key,
        rung === "org"
          ? { principalType: "org", organizationId: organizationId as string }
          : rung === "global"
            ? { principalType: "global" }
            : { principalType: "user" },
      );
      toast.success("Removed — the layer below fulfils this job again.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setBusy(false);
    }
  }

  // ── Derived facts the two inventories need ────────────────────────────────
  const consumedBy = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [targetName, sources] of Object.entries(draftMap)) {
      for (const entry of sources) {
        const list = out.get(entry.target) ?? [];
        list.push(targetName);
        out.set(entry.target, list);
      }
    }
    return out;
  }, [draftMap]);

  const fedCount = useMemo(() => {
    const out = new Map<string, number>();
    for (const target of holderInputs.targets) {
      out.set(target.name, sourcesFor(draftMap, target.name).length);
    }
    return out;
  }, [draftMap, holderInputs.targets]);

  const disabled = busy || rebindChecking;

  return (
    <div className="space-y-3">
      <ScopeHolderBar
        rung={rung}
        organizationId={organizationId}
        allowGlobal={allowGlobal}
        onRungChange={onRungChange}
        holder={holder}
        onHolderChange={setHolder}
        job={{
          mandateKey: data.mandate.mandate_key,
          label: data.mandate.label ?? data.mandate.mandate_key,
          outputKind: data.mandate.output_kind,
          offeredCount: offerPending ? null : offeredValues.length,
          offerSourceLine,
        }}
        ladderLine={ladderLine(data.bindings, rung, userId, organizationId)}
        disabled={disabled}
      />

      {/* The agent pre-flight, above the match it gates. */}
      {holder.kind === "agent" && agentId ? (
        <div className="rounded-xl border border-border bg-card px-3 py-2">
          {verdict.checking ? (
            <p className="text-[12px] text-muted-foreground">
              Checking whether this agent meets the mandate…
            </p>
          ) : verdict.passed ? (
            <p className="flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
              <CircleCheck className="h-3.5 w-3.5" />
              This agent meets the mandate.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {verdict.problems.map((problem) => (
                <li
                  key={problem}
                  className="flex items-start gap-1.5 text-[12px] leading-relaxed text-destructive"
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
        </div>
      ) : null}

      {/* TWO SIDES AND A MIDDLE — both inventories permanently open (P1).
          🚨 CONTAINER query, not a viewport one. This workspace is hosted in a
          3xl reading column, in the admin shell, and inside a draggable window
          panel; a `lg:` breakpoint measures the WINDOW and would lay three
          columns into a 768px container, which is how the first dark-theme walk
          found the middle squeezed to ~90px. `@container` measures the space
          this actually has, so every host gets the layout it can carry. */}
      <div className="@container">
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,260px)]">
        <OfferedInventoryColumn
          values={offeredValues}
          consumedBy={consumedBy}
          pinnedContext={data.pinnedContext}
          sourceLine={offerSourceLine}
          status={offerPending ? "loading" : "ready"}
        />

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <header className="shrink-0 border-b border-border px-3 py-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-[12.5px] font-semibold text-foreground">
                The match
              </h3>
              {holderInputs.status === "ready" ? (
                <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                  {holderInputs.targets.length} inputs
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              One row per holder input. Several offered values may feed one
              input — they are joined in order, separated by a blank line.
            </p>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <MiddleBody
              holderStatus={holderInputs.status}
              holderMessage={holderInputs.message}
              holderKind={holder.kind}
              offerPending={offerPending}
              hasOffer={offeredValues.length > 0}
              targetCount={holderInputs.targets.length}
            >
              <BindingMiddle
                targets={holderInputs.targets}
                contextKeys={holderInputs.contextKeys}
                offered={offeredValues}
                pinnedContext={data.pinnedContext}
                value={draftMap}
                onChange={setDraftMap}
                autoBound={autoBound}
                refusals={refusals}
                onRefusal={(name, refusal) =>
                  setRefusals((prev) => {
                    const next = { ...prev };
                    if (refusal) next[name] = refusal;
                    else delete next[name];
                    return next;
                  })
                }
                disabled={disabled}
              />
            </MiddleBody>
          </div>
        </section>

          <HolderInputsColumn
            inputs={holderInputs}
            fedCount={fedCount}
            holderKind={holder.kind}
          />
        </div>
      </div>

      {/* Settings — rare, de-emphasized, and the canonical overrides layer. */}
      {holder.kind === "agent" && agentId ? (
        <div className="rounded-xl border border-border bg-card px-3 py-2">
          <Button
            variant={overriddenCount > 0 ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            onClick={() => void openSettings()}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {overriddenCount > 0
              ? `Settings (${overriddenCount} overridden)`
              : "Settings"}
            <span className="text-[10.5px] font-normal text-muted-foreground">
              rarely needed
            </span>
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
              <p className="mt-2 text-[12px] text-muted-foreground">
                Loading settings…
              </p>
            )
          ) : null}
        </div>
      ) : null}

      {/* The server's refusal, kept ON THE PAGE — its words name the exact
          missing deliverable or the exact input, and a toast loses them. */}
      {saveError ? (
        <p className="flex items-start gap-1.5 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] leading-relaxed text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 pt-3">
        {saveRefusal ? (
          <p className="mr-auto flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {saveRefusal}
          </p>
        ) : null}
        {binding ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="gap-1.5 text-muted-foreground"
            onClick={() => void remove()}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove {rungWords(rung).noun}
          </Button>
        ) : null}
        <Button
          size="sm"
          className={cn("min-w-[130px]")}
          disabled={disabled || Boolean(saveRefusal)}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : binding ? "Save" : `Set ${rungWords(rung).noun}`}
        </Button>
      </div>

      {rebindDialog}
    </div>
  );
}

// ── Honest bodies for the middle when there is nothing to render ─────────────
//
// 🚨 P15. The wizard this replaces did not render its mapping step AT ALL when
// the job had no code provision — a structural silence that told Arman his job
// had "no provision" while his five described inputs sat on the same page.
// Every state below is a sentence.

function MiddleBody({
  holderStatus,
  holderMessage,
  holderKind,
  offerPending,
  hasOffer,
  targetCount,
  children,
}: {
  holderStatus: "none" | "loading" | "ready" | "error";
  holderMessage: string | null;
  holderKind: "agent" | "workflow";
  offerPending: boolean;
  hasOffer: boolean;
  targetCount: number;
  children: React.ReactNode;
}) {
  if (holderStatus === "none") {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        No holder yet — pick one above to start mapping, or come back when the
        intelligence exists.
      </p>
    );
  }
  if (holderStatus === "loading") {
    return (
      <p className="py-8 text-center text-[12px] text-muted-foreground">
        Reading the {holderKind}&apos;s inputs…
      </p>
    );
  }
  if (holderStatus === "error") {
    return (
      <p className="flex items-start justify-center gap-1.5 py-8 text-[12px] leading-relaxed text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {holderMessage}
      </p>
    );
  }
  if (targetCount === 0) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        This {holderKind} declares no inputs — it runs on the job&apos;s user
        text alone. There is nothing to map, and the binding saves without a map.
      </p>
    );
  }
  if (offerPending) {
    return (
      <p className="py-8 text-center text-[12px] text-muted-foreground">
        Reading what this job offers…
      </p>
    );
  }
  if (!hasOffer) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        This job offers nothing to map yet, so every input below falls back to
        the holder&apos;s own defaults. Describe the job&apos;s inputs in the
        INPUT section above and they appear here as values you can map.
      </p>
    );
  }
  return <>{children}</>;
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/** The draft minus sources still waiting for a pick — what the save sends. */
function withoutUnpicked(map: ConsumptionMap): ConsumptionMap {
  const out: ConsumptionMap = {};
  for (const [name, sources] of Object.entries(map)) {
    const chosen = sources.filter((entry) => entry.target !== "");
    if (chosen.length > 0) out[name] = chosen;
  }
  return out;
}

function findBinding(
  bindings: readonly MandateBindingRowDb[],
  rung: BindingRung,
  userId: string | null,
  organizationId: string | null,
): MandateBindingRowDb | null {
  if (rung === "global") {
    return bindings.find((b) => b.principal_type === "global") ?? null;
  }
  if (rung === "org") {
    if (!organizationId) return null;
    return (
      bindings.find(
        (b) =>
          b.principal_type === "org" && b.organization_id === organizationId,
      ) ?? null
    );
  }
  return (
    bindings.find(
      (b) => b.principal_type === "user" && b.subject_user_id === userId,
    ) ?? null
  );
}

function holderDraftOf(binding: MandateBindingRowDb | null): HolderDraft {
  const wave1 = parseBindingWave1(binding);
  const agent = agentHolderOfBinding(binding ?? {});
  return {
    kind: wave1.holderType === "workflow" ? "workflow" : "agent",
    agentId: agent.holderId,
    agentVersionId: agent.versionId,
    useLatest: binding ? isFloatingBinding(binding) : true,
    workflowId: wave1.holderType === "workflow" ? wave1.holderId : null,
  };
}

/** A pinned version resolves to its master for everything the UI reasons about. */
function effectiveAgentId(
  holder: HolderDraft,
  data: MandateWorkspaceData,
): string | null {
  if (holder.kind === "workflow") return null;
  if (holder.agentId) return holder.agentId;
  if (holder.agentVersionId) {
    return data.versionsById[holder.agentVersionId]?.agentId ?? null;
  }
  return null;
}

function savedWords(rung: BindingRung): string {
  switch (rung) {
    case "global":
      return "Saved — everybody gets this holder now.";
    case "org":
      return "Saved — everyone in this organization gets this holder now.";
    default:
      return "Saved — this holder fulfils the job for you now.";
  }
}

/**
 * THE LADDER, SAID OUT LOUD. Which rungs are answered today, and which one the
 * person is standing on — so moving rung is never a blind change.
 */
function ladderLine(
  bindings: readonly MandateBindingRowDb[],
  rung: BindingRung,
  userId: string | null,
  organizationId: string | null,
): string {
  const answered: string[] = [];
  if (bindings.some((b) => b.principal_type === "global"))
    answered.push("the system");
  const orgCount = bindings.filter((b) => b.principal_type === "org").length;
  if (orgCount > 0)
    answered.push(
      orgCount === 1 ? "1 organization" : `${orgCount} organizations`,
    );
  if (
    bindings.some(
      (b) => b.principal_type === "user" && b.subject_user_id === userId,
    )
  )
    answered.push("you");

  const here = rungWords(rung).covers;
  const state =
    answered.length === 0
      ? "Nothing overrides this job yet — the mandate's own default holder answers for everybody."
      : `Answered today by: ${answered.join(", ")}.`;
  const orgNote =
    rung === "org" && !organizationId ? " Choose the organization below." : "";
  return `${here} ${state}${orgNote}`;
}
