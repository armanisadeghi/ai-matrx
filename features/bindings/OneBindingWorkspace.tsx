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

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CircleCheck, Settings2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { whenNoLayerIsOpen } from "@/components/dialogs/confirm/deferred-intent";
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
  selectAgentDescription,
  selectAgentExecutionPayload,
  selectAgentName,
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
  isOfferedSource,
  parseBindingWave1,
  type ConsumptionEntry,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";
import {
  BindingSuggestionsTab,
  type SuggestionWords,
} from "@/features/surfaces/components/bind/BindingSuggestionsTab";
import { GlobalBindAgentGuard } from "@/features/surfaces/components/bind/GlobalBindAgentGuard";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { WritePolicyMap } from "@/features/surfaces/types";
import { useMandateInputSurface } from "@/features/mandates/input-surface";
import type { ProvisionOffer } from "@/features/mandates/provisions";
import {
  putMandateBinding,
  removeMandateBinding,
  type BindingWriteReport,
} from "@/features/mandates/overrides";
import { buildBindingSavePayload } from "@/features/mandates/workspace/save-payload";
import { EffectiveConfigLayers } from "@/features/mandates/components/EffectiveConfigLayers";
import { useGuardedRebind } from "@/features/mandates/admin/useGuardedRebind";
import type {
  MandateBindingRowDb,
  MandateWorkspaceData,
} from "@/features/mandates/workspace/useMandateWorkspaceData";

import { AutoRunBar } from "./AutoRunBar";
import { BindingMiddle } from "./BindingMiddle";
import { BindingOptionsDrawer } from "./BindingOptionsDrawer";
import { HolderInputsColumn } from "./HolderInputsColumn";
import { OfferedInventoryColumn } from "./OfferedInventoryColumn";
import {
  ScopeHolderBar,
  rungWords,
  type BindingRung,
  type HolderDraft,
} from "./ScopeHolderBar";
import {
  applySuggestions,
  seedAutoBinds,
  sourcesFor,
} from "./consumption-writer";
import { describedOfferFrom } from "./described-offer";
import { coverageLine, isFed, JOB_OVERRIDE_WORDS } from "./words";
import { writeReportStillDescribesDraft } from "./write-report-life";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import { BatchMode } from "./batch/BatchMode";
import { unfedRequiredTargets } from "./batch/batch-model";
import { ModeToggle, type BindingMode } from "./batch/ModeToggle";
import { offeredValuesToSurfaceValues } from "./offered-adapter";
import { useHolderInputs } from "./useHolderInputs";

/**
 * THE MAPPER'S NOUNS ON A MANDATE SCREEN. The mechanic is the surface bind
 * panel's, verbatim; the words are this domain's, because "page value" is
 * exactly as wrong on a job as "shortcut" was — and a screen that calls a thing
 * by the wrong name is lying about what it is.
 */
const MANDATE_MAP_WORDS: SuggestionWords = {
  sourceNoun: "offered value",
  supplierNoun: "this job",
  actionsHeading: "What this job's holder could drive",
  intro: (agentName) =>
    `The mapping helper reads what this job offers and what ${agentName} needs, then proposes the whole match for you to review. Several offered values may feed one input — it can propose that too.`,
};

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
 * holder, map, auto-run — is seeded from the stored row, so the draft is keyed
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
  // 🚨 THE MODE LIVES OUT HERE, above the draft's key, for the same reason the
  // rung does: applying a batch WRITES a binding, which changes the row this
  // draft is keyed to, which remounts it. Held inside, the mode would snap back
  // to "map" the instant a batch succeeded — the person's grid, their written
  // markers and their remaining rows would vanish at the moment they most want
  // to see them.
  const [mode, setMode] = useState<BindingMode>("map");
  // A batch that wrote rows leaves the single-place view stale. Refreshing
  // immediately would remount the draft UNDER the grid the person is still
  // reading, so the refresh waits for them to leave batch mode — and it is
  // never skipped.
  const [batchWrote, setBatchWrote] = useState(false);

  // 🚨 THE SERVER'S REPORT ON THE LAST WRITE lives OUT HERE, above the draft's
  // key, for exactly the reason the rung does: a successful save changes
  // `binding.updated_at`, which remounts the draft — so a report held inside
  // would be destroyed by the very write that produced it, and the person would
  // never read the sentence saying their auto-run promise was refused.
  //
  // It is cleared the moment it stops being true: a rung move describes a
  // different row, and any draft edit describes a mapping the server has not
  // seen. Never stale, never invented.
  const [writeReport, setWriteReport] = useState<BindingWriteReport | null>(
    null,
  );
  /**
   * 🚨 WHAT THE DRAFT LOOKED LIKE WHEN THAT REPORT ARRIVED (V1 finding R2-2,
   * round 2, 2026-08-31).
   *
   * The report was already held above the draft's key — that part was right —
   * and it was still destroyed in the same commit that set it. The clearing
   * rule was "clear when the draft is dirty", and `dirty` compares the draft to
   * the STORED row, which after a save is the row as it was BEFORE the save
   * until the refetch lands. So every successful save was instantly dirty
   * against its own stale baseline, the effect fired, and `applies_in` was
   * wiped before a single frame rendered. The adversary's MutationObserver
   * measured exactly that: `everRendered: false` over five saves.
   *
   * The honest comparison is against WHAT WAS WRITTEN, not against what the
   * client last read. This holds the draft signature at the moment of the
   * write; the report survives until the person edits away from it, which is
   * the only condition that ever made it untrue.
   */
  const [writtenSignature, setWrittenSignature] = useState<string | null>(null);

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
      mode={mode}
      onModeChange={(next) => {
        setMode(next);
        if (next === "map" && batchWrote) {
          setBatchWrote(false);
          onChanged();
        }
      }}
      onBatchWrote={() => setBatchWrote(true)}
      writeReport={writeReport}
      writtenSignature={writtenSignature}
      onWrote={(report, signature) => {
        setWriteReport(report);
        setWrittenSignature(signature);
      }}
      onDraftMoved={() => {
        setWriteReport(null);
        setWrittenSignature(null);
      }}
      onRungChange={(nextRung, nextOrgId) => {
        setWriteReport(null);
        setWrittenSignature(null);
        setRung(nextRung);
        setOrganizationId(
          nextRung === "org"
            ? (nextOrgId ?? organizations[0]?.id ?? null)
            : null,
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
  mode,
  onModeChange,
  onBatchWrote,
  writeReport,
  writtenSignature,
  onWrote,
  onDraftMoved,
  onRungChange,
  onChanged,
}: {
  data: MandateWorkspaceData;
  binding: MandateBindingRowDb | null;
  rung: BindingRung;
  organizationId: string | null;
  allowGlobal: boolean;
  mode: BindingMode;
  onModeChange: (next: BindingMode) => void;
  /** A batch wrote rows — the single-place view is stale until it is left. */
  onBatchWrote: () => void;
  /** What the server said about the last write, or `null` if it has not spoken
   * about the row on screen. Held above this component's key — see the state. */
  writeReport: BindingWriteReport | null;
  /** The draft signature at the moment that report arrived — see the state. */
  writtenSignature: string | null;
  onWrote: (report: BindingWriteReport, signature: string) => void;
  /** The draft moved away from what was written — the report stops being true. */
  onDraftMoved: () => void;
  onRungChange: (rung: BindingRung, organizationId: string | null) => void;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const userId = useAppSelector(selectUserId);
  const { organizations } = useUserOrganizations();
  const organizationNames = useMemo(
    () =>
      Object.fromEntries(
        organizations.map((o) => [o.id.toLowerCase(), o.name]),
      ),
    [organizations],
  );
  const canBindGlobal = allowGlobal && isSuperAdmin;

  // ── The holder draft — seeded once, from the row this instance is keyed to ─
  const [holder, setHolder] = useState<HolderDraft>(() =>
    holderDraftOf(binding),
  );
  const [draftMap, setDraftMap] = useState<ConsumptionMap>(
    () => parseBindingWave1(binding).consumptionMap,
  );
  const [autoRun, setAutoRun] = useState<boolean | null>(
    () => parseBindingWave1(binding).autoRun,
  );
  const [mapTab, setMapTab] = useState<"ai" | "manual">("manual");
  const [autoBound, setAutoBound] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seededFor, setSeededFor] = useState<string | null>(null);
  // F1 — the system rung's awareness gate, mounted between save() and the
  // write exactly as the surface bind panel mounts it.
  const [globalGuardOpen, setGlobalGuardOpen] = useState(false);
  // F4 — the job's own surface, reported UPWARD by the OPTIONS drawer that
  // already reads it, so there is exactly one read of the treatment row.
  const [jobSurfaceName, setJobSurfaceName] = useState<string | null>(null);
  // F4 — write policies the AI map proposed, handed DOWN to the same editor
  // the manual path uses. They are never saved from here.
  const [proposedPolicies, setProposedPolicies] =
    useState<WritePolicyMap | null>(null);

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
    // The derivation is SHARED with batch mode — one rule for what a job
    // offers, whichever mode is asking (`described-offer.ts`).
    return describedOfferFrom({
      mandateKey: data.mandate.mandate_key,
      label: data.mandate.label,
      draftInputs: (data.mandate as { draft_inputs?: unknown }).draft_inputs,
      surface: surfaceState.surface,
    });
  }, [data.provisionKey, data.mandate, surfaceState]);
  const offer = data.offer ?? describedOffer;
  const offerPending =
    !data.provisionKey && !data.offer && surfaceState.status === "loading";
  const offeredValues = offer?.values ?? [];

  const offerSourceLine = offerPending
    ? "Reading what this job offers…"
    : data.provisionKey
      ? // W10-2 — the provision's key is a SLUG; it rides the mono chip beside
        // this sentence, never inside it.
        `The call site supplies these every launch — declared by the provision`
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
  // The holder agent's own declarations — read once here and handed to batch
  // mode's requirement gate, so N places are checked against ONE read.
  const agentPayload = useAppSelector((state) =>
    selectAgentExecutionPayload(state, agentId ?? ""),
  );

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
            variableNames: (payload.variableDefinitions ?? []).map(
              (v) => v.name,
            ),
            contextPolicyKeys: (payload.contextPolicies ?? []).map(
              (s) => s.key,
            ),
          });
          if (!check.passing) {
            const missing = [
              ...check.missingVariables,
              ...check.missingPolicies,
            ]
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
    (overriddenKeys?.changed.length ?? 0) +
    (overriddenKeys?.removed.length ?? 0);
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
    dispatch(
      initInstanceOverrides({ conversationId: overridesId, baseSettings }),
    );
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
    sources.some((entry) => isOfferedSource(entry) && entry.target === ""),
  );
  // 🚨 FIX-11 / W10-1 — THE PRE-FLIGHT RUNS WHETHER OR NOT THERE IS AN OFFER.
  // This read `offer && holderChosen ? … : []`, so on a job that describes
  // nothing (no offer at all) the whole pre-flight was skipped — while the ROW
  // one line above kept printing its own copy of the very same refusal, because
  // `BindingMiddle` runs it against the sources alone. The screen therefore
  // stated the problem and Save wrote it anyway, which is the exact shape H1
  // closed in batch mode and left open here. A null offer now means "not known"
  // rather than "skip everything": the shape rules (a question with no words,
  // a structured literal joined with something else) are true either way.
  const mapProblems = holderChosen
    ? consumptionMapProblems(offer, withoutUnpicked(draftMap), {
        // R5-1: the refusal names the input the way its own row does.
        targets: holderInputs.targets,
      })
    : [];
  // 🚨 H1, at its class and in BOTH modes (P17 — batch is the middle
  // transposed, so a map that cannot be written in one may not be written in
  // the other). A required input nothing feeds, on a holder with no default of
  // its own, produces a binding the run door refuses outright; the row has
  // always said so and the Save used to write it anyway.
  const unfedRequired =
    holderChosen && holderInputs.status === "ready"
      ? unfedRequiredTargets({
          targets: holderInputs.targets,
          map: withoutUnpicked(draftMap),
          // The job's caller passes these itself — they arrive whether or not
          // the map feeds them, so they are not missing.
          suppliedByCaller: [
            ...data.contract.requiredVariables,
            ...data.contract.requiredContextPolicyKeys,
            ...data.contract.spillVariables,
          ],
        })
      : [];
  const rungReady = rung !== "org" || Boolean(organizationId);

  /**
   * 🚨 CAN THIS PERSON DECIDE FOR THIS ORGANIZATION? (V1 R2-3, proven live
   * 2026-08-31 by an independent walk.)
   *
   * The org picker offers every organization the person belongs to, and the
   * write is org-ADMIN-gated: `mandate_bindings.py:_principal_org` refuses with
   * 403 unless `is_org_admin_for(user, org)`, whose SQL is `role in ('owner',
   * 'admin')`. Nine organizations were offered and the one where this account
   * is a plain `member` — Titanium — was refused AFTER the holder was chosen
   * and Save was pressed.
   *
   * That is the same shape the system rung already handles honestly one cell
   * away (`allowGlobal`: "a super-admin decision, so it is not offered here").
   * The role travels with the org list already (`OrganizationWithRole`), so the
   * screen can know BEFORE the click. The rule is copied from the server's own
   * SQL rather than invented, and if the two ever disagree the server still
   * refuses — now in its own words, because `bindGateMessage` stopped throwing
   * a 403's authored detail away in the same wave.
   */
  const selectedOrgRole = organizations.find(
    (o) => o.id === organizationId,
  )?.role;
  const canBindThisOrg =
    selectedOrgRole === "owner" || selectedOrgRole === "admin";

  /** Why Save cannot act — adjacent to the button, never a transient toast. */
  const saveRefusal = !holderChosen
    ? "Choose an agent or a workflow first — a binding names who runs the job."
    : !rungReady
      ? "Pick the organization this answer is for."
      : rung === "org" && !canBindThisOrg
        ? `Deciding for everyone in ${organizations.find((o) => o.id === organizationId)?.name ?? "this organization"} takes an owner or admin of it, and you are ${selectedOrgRole ? `a ${selectedOrgRole}` : "not a member"} there. Ask an owner to set it, or pick an organization you administer — your own answer above always works.`
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
              : unfedRequired.length > 0
                ? `${unfedRequired.map((n) => `"${n}"`).join(", ")} ${unfedRequired.length === 1 ? "is required and nothing feeds it" : "are required and nothing feeds them"}, and the holder has no default of its own — written like that, this job cannot run. Feed ${unfedRequired.length === 1 ? "it" : "them"} above.`
                : null;

  const storedAgentId = binding ? agentHolderOfBinding(binding).holderId : null;
  const holderChanged =
    binding !== null &&
    holder.kind === "agent" &&
    agentId !== null &&
    storedAgentId !== null &&
    agentId !== storedAgentId;

  /**
   * `bindAgentId` overrides the drafted holder for THIS write only — the one
   * caller is the global guard's "Use system version", which binds the linked
   * system twin instead of the personal agent that was drafted. An override
   * always binds the agent itself (latest), never a pinned version of it: the
   * twin has its own version history and this draft's pin does not name it.
   */
  async function writeBinding(bindAgentId?: string | null) {
    const overriding = bindAgentId != null && bindAgentId !== agentId;
    const captured = overridesReady
      ? selectSettingsOverridesForApi(overridesId)(store.getState())
      : undefined;
    const payload = buildBindingSavePayload({
      holder:
        holder.kind === "workflow"
          ? { kind: "workflow", workflowId: holder.workflowId as string }
          : overriding
            ? {
                agentId: bindAgentId,
                agentVersionId: null,
                useLatest: true,
              }
            : {
                agentId: holder.useLatest ? agentId : null,
                agentVersionId: holder.useLatest ? null : holder.agentVersionId,
                useLatest: holder.useLatest,
              },
      hasOffer: Boolean(offer),
      // An unfinished pick never reaches the wire — Save is refused while one
      // stands, so this is a belt on top of the braces, not a silent drop.
      consumptionMap: withoutUnpicked(draftMap),
      // P14 — the promise travels only when it is still true. The bar keeps
      // the fact live, the server re-checks it, and `null` means this binding
      // has no opinion (which is not the same as "no").
      autoRun,
      capturedOverrides:
        captured === undefined
          ? undefined
          : isJsonObject(captured)
            ? (captured as JsonObject)
            : undefined,
      storedOverrides,
    });
    // The write REPORTS ON ITSELF (`BindingResult.notes` / `.applies_in`), and
    // the report is the server's prose, kept verbatim: it is the only thing on
    // this screen that describes the row that now exists rather than the draft.
    const report = await putMandateBinding(
      dispatch,
      data.mandate.mandate_key,
      rung === "org"
        ? { principalType: "org", organizationId: organizationId as string }
        : rung === "global"
          ? { principalType: "global" }
          : { principalType: "user" },
      payload,
    );
    // The signature of exactly what this write sent — the report's lifetime is
    // measured against it, never against the stored row (R2-2).
    onWrote(report, draftSignature);
    return report;
  }

  /** The save confirmation, carrying whatever the server said it did that you
   * did not ask for. A note that only reaches the page and not the confirmation
   * would let the person walk away believing the save was uneventful. */
  function announceSaved(report: BindingWriteReport | null) {
    const notes = report?.notes ?? [];
    if (notes.length === 0) {
      toast.success(savedWords(rung));
      return;
    }
    toast.warning(savedWords(rung), {
      description: notes.join(" "),
      duration: 12_000,
    });
  }

  /** The rebind path's write report, handed from `performWrite` to `onSaved`. */
  const rebindReport = useRef<BindingWriteReport | null>(null);

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
    // The guard owns the confirmation for the rebind path, and it fires AFTER
    // `performWrite` — so the write parks its report on a ref and the
    // confirmation reads it there. Without that hop the rebind path would be the
    // one save on this screen that swallows the server's sentences.
    onSaved: () => {
      announceSaved(rebindReport.current);
      rebindReport.current = null;
      onChanged();
    },
    performWrite: async () => {
      rebindReport.current = await writeBinding();
    },
  });

  /**
   * 🚨 F1 — THE SYSTEM RUNG DOES NOT WRITE A PERSONAL AGENT IN SILENCE.
   *
   * Both surface-side references intercept exactly this write
   * (`SurfaceAgentBindPanel.tsx:310-313`, `BindingColumn.tsx:317-321`) and open
   * `GlobalBindAgentGuard`: it audits the agent's lineage, offers its linked
   * system twin, offers Linked Agent Sync when there is none, and prints a
   * destructive warning when the agent's card visibility is not public — the
   * half that matters most here, because an invisible holder set as THE SYSTEM
   * ANSWER is invisible to precisely the people a system answer exists for.
   *
   * The mandate system rung has a LARGER blast radius than a global surface
   * binding — it is the answer every user of the platform gets for a named job
   * — and it had no guard at all: a super-admin got an enabled button and a
   * direct write. This is a reuse of the same component at a fifth call site,
   * never a second gate. Builtin agents pass through with no dialog (the guard
   * fires `onProceed` itself), so nothing routine gets a new click.
   */
  async function save() {
    if (saveRefusal) {
      toast.error(saveRefusal);
      return;
    }
    if (rung === "global" && holder.kind === "agent" && agentId) {
      setGlobalGuardOpen(true);
      return;
    }
    await doSave(null);
  }

  async function doSave(bindAgentId: string | null) {
    setBusy(true);
    setSaveError(null);
    try {
      const writingAgentId = bindAgentId ?? agentId;
      if (holderChanged && writingAgentId) {
        await requestRebind({
          agentId: writingAgentId,
          agentName:
            data.agentsById[writingAgentId]?.name ?? "the selected agent",
          versionId: bindAgentId ? null : holder.useLatest ? null : holder.agentVersionId,
          useLatest: bindAgentId ? true : holder.useLatest,
          successMessage: savedWords(rung),
        });
        return;
      }
      announceSaved(await writeBinding(bindAgentId));
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

  // ── F3 — MOVING THE RUNG NEVER DESTROYS WORK IN SILENCE ───────────────────
  //
  // The rung is deliberately a control (D1), and the draft is KEYED by the row
  // it edits, so moving rung remounts it — which is right (the org answer must
  // never start from the user answer's draft) and was, until now, completely
  // unannounced: the adversary set a holder at Global, moved to Organization
  // and back, and found the holder and everything mapped under it simply gone.
  // No confirm, no toast, no sentence.
  //
  // The better reference is `BindingColumn`, which refuses the move outright
  // WITH THE REASON ON SCREEN. A mandate binding must be able to move, so the
  // rule here is the other honest one: say it before it happens, and say it
  // while it is true. Both — a confirm at the moment of the move, and a
  // standing sentence in the rung cell whenever there is work to lose.
  /**
   * A rung change waiting for the Select to finish closing. Held as STATE, not
   * as an awaited promise in a click handler — see `requestRungChange`. Exactly
   * one may be pending, and the cell says so while it is.
   */
  const [pendingRung, setPendingRung] = useState<{
    rung: BindingRung;
    organizationId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!pendingRung) return;
    const waiter = whenNoLayerIsOpen();
    let live = true;
    void (async () => {
      const settled = await waiter.promise;
      if (!live) return;
      if (settled === "cancelled") return;
      if (settled === "timeout") {
        // Something owns the screen far longer than any close animation. Say
        // it and drop the intent — opening a dialog underneath another layer is
        // how this defect looked in the first place.
        setPendingRung(null);
        toast.error(
          "Something else on screen is still open, so we could not ask about your unsaved changes. Nothing moved — try the rung again.",
        );
        return;
      }
      const ok = await confirm({
        title: `Move to ${rungWords(pendingRung.rung).noun}?`,
        description: `${rungWords(pendingRung.rung).noun[0].toUpperCase()}${rungWords(pendingRung.rung).noun.slice(1)} starts from its OWN stored answer, so the unsaved changes you have made here are discarded. Save first if you want to keep them.`,
        confirmLabel: "Move and discard",
        cancelLabel: "Stay here",
        variant: "destructive",
      });
      if (!live) return;
      setPendingRung(null);
      if (ok) onRungChange(pendingRung.rung, pendingRung.organizationId);
    })();
    return () => {
      live = false;
      // The person moved on before we could ask. Discard the intent — never
      // bank it to fire later as a question about something they stopped doing.
      waiter.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRung]);

  const storedDraft = useMemo(() => parseBindingWave1(binding), [binding]);
  /**
   * ONE SIGNATURE FOR "WHAT THIS DRAFT IS", used by both the unsaved-work note
   * and the write report's lifetime — because they are the same question asked
   * against two different baselines, and computing them separately is how they
   * came to disagree (R2-2).
   */
  const draftSignature = JSON.stringify([
    holder,
    withoutUnpicked(draftMap),
    autoRun,
  ]);
  const storedSignature = JSON.stringify([
    holderDraftOf(binding),
    storedDraft.consumptionMap,
    storedDraft.autoRun,
  ]);
  const dirty = draftSignature !== storedSignature;

  // The server's report describes THE ROW IT WROTE. The instant the draft moves
  // off THAT — not off whatever the client last read from the server — it is a
  // sentence about something that no longer exists, so it goes.
  //
  // 🚨 This used to key off `dirty`, which is measured against the STORED row.
  // A successful save leaves the draft dirty against that stale baseline until
  // the refetch lands, so the report was cleared in the same commit that set
  // it and `applies_in` never rendered a frame (V1 R2-2). Compare against what
  // was written instead.
  useEffect(() => {
    if (!writeReport) return;
    if (!writeReportStillDescribesDraft({ writtenSignature, draftSignature })) {
      onDraftMoved();
    }
    // `onDraftMoved` is a plain setter from the parent; re-running on identity
    // churn would clear a report the draft has not actually moved off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSignature, writtenSignature, writeReport]);

  async function requestRungChange(
    nextRung: BindingRung,
    nextOrgId: string | null,
  ) {
    if (nextRung === rung && (nextRung !== "org" || nextOrgId === organizationId)) {
      onRungChange(nextRung, nextOrgId);
      return;
    }
    if (dirty) {
      // 🚨 PARK THE INTENT — never open the confirm from inside the Select's
      // own close (V1 round-3 blocker R3-1). `ShortcutScopePicker` is a Radix
      // Select whose `onValueChange` fires while its listbox still carries
      // `data-state="open"` for ~2s; a confirm opened in that stack never
      // appeared, the page went pointer-dead, THE RUNG CHANGE WAS SILENTLY
      // DROPPED, and the queued confirm ambushed a later unrelated click.
      //
      // Awaiting a promise inside this handler is what let that stale question
      // survive; the effect below owns the wait instead, and it either applies
      // the intent or refuses it in words.
      setPendingRung({ rung: nextRung, organizationId: nextOrgId });
      return;
    }
    onRungChange(nextRung, nextOrgId);
  }

  // ── Derived facts the two inventories need ────────────────────────────────
  const consumedBy = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [targetName, sources] of Object.entries(draftMap)) {
      for (const entry of sources) {
        // Only an OFFERED source consumes something from the rail. A literal
        // and a question are the binding's own content — counting them here
        // would mark an offered value "in use" that nothing is using.
        if (!isOfferedSource(entry)) continue;
        const list = out.get(entry.target) ?? [];
        // THE INPUT'S OWN LABEL, not its storage key (V2 round-2 residual 3).
        // The holder declares the label; the rail has no way to know it, so it
        // is resolved here where the declarations are.
        const target = holderInputs.targets.find((t) => t.name === targetName);
        list.push(
          target?.label ?? formatVariableDisplayName(targetName) ?? targetName,
        );
        out.set(entry.target, list);
      }
    }
    return out;
  }, [draftMap, holderInputs.targets]);

  // F2 — the rail is handed THE SOURCES, never a count. A count cannot know a
  // kind, and the rail's sentence is about kinds.
  const fedBy = useMemo(() => {
    const out = new Map<string, readonly ConsumptionEntry[]>();
    for (const target of holderInputs.targets) {
      out.set(target.name, sourcesFor(draftMap, target.name));
    }
    return out;
  }, [draftMap, holderInputs.targets]);

  const disabled = busy || rebindChecking;

  // ── THE AI MAP (P11/P12) — the SAME tab the surface bind panel uses ───────
  //
  // The mapper is one platform agent (`surfaces_client.binding_mapper`) reading
  // one contract: what is on offer, and what the holder needs. A job's offered
  // values ARE that first half — `offeredValuesToSurfaceValues` is the one
  // translation, and the same one the manual picker already goes through, so
  // both tabs propose from a single inventory.
  //
  // The holder contract is built from `holderInputs.targets`, not from the
  // agent payload, so a WORKFLOW holder gets the same assist an agent does —
  // its served run form is a contract like any other.
  const offeredSurfaceValues = useMemo(
    () => offeredValuesToSurfaceValues(offeredValues),
    [offeredValues],
  );
  const mapperVariableDefinitions = useMemo(
    () =>
      holderInputs.targets
        .filter((t) => !holderInputs.contextKeys.has(t.name))
        .map((t) => ({
          name: t.name,
          helpText: t.description ?? "",
          required: t.required ?? false,
          defaultValue: t.defaultValue ?? null,
        })),
    [holderInputs.targets, holderInputs.contextKeys],
  );
  const mapperContextPolicies = useMemo(
    () =>
      holderInputs.targets
        .filter((t) => holderInputs.contextKeys.has(t.name))
        .map((t) => ({
          key: t.name,
          // The mapper reads only key/label/description; `type` is the slot's
          // content-object type, which a BindingTarget does not carry (both
          // holder types funnel through `useHolderInputs`). "text" is the
          // catalogue's neutral slot type and the mapper never branches on it.
          type: "text" as const,
          label: t.label ?? t.name,
          description: t.description ?? "",
        })),
    [holderInputs.targets, holderInputs.contextKeys],
  );
  // The tab is OFFERED only when it has both halves to reason over. Anything
  // less and it would be a control that runs and answers nothing — absent is
  // the honest state, and the manual editor is always there.
  // The mapper is TOLD who it is mapping for, and the name has to be the real
  // one: "the bound agent" is a placeholder in the model's prompt, and a
  // placeholder makes worse proposals. `useHolderInputs` has already fetched
  // this agent's execution record, so the name is in hand — the workspace's own
  // `agentsById` is the mandate console's roster and does not always hold it.
  const holderName = useAppSelector((state) =>
    agentId ? selectAgentName(state, agentId) : undefined,
  );
  const holderDescription = useAppSelector((state) =>
    agentId ? selectAgentDescription(state, agentId) : null,
  );
  /**
   * 🚨 F4 — THE AI MAP CAN PROPOSE WRITE ACCESS, on the jobs that have it.
   *
   * This was `writeTargets={[]}`, unconditionally — so on a job whose surface
   * declares write targets the OPTIONS drawer's Write access section (the
   * reference's own `WritePolicyEditor`) could set policy and the AI path was
   * structurally blind to it. Half a capability, and no deferral recorded.
   *
   * The targets come from the SAME source that section uses: this job's stored
   * treatment names a surface, and the surface manifest declares the targets.
   * The drawer already reads that row and now reports the surface upward, so
   * there is exactly ONE read of the treatment and the two paths can never
   * disagree about what this job may drive.
   */
  const jobWriteTargets = useMemo(
    () => (jobSurfaceName ? (getManifest(jobSurfaceName)?.writeTargets ?? []) : []),
    [jobSurfaceName],
  );

  /**
   * THE JOB CELL'S CONTENT (V2 G3 round 2) — read off the live draft, so it is
   * a fact about this map right now and never decoration. `fedBy` already holds
   * each holder input's sources, and `isFed` is the same rule the rail's
   * highlight uses: one definition of "fed" for both, or the two would
   * disagree on the same screen.
   */
  const jobCoverage = useMemo(() => {
    let fedInputs = 0;
    let askingInputs = 0;
    for (const target of holderInputs.targets) {
      const sources = fedBy.get(target.name) ?? [];
      if (isFed(sources)) fedInputs += 1;
      if (sources.some((e) => e.mapType === "prompt_user")) askingInputs += 1;
    }
    return coverageLine({
      hasHolder: holderChosen,
      inputsReady: holderInputs.status === "ready",
      totalInputs: holderInputs.targets.length,
      fedInputs,
      askingInputs,
      unfedRequired: unfedRequired.length,
      offeredCount: offerPending ? null : offeredValues.length,
    });
  }, [
    fedBy,
    holderChosen,
    holderInputs.status,
    holderInputs.targets,
    offerPending,
    offeredValues.length,
    unfedRequired.length,
  ]);

  const canProposeMap =
    holderInputs.status === "ready" &&
    holderInputs.targets.length > 0 &&
    offeredValues.length > 0;

  return (
    <div className="space-y-3">
      <ScopeHolderBar
        rung={rung}
        organizationId={organizationId}
        allowGlobal={allowGlobal}
        onRungChange={(nextRung, nextOrgId) =>
          void requestRungChange(nextRung, nextOrgId)
        }
        unsavedNote={
          // While an intent is parked, the cell says the question is coming —
          // otherwise the click looks ignored, which is how R3-1 read to the
          // person even before the confirm went missing.
          pendingRung
            ? `Moving to ${rungWords(pendingRung.rung).noun} — asking about your unsaved changes as soon as the menu closes…`
            : dirty
              ? "You have unsaved changes here. Moving rung starts from that rung's own stored answer and discards them — you will be asked first."
              : null
        }
        // Where the row that was just written actually answers, in the server's
        // words — the row's own `organization_id` does not say it, and no client
        // sentence may guess it.
        appliesIn={writeReport?.appliesIn ?? null}
        // The server names the org by id because it has no name to hand; this
        // screen does. See ScopeHolderBar's note — a display resolution, not a
        // rewrite of the server's sentence.
        organizationNames={organizationNames}
        holder={holder}
        onHolderChange={setHolder}
        holderName={
          holderName ?? (agentId ? data.agentsById[agentId]?.name : null) ?? null
        }
        job={{
          mandateKey: data.mandate.mandate_key,
          label: data.mandate.label ?? data.mandate.mandate_key,
          outputKind: data.mandate.output_kind,
          offeredCount: offerPending ? null : offeredValues.length,
          offerSourceLine,
          coverageLine: jobCoverage,
        }}
        ladderLine={ladderLine(data.bindings, rung, userId, organizationId)}
        disabled={disabled}
      />

      {/* ONE SCREEN, TWO MODES (P17). The rung and the holder above hold still;
          only the shape of the match changes. */}
      <ModeToggle mode={mode} onChange={onModeChange} disabled={disabled} />

      {mode === "batch" ? (
        <BatchMode
          rung={rung}
          organizationId={organizationId}
          userId={userId}
          holder={holder}
          agentId={agentId}
          agentName={
            holderName ??
            (agentId ? data.agentsById[agentId]?.name : null) ??
            "This holder"
          }
          agentDeclarations={
            holder.kind === "agent" && agentPayload.isReady
              ? {
                  variableNames: (agentPayload.variableDefinitions ?? []).map(
                    (v) => v.name,
                  ),
                  contextPolicyKeys: (agentPayload.contextPolicies ?? []).map(
                    (s) => s.key,
                  ),
                }
              : null
          }
          holderInputs={holderInputs}
          currentMandateKey={data.mandate.mandate_key}
          canBindGlobal={canBindGlobal}
          disabled={disabled}
          onChanged={onBatchWrote}
        />
      ) : (
        <>
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
            {/* 🚨 THE MIDDLE IS THE STAR (Arman, 2026-08-31, on the first ship:
            "the match is a ~180px sliver while both inventory columns sit wide
            and mostly empty"). The grid template is the root cause and the only
            place it is fixed:
              · the middle is 32rem at its narrowest and 56rem at its widest —
                a floor so a row card is always comfortable and nothing in it
                truncates, and a ceiling so it keeps the reading rhythm of the
                shortcut editor's row instead of stretching across a monitor;
              · the rails are `minmax(0, 18rem)` — they are reference, so they
                compress first and disappear last;
              · three columns only once the container can carry all of it
                (@5xl); below that the middle stacks FIRST and the rails follow,
                because the match is what you came here to do. */}
            <div className="grid justify-center gap-3 @5xl:grid-cols-[minmax(0,18rem)_minmax(32rem,56rem)_minmax(0,18rem)]">
              <div className="order-2 min-w-0 @5xl:order-none">
                <OfferedInventoryColumn
                  values={offeredValues}
                  consumedBy={consumedBy}
                  pinnedContext={data.pinnedContext}
                  sourceLine={offerSourceLine}
                  sourceSlug={offerPending ? null : (data.provisionKey ?? null)}
                  status={offerPending ? "loading" : "ready"}
                />
              </div>

              <section className="order-1 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card @5xl:order-none">
                <header className="shrink-0 border-b border-border px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-[12.5px] font-semibold text-foreground">
                      The match
                    </h3>
                    {holderInputs.status === "ready" ? (
                      <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                        {holderInputs.targets.length} inputs
                      </span>
                    ) : null}
                    {/* P11 — the two tabs sit in the middle panel's own header, the
                  way the surface bind panel puts them over its mapping section.
                  AI map PROPOSES into this same editor; it never applies. */}
                    {canProposeMap ? (
                      <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
                        {(
                          [
                            ["ai", "AI map"],
                            ["manual", "Map manually"],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setMapTab(key)}
                            className={cn(
                              "rounded px-2 py-0.5 text-[10.5px] transition-colors",
                              mapTab === key
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    One row per holder input. Several offered values may feed
                    one input — they are joined in order, separated by a blank
                    line.
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
                    {mapTab === "ai" && canProposeMap ? (
                      <BindingSuggestionsTab
                        surfaceName={data.mandate.mandate_key}
                        agent={{
                          name:
                            holderName ??
                            (agentId ? data.agentsById[agentId]?.name : null) ??
                            "the bound agent",
                          description: holderDescription,
                          variableDefinitions: mapperVariableDefinitions,
                          contextPolicies: mapperContextPolicies,
                        }}
                        availableSurfaceValues={offeredSurfaceValues}
                        writeTargets={jobWriteTargets}
                        targetNames={holderInputs.targets.map((t) => t.name)}
                        disabled={disabled}
                        manyToOne
                        words={MANDATE_MAP_WORDS}
                        onAccept={(_mappings, policies, suggestions) => {
                          // P11 — accepting FILLS the manual editor and switches to
                          // it. Nothing is saved, nothing is applied blind: every
                          // line is still editable, and the same pre-flight that
                          // gates Save re-runs over the result on the way in.
                          setDraftMap((current) =>
                            applySuggestions({
                              map: current,
                              suggestions,
                              targetNames: holderInputs.targets.map(
                                (t) => t.name,
                              ),
                              offeredByName: new Map(
                                offeredValues.map((v) => [v.name, v]),
                              ),
                              deliverFor: (name) =>
                                holderInputs.contextKeys.has(name)
                                  ? "context"
                                  : "variable",
                            }),
                          );
                          setMapTab("manual");
                          // F4 — accepted WRITE policies go to the one editor
                          // that owns them (OPTIONS › Write access, over
                          // `mandate.treatment.config.write_policies`), and the
                          // person is told where they landed and that they are
                          // not saved yet. A proposal that vanished into a
                          // store nobody names is the silent half of the same
                          // defect.
                          const policyCount = Object.keys(policies).length;
                          if (policyCount > 0) setProposedPolicies(policies);
                          toast.success(
                            policyCount > 0
                              ? `Filled in below — change any line before you save. ${policyCount} write-access ${policyCount === 1 ? "proposal is" : "proposals are"} in OPTIONS › Write access, and save there separately.`
                              : "Filled in below — change any line before you save.",
                          );
                        }}
                      />
                    ) : (
                      <BindingMiddle
                        holderKind={holder.kind}
                        targets={holderInputs.targets}
                        contextKeys={holderInputs.contextKeys}
                        offered={offeredValues}
                        pinnedContext={data.pinnedContext}
                        value={draftMap}
                        onChange={setDraftMap}
                        autoBound={autoBound}
                        disabled={disabled}
                      />
                    )}
                  </MiddleBody>
                </div>
              </section>

              <div className="order-3 min-w-0 @5xl:order-none">
                <HolderInputsColumn
                  inputs={holderInputs}
                  fedBy={fedBy}
                  holderKind={holder.kind}
                />
              </div>
            </div>
          </div>

          {/* P14 — AUTO-RUN, narrating itself as the map changes. It is only
          meaningful once something is actually mapped: before that the bar
          would be a control about a promise nobody has made yet. */}
          {holderChosen && holderInputs.targets.length > 0 ? (
            <AutoRunBar
              targets={holderInputs.targets}
              map={draftMap}
              value={autoRun}
              onChange={setAutoRun}
              disabled={disabled}
              // The bar's own sentence is the PRE-SAVE preview of the draft;
              // these are the server's sentences about what the write stored —
              // notably the promise refused down to false. Verbatim, and gone
              // the moment the draft moves.
              serverNotes={writeReport?.notes ?? []}
            />
          ) : null}

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
                    <RunConfigOverrides
                      conversationId={overridesId}
                      // B14 — the canonical panel, told where it is. Its
                      // default sentence ("this conversation only") is a lie
                      // on a screen that stores a binding.
                      words={JOB_OVERRIDE_WORDS}
                    />
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

          {/* OPTIONS (P16) — the folded stack over the shortcut editor's own
          sections. Last on the page and folded shut, because the match is what
          you came here to do and depth beyond it is progressive. It is offered
          only once a holder is chosen: presentation is how a RUNNING job shows
          itself, and there is nothing to present until something runs it. */}
          {holderChosen ? (
            <BindingOptionsDrawer
              owner={{
                mandateId: data.mandate.id,
                organizationId: data.mandate.organization_id,
                label: data.mandate.label ?? data.mandate.mandate_key,
                visibility: data.mandate.visibility,
              }}
              autoRun={autoRun === true}
              // F4 — ONE read of the treatment row, and it lives here. The
              // drawer reports the surface it read; the workspace hands the AI
              // map its real write targets and hands accepted proposals back
              // into this same editor.
              onSurfaceRead={setJobSurfaceName}
              proposedWritePolicies={proposedPolicies}
              onProposalsTaken={() => setProposedPolicies(null)}
              organizationName={
                organizations.find(
                  (o) => o.id === data.mandate.organization_id,
                )?.name ?? null
              }
              disabled={disabled}
            />
          ) : null}

          {/* 🚨 G6 — WHAT THE LOAD THREW AWAY, ON THE SCREEN. The parse drops
          stored sources it cannot feed an input with (a legacy `surface_value`,
          a fixed value with nothing in it, a question with no words) and used
          to say so only in the console — 79 times in one adversarial session,
          while the person looked at a map that was quietly missing rows and
          would silently overwrite the stored one on the next save. Counted,
          named, and with the remedy. */}
          {storedDraft.droppedSources.length > 0 ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2">
              <p className="flex items-start gap-1.5 text-[12px] font-medium leading-relaxed text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {storedDraft.droppedSources.length === 1
                  ? "1 stored source of this binding could not be read, and is not shown below."
                  : `${storedDraft.droppedSources.length} stored sources of this binding could not be read, and are not shown below.`}
              </p>
              <ul className="mt-1 space-y-0.5 pl-5">
                {storedDraft.droppedSources.map((line) => (
                  <li
                    key={line}
                    className="font-mono text-[10.5px] leading-snug text-amber-700/90 dark:text-amber-400/90"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              <p className="mt-1 pl-5 text-[11px] leading-snug text-muted-foreground">
                Saving from this screen REPLACES the stored map, so whatever is
                listed here is lost when you save. Re-map those inputs below
                first if they still matter.
              </p>
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
              {busy
                ? "Saving…"
                : binding
                  ? "Save"
                  : `Set ${rungWords(rung).noun}`}
            </Button>
          </div>
        </>
      )}

      {rebindDialog}

      {/* F1 — the system rung's awareness gate. Mounted only while the write it
          guards is the one being attempted, and only for an agent holder: a
          workflow holder has no card visibility and no linked system twin, so
          the guard would have nothing to audit and would be a dialog that
          exists to say nothing. */}
      {holder.kind === "agent" && agentId ? (
        <GlobalBindAgentGuard
          open={globalGuardOpen}
          agentId={agentId}
          onProceed={(id) => {
            setGlobalGuardOpen(false);
            void doSave(id === agentId ? null : id);
          }}
          onUseSystemTwin={(twin) => {
            setGlobalGuardOpen(false);
            // The DRAFT follows the write: binding the twin while the holder
            // cell still names the personal agent would leave the screen
            // describing a binding that does not exist.
            setHolder({
              kind: "agent",
              agentId: twin.id,
              agentVersionId: null,
              useLatest: true,
              workflowId: null,
            });
            toast.info(`Setting the system answer to "${twin.name}" instead.`);
            void doSave(twin.id);
          }}
          onCancel={() => setGlobalGuardOpen(false)}
        />
      ) : null}
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
        text alone. There is nothing to map, and the binding saves without a
        map.
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
    const chosen = sources.filter(
      (entry) => !isOfferedSource(entry) || entry.target !== "",
    );
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
