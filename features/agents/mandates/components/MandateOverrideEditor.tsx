"use client";

/**
 * Per-mandate override editor — one principal (me, or an org I admin) at a time:
 * swap the agent (my agents, contract-checked) and/or override settings
 * (model, thinking level). Writes ride the ONE bind path — aidream
 * PUT/DELETE /mandates/{mandate_key}/binding — which contract-enforces the
 * candidate at write time; its 422 detail is surfaced to the user VERBATIM.
 * The client-side check here is the instant pre-flight only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CopyPlus,
  Hash,
  KeyRound,
  Loader2,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import { isJsonObject, type JsonValue } from "@/types/json";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentExecutionPayload,
  selectOwnedAgents,
  selectSharedWithMeAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import {
  parseMandateContract,
  putMandateBinding,
  removeMandateBinding,
  type MandateAgentSummary,
  type MandateBindingRow,
  type MandateDefinitionRow,
} from "../overrides";
import {
  compareStoredContract,
  type ComparisonResult,
} from "../contract-compare";
import {
  consumptionMapProblems,
  parseBindingWave1,
  parseMandateWave1,
  type ConsumptionMap,
} from "../provision-shapes";
import { fetchProvision, type ProvisionOffer } from "../provisions";
import { useCopyMandateAgent } from "../useCopyMandateAgent";
import { ConsumptionMapEditor } from "./ConsumptionMapEditor";
import { EffectiveConfigLayers } from "./EffectiveConfigLayers";
import { ContractItem, type ContractRowState } from "./ContractItem";

const THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];
const THINKING_UNSET = "__default__";

export interface OverridePrincipal {
  key: string;
  kind: "user" | "org";
  /** Org id for org principals. */
  organizationId: string | null;
  label: string;
}

/** Local draft state seeds from `binding` ONCE — the parent must remount this
 * component (React `key` on principal + binding id/updated_at) when the
 * principal or its binding row changes. */
interface MandateOverrideEditorProps {
  mandate: MandateDefinitionRow;
  principal: OverridePrincipal;
  binding: MandateBindingRow | null;
  agentsById: Record<string, MandateAgentSummary>;
  onChanged: () => void;
}

export function MandateOverrideEditor({
  mandate,
  principal,
  binding,
  agentsById,
  onChanged,
}: MandateOverrideEditorProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { copying, copyAndOpen } = useCopyMandateAgent();

  const ownedAgents = useAppSelector(selectOwnedAgents);
  const sharedAgents = useAppSelector(selectSharedWithMeAgents);

  const existingOverrides = useMemo(
    () =>
      binding && isJsonObject(binding.config_overrides)
        ? binding.config_overrides
        : null,
    [binding],
  );

  const [agentId, setAgentId] = useState<string | null>(
    binding?.agent_id ?? null,
  );
  const [model, setModel] = useState<string | null>(
    typeof existingOverrides?.model === "string"
      ? existingOverrides.model
      : null,
  );
  const [thinking, setThinking] = useState<ThinkingLevel | null>(() => {
    const v = existingOverrides?.thinking_level;
    return THINKING_LEVELS.find((l) => l === v) ?? null;
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [contractCheck, setContractCheck] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "error"; message: string }
    | { status: "done"; agentId: string; result: ComparisonResult }
  >({ status: "idle" });

  const contract = useMemo(
    () => parseMandateContract(mandate.contract),
    [mandate.contract],
  );

  // ── The Provision era (Wave 2) ────────────────────────────────────────────
  // A mandate carrying a provision_key declares its inputs through the
  // PROVISION; the binding's consumption map decides what the Holder consumes.
  // The legacy superset compare does NOT apply to it (retuned bind rule,
  // 2026-08-22) — any agent can bind; consumption is chosen below.
  const wave1 = useMemo(() => parseMandateWave1(mandate), [mandate]);
  const [offerState, setOfferState] = useState<
    | { status: "none" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; offer: ProvisionOffer | null }
  >(wave1.provisionKey ? { status: "loading" } : { status: "none" });
  const [consumptionDraft, setConsumptionDraft] = useState<ConsumptionMap>(
    () => parseBindingWave1(binding).consumptionMap,
  );

  useEffect(() => {
    const provisionKey = wave1.provisionKey;
    if (!provisionKey) return;
    let cancelled = false;
    fetchProvision(provisionKey)
      .then((offer) => {
        if (cancelled) return;
        if (offer === null) {
          // A mandate naming a provision no row backs is a data defect —
          // scream, and refuse the consumption editor rather than guessing.
          console.error(
            `[mandates] mandate "${mandate.mandate_key}" names provision "${provisionKey}" but no agent.provision row exists`,
          );
        }
        setOfferState({ status: "ready", offer });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOfferState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [wave1.provisionKey, mandate.mandate_key]);

  const offer = offerState.status === "ready" ? offerState.offer : null;
  const consumptionProblems = useMemo(
    () => (offer ? consumptionMapProblems(offer, consumptionDraft) : []),
    [offer, consumptionDraft],
  );
  const hasProvision = wave1.provisionKey != null;

  const contractSize =
    contract.requiredVariables.length + contract.requiredContextPolicyKeys.length;

  const runContractCheck = useCallback(
    async (candidateId: string) => {
      // Provision-era mandates: the input side is judged only by the
      // consumption map ("everything consumed must be offered") — the agent's
      // declared names are NOT required to superset anything. The candidate
      // still has to RESOLVE, which the picker's fetch below verifies.
      if (contractSize === 0 || hasProvision) {
        setContractCheck({
          status: "done",
          agentId: candidateId,
          // hasProvision: the stored contract's variable list is legacy — the
          // candidate is compared against the required names AS IF declared,
          // yielding the honest all-pass verdict (input fit is decided by the
          // consumption map, validated separately).
          result: compareStoredContract(contract, {
            variableNames: hasProvision ? contract.requiredVariables : [],
            contextPolicyKeys: hasProvision
              ? contract.requiredContextPolicyKeys
              : [],
          }),
        });
        return;
      }
      setContractCheck({ status: "checking" });
      try {
        await dispatch(fetchAgentExecutionMinimal(candidateId)).unwrap();
      } catch {
        setContractCheck({
          status: "error",
          message:
            "Couldn't load that agent's declared inputs. Check access and try again.",
        });
        return;
      }
      const payload = selectAgentExecutionPayload(
        store.getState(),
        candidateId,
      );
      if (!payload.isReady) {
        setContractCheck({
          status: "error",
          message: recordUnavailable({
            entity: "agent",
            reason: "unknown",
            recordId: candidateId,
            token: "agent",
          }).message,
        });
        return;
      }
      const result = compareStoredContract(contract, {
        variableNames: (payload.variableDefinitions ?? []).map((v) => v.name),
        contextPolicyKeys: (payload.contextPolicies ?? []).map((s) => s.key),
      });
      setContractCheck({ status: "done", agentId: candidateId, result });
    },
    [contract, contractSize, hasProvision, dispatch, store],
  );

  const handlePickAgent = (id: string) => {
    setAgentId(id);
    void runContractCheck(id);
  };

  const handleClearAgent = () => {
    setAgentId(null);
    setContractCheck({ status: "idle" });
  };

  const contractBlocked =
    agentId != null &&
    agentId !== binding?.agent_id &&
    (contractCheck.status === "checking" ||
      contractCheck.status === "error" ||
      (contractCheck.status === "done" && !contractCheck.result.passing));

  const buildConfigOverrides = (): Record<string, JsonValue> | null => {
    // Preserve keys this editor doesn't own (an admin may have set temperature
    // etc. on the same binding) — only model + thinking_level are patched here.
    const out: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(existingOverrides ?? {})) {
      if (value !== undefined) out[key] = value;
    }
    if (model) out.model = model;
    else delete out.model;
    if (thinking) out.thinking_level = thinking;
    else delete out.thinking_level;
    return Object.keys(out).length > 0 ? out : null;
  };

  const existingConsumption = useMemo(
    () => parseBindingWave1(binding).consumptionMap,
    [binding],
  );
  const consumptionDirty =
    hasProvision &&
    JSON.stringify(consumptionDraft) !== JSON.stringify(existingConsumption);

  const dirty =
    agentId !== (binding?.agent_id ?? null) ||
    consumptionDirty ||
    JSON.stringify(buildConfigOverrides()) !==
      JSON.stringify(
        existingOverrides && Object.keys(existingOverrides).length > 0
          ? existingOverrides
          : null,
      );

  const nothingSet =
    agentId == null &&
    buildConfigOverrides() == null &&
    !(hasProvision && Object.keys(consumptionDraft).length > 0);

  const consumptionBlocked = hasProvision && consumptionProblems.length > 0;

  const handleSave = async () => {
    if (contractBlocked || consumptionBlocked) return;
    const configOverrides = buildConfigOverrides();
    if (
      agentId == null &&
      configOverrides == null &&
      !(hasProvision && Object.keys(consumptionDraft).length > 0)
    ) {
      toast.error(
        "Pick a different agent, change a setting, or choose consumed values — an empty override does nothing.",
      );
      return;
    }
    setSaving(true);
    try {
      await putMandateBinding(
        dispatch,
        mandate.mandate_key,
        {
          principalType: principal.kind,
          organizationId:
            principal.kind === "org"
              ? (principal.organizationId ?? undefined)
              : undefined,
        },
        {
          agentId,
          configOverrides,
          // The server REPLACES the stored map with what is sent, so a
          // provision-era save always carries the current full draft (an
          // empty map is an explicit "consume nothing"). Legacy mandates
          // send nothing — the field stays untouched.
          ...(hasProvision ? { consumptionMap: consumptionDraft } : {}),
        },
      );
      toast.success(
        principal.kind === "org"
          ? `Override saved for ${principal.label}.`
          : "Your override is saved.",
      );
      onChanged();
    } catch (err) {
      const message =
        (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't save override: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!binding) return;
    setRemoving(true);
    try {
      await removeMandateBinding(dispatch, mandate.mandate_key, {
        principalType: principal.kind,
        organizationId:
          principal.kind === "org"
            ? (principal.organizationId ?? undefined)
            : undefined,
      });
      toast.success("Override removed — back to the system default.");
      setRemoveOpen(false);
      onChanged();
    } catch (err) {
      const message =
        (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't remove override: ${message}`);
    } finally {
      setRemoving(false);
    }
  };

  // Fork the mandate's current default into an editable personal copy, select it
  // here, and open the builder — the ONE Copy & Update implementation
  // (research's proven pattern, shared via useCopyMandateAgent).
  const handleCopyDefault = () => {
    void copyAndOpen(
      {
        defaultAgentId: mandate.default_agent_id,
        defaultAgentVersionId: mandate.default_agent_version_id,
      },
      {
        connect: (newId) => {
          setAgentId(newId);
          void runContractCheck(newId);
        },
        connectedMessage:
          "Copied — opening your editable version. Save here to connect it.",
      },
    );
  };

  const selectedAgentName = agentId
    ? (agentsById[agentId]?.name ??
      [...ownedAgents, ...sharedAgents].find((a) => a.id === agentId)?.name ??
      agentId)
    : null;

  return (
    <div className="space-y-4">
      {/* Agent swap */}
      <section>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Agent
          </h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyDefault}
            disabled={copying || saving}
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {copying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CopyPlus className="h-3 w-3" />
            )}
            Copy default &amp; customize
          </Button>
        </div>

        {agentId ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-primary/80">
                Selected agent
              </p>
              <EntityRef
                token="agent"
                id={agentId}
                name={selectedAgentName}
                showIcon={false}
                alwaysShowActions
                className="text-[13px] font-medium text-foreground"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAgent}
              className="h-7 shrink-0 gap-1 px-2 text-[11.5px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Keep system agent
            </Button>
          </div>
        ) : (
          <p className="mb-2 text-[12px] text-muted-foreground">
            No swap — the system agent keeps running this step. Pick one of your
            agents below to replace it, or just change settings.
          </p>
        )}

        {/* The canonical agent dropdown — search, Mine/Shared/All/System tabs
            with counts, sort, favorites, category + tag filters. The list is
            mounted only while the user is choosing a replacement. */}
        <AgentListDropdown
          consumerId="mandate-override-editor-agent"
          onSelect={handlePickAgent}
          activeAgentId={agentId}
          label={selectedAgentName ?? "Keep system agent"}
          initialTab="mine"
          contentSide="left"
          className="h-9 w-full"
        />

        {/* Contract check result */}
        {contractCheck.status === "checking" ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking the mandate
            contract…
          </p>
        ) : null}
        {contractCheck.status === "error" ? (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[12px]">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="text-destructive">{contractCheck.message}</span>
          </div>
        ) : null}
        {contractCheck.status === "done" ? (
          hasProvision ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              This mandate&apos;s inputs come from its Provision — any agent can
              bind. Choose what it consumes below.
            </p>
          ) : (
            <ContractResult
              contract={contractCheck.result}
              contractSize={contractSize}
            />
          )
        ) : null}
      </section>

      {/* Consumed values — the Provision's full offer (Wave 2) */}
      {hasProvision ? (
        <section>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Consumed values
          </h4>
          {offerState.status === "loading" ? (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading the
              provision&apos;s offer…
            </p>
          ) : offerState.status === "error" ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[12px]">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-destructive">
                Couldn&apos;t load the provision: {offerState.message}
              </span>
            </div>
          ) : offer ? (
            <>
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                Everything the{" "}
                <code className="font-mono">{offer.provisionKey}</code> call
                site offers. Pick what this agent consumes and how it&apos;s
                delivered — values left unconsumed stay calmly available.
              </p>
              <ConsumptionMapEditor
                offer={offer}
                pinnedContext={wave1.pinnedContext}
                value={consumptionDraft}
                onChange={setConsumptionDraft}
                disabled={saving}
              />
              {consumptionProblems.length > 0 ? (
                <ul className="mt-2 space-y-0.5 rounded-md border border-destructive/25 bg-destructive/5 p-2.5">
                  {consumptionProblems.map((problem) => (
                    <li
                      key={problem}
                      className="flex items-start gap-1.5 text-[11.5px] text-destructive"
                    >
                      <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                      {problem}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[12px]">
              <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-destructive">
                This mandate names provision{" "}
                <code className="font-mono">{wave1.provisionKey}</code>, but no
                provision row exists — a platform defect (the declaration
                hasn&apos;t synced). Consumption can&apos;t be edited until it
                lands.
              </span>
            </div>
          )}
        </section>
      ) : null}

      {/* Settings-only overrides */}
      <section>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Settings
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Model
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <SmartModelSelect
                value={model}
                onValueChange={(id) => setModel(id)}
                placeholder="Agent's own model"
                className="flex-1"
              />
              {model ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setModel(null)}
                  className="h-7 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Reset
                </Button>
              ) : null}
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">
              Thinking level
            </span>
            <Select
              value={thinking ?? THINKING_UNSET}
              onValueChange={(v) =>
                setThinking(v === THINKING_UNSET ? null : (v as ThinkingLevel))
              }
            >
              <SelectTrigger className="mt-1 h-8 text-[13px]">
                <SelectValue placeholder="Agent default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={THINKING_UNSET}>Agent default</SelectItem>
                {THINKING_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Settings apply to whichever agent runs the step — swap nothing and
          this is a settings-only override (same agent, your model and thinking
          level).
        </p>
        {/* The three layers per setting: agent's own → binding overrides →
            mandate pins (pins win, locked). Renders only when a layer above
            the agent's own definition is in play. */}
        <EffectiveConfigLayers
          pins={wave1.pins}
          bindingOverrides={buildConfigOverrides()}
          className="mt-2"
        />
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={
            saving || !dirty || nothingSet || contractBlocked || consumptionBlocked
          }
          className="h-8 gap-1.5 text-[13px]"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {binding ? "Update override" : "Save override"}
        </Button>
        {binding ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRemoveOpen(true)}
            disabled={saving || removing}
            className="h-8 gap-1.5 text-[13px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove override
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={removeOpen}
        onOpenChange={(o) => !removing && setRemoveOpen(o)}
        title="Remove this override?"
        description={
          <>
            {principal.kind === "org" ? principal.label : "You"} will fall back
            to the system default for this step. Your agents stay intact — only
            the override is cleared.
          </>
        }
        confirmLabel="Remove override"
        variant="destructive"
        busy={removing}
        onConfirm={handleRemove}
      />
    </div>
  );
}

function ContractResult({
  contract,
  contractSize,
}: {
  contract: ComparisonResult;
  contractSize: number;
}) {
  const missing =
    contract.missingVariables.length + contract.missingPolicies.length;
  const extras = contract.extraVariables.length + contract.extraPolicies.length;
  const passing = contract.passing;
  if (contractSize === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        This mandate declares no required inputs — any agent qualifies.
      </p>
    );
  }
  const requiredRows = (
    rows: ComparisonResult["matchedVariables"],
    state: ContractRowState,
    kind: "variable" | "slot",
  ) =>
    rows.map((row) => (
      <ContractItem
        key={`${state}-${kind}-${row.name}`}
        row={row}
        state={state}
        showCheck
        iconSlot={
          kind === "variable" ? (
            <Hash className="h-3 w-3" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )
        }
      />
    ));
  return (
    <div
      className={cn(
        "mt-2 rounded-md border p-2.5 text-[12px]",
        passing
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-destructive/25 bg-destructive/5",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          passing
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-destructive",
        )}
      >
        {passing ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <XCircle className="h-3.5 w-3.5" />
        )}
        {passing
          ? "Contract satisfied — this agent declares every required input."
          : `Missing ${missing} required input${missing === 1 ? "" : "s"} — it can't run this step.`}
      </p>
      <ul className="mt-1.5 divide-y divide-border/30">
        {requiredRows(contract.matchedVariables, "matched", "variable")}
        {requiredRows(contract.missingVariables, "missing", "variable")}
        {requiredRows(contract.matchedPolicies, "matched", "slot")}
        {requiredRows(contract.missingPolicies, "missing", "slot")}
      </ul>
      {extras > 0 ? (
        <div className="mt-1.5 border-t border-border/30 pt-1.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
            Beyond the contract ({extras})
          </p>
          <ul className="divide-y divide-border/30">
            {requiredRows(contract.extraVariables, "extra", "variable")}
            {requiredRows(contract.extraPolicies, "extra", "slot")}
          </ul>
          <p className="text-[11px] leading-relaxed text-muted-foreground/80">
            These won&apos;t be supplied by this step. Make sure they have
            sensible defaults.
          </p>
        </div>
      ) : null}
    </div>
  );
}
