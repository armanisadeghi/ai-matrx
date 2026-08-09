"use client";

/**
 * Per-slot override editor — one principal (me, or an org I admin) at a time:
 * swap the agent (my agents, contract-checked) and/or override settings
 * (model, thinking level). Writes ride the ONE bind path — aidream
 * PUT/DELETE /agent-slots/{slot_key}/binding — which contract-enforces the
 * candidate at write time; its 422 detail is surfaced to the user VERBATIM.
 * The client-side check here is the instant pre-flight only.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
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
import { isJsonObject, type JsonValue } from "@/types/json";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  duplicateAgent,
  duplicateAgentVersion,
  fetchAgentExecutionMinimal,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentExecutionPayload,
  selectOwnedAgents,
  selectSharedWithMeAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import { SmartModelSelect } from "@/features/ai-models/components/smart/SmartModelSelect";
import {
  checkSlotContract,
  parseSlotContract,
  putSlotBinding,
  removeSlotBinding,
  type SlotAgentSummary,
  type SlotBindingRow,
  type SlotContractCheck,
  type SlotDefinitionRow,
} from "../overrides";

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
interface SlotOverrideEditorProps {
  slot: SlotDefinitionRow;
  principal: OverridePrincipal;
  binding: SlotBindingRow | null;
  agentsById: Record<string, SlotAgentSummary>;
  onChanged: () => void;
}

export function SlotOverrideEditor({
  slot,
  principal,
  binding,
  agentsById,
  onChanged,
}: SlotOverrideEditorProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();

  const ownedAgents = useAppSelector(selectOwnedAgents);
  const sharedAgents = useAppSelector(selectSharedWithMeAgents);


  const existingOverrides = useMemo(
    () => (binding && isJsonObject(binding.config_overrides) ? binding.config_overrides : null),
    [binding],
  );

  const [agentId, setAgentId] = useState<string | null>(binding?.agent_id ?? null);
  const [model, setModel] = useState<string | null>(
    typeof existingOverrides?.model === "string" ? existingOverrides.model : null,
  );
  const [thinking, setThinking] = useState<ThinkingLevel | null>(() => {
    const v = existingOverrides?.thinking_level;
    return THINKING_LEVELS.find((l) => l === v) ?? null;
  });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [contractCheck, setContractCheck] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | { status: "error"; message: string }
    | { status: "done"; agentId: string; result: SlotContractCheck }
  >({ status: "idle" });

  const contract = useMemo(() => parseSlotContract(slot.contract), [slot.contract]);
  const contractSize = contract.requiredVariables.length + contract.requiredContextSlots.length;

  const runContractCheck = useCallback(
    async (candidateId: string) => {
      if (contractSize === 0) {
        setContractCheck({
          status: "done",
          agentId: candidateId,
          result: {
            matchedVariables: [],
            missingVariables: [],
            matchedSlots: [],
            missingSlots: [],
            passing: true,
          },
        });
        return;
      }
      setContractCheck({ status: "checking" });
      try {
        await dispatch(fetchAgentExecutionMinimal(candidateId)).unwrap();
      } catch {
        setContractCheck({
          status: "error",
          message: "Couldn't load that agent's declared inputs. Check access and try again.",
        });
        return;
      }
      const payload = selectAgentExecutionPayload(store.getState(), candidateId);
      if (!payload.isReady) {
        setContractCheck({
          status: "error",
          message: "Agent not found, or you don't have access to it.",
        });
        return;
      }
      const result = checkSlotContract(contract, {
        variableNames: (payload.variableDefinitions ?? []).map((v) => v.name),
        contextSlotKeys: (payload.contextSlots ?? []).map((s) => s.key),
      });
      setContractCheck({ status: "done", agentId: candidateId, result });
    },
    [contract, contractSize, dispatch, store],
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

  const dirty =
    agentId !== (binding?.agent_id ?? null) ||
    JSON.stringify(buildConfigOverrides()) !==
      JSON.stringify(
        existingOverrides && Object.keys(existingOverrides).length > 0 ? existingOverrides : null,
      );

  const nothingSet = agentId == null && buildConfigOverrides() == null;

  const handleSave = async () => {
    if (contractBlocked) return;
    const configOverrides = buildConfigOverrides();
    if (agentId == null && configOverrides == null) {
      toast.error("Pick a different agent or change a setting — an empty override does nothing.");
      return;
    }
    setSaving(true);
    try {
      await putSlotBinding(
        dispatch,
        slot.slot_key,
        {
          principalType: principal.kind,
          organizationId:
            principal.kind === "org" ? (principal.organizationId ?? undefined) : undefined,
        },
        { agentId, configOverrides },
      );
      toast.success(
        principal.kind === "org"
          ? `Override saved for ${principal.label}.`
          : "Your override is saved.",
      );
      onChanged();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't save override: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!binding) return;
    setRemoving(true);
    try {
      await removeSlotBinding(dispatch, slot.slot_key, {
        principalType: principal.kind,
        organizationId:
          principal.kind === "org" ? (principal.organizationId ?? undefined) : undefined,
      });
      toast.success("Override removed — back to the system default.");
      setRemoveOpen(false);
      onChanged();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't remove override: ${message}`);
    } finally {
      setRemoving(false);
    }
  };

  // Fork the slot's current default into an editable personal copy, select it
  // here, and open the builder (research's proven "Copy & Update" pattern).
  const handleCopyDefault = async () => {
    setCopying(true);
    try {
      const newId = slot.default_agent_version_id
        ? await dispatch(
            duplicateAgentVersion({ versionId: slot.default_agent_version_id, asSystem: false }),
          ).unwrap()
        : slot.default_agent_id
          ? await dispatch(
              duplicateAgent({ agentId: slot.default_agent_id, asSystem: false }),
            ).unwrap()
          : null;
      if (!newId) {
        toast.error("This slot has no default agent to copy.");
        return;
      }
      setAgentId(newId);
      void runContractCheck(newId);
      toast.success("Copied — opening your editable version. Save here to connect it.");
      router.push(`/agents/${newId}/build`);
    } catch (err) {
      const message = (err as { message?: string } | null)?.message ?? "unknown error";
      toast.error(`Couldn't copy agent: ${message}`);
    } finally {
      setCopying(false);
    }
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
            No swap — the system agent keeps running this step. Pick one of your agents below to
            replace it, or just change settings.
          </p>
        )}

        {/* THE canonical agent picker — search, Mine/Shared/All/System tabs
            with counts, sort, favorites, category + tag filters. Opens on
            "Mine" because a swap replaces the system agent with YOUR agent. */}
        <AgentListInlinePicker
          consumerId="slot-override-editor-agent"
          onSelect={handlePickAgent}
          activeAgentId={agentId}
          initialTab="mine"
          autoFocusSearch={false}
          className="h-80 rounded-md border border-border bg-card"
        />

        {/* Contract check result */}
        {contractCheck.status === "checking" ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Checking the slot contract…
          </p>
        ) : null}
        {contractCheck.status === "error" ? (
          <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5 text-[12px]">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
            <span className="text-destructive">{contractCheck.message}</span>
          </div>
        ) : null}
        {contractCheck.status === "done" ? (
          <ContractResult contract={contractCheck.result} contractSize={contractSize} />
        ) : null}
      </section>

      {/* Settings-only overrides */}
      <section>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Settings
        </h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Model</span>
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
            <span className="text-[11px] font-medium text-muted-foreground">Thinking level</span>
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
          Settings apply to whichever agent runs the step — swap nothing and this is a
          settings-only override (same agent, your model and thinking level).
        </p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty || nothingSet || contractBlocked}
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
            {principal.kind === "org" ? principal.label : "You"} will fall back to the system
            default for this step. Your agents stay intact — only the override is cleared.
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
  contract: SlotContractCheck;
  contractSize: number;
}) {
  const missing = contract.missingVariables.length + contract.missingSlots.length;
  const passing = contract.passing;
  if (contractSize === 0) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        This slot declares no required inputs — any agent qualifies.
      </p>
    );
  }
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
          passing ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
        )}
      >
        {passing ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
        {passing
          ? "Contract satisfied — this agent declares every required input."
          : `Missing ${missing} required input${missing === 1 ? "" : "s"} — it can't run this step.`}
      </p>
      {!passing ? (
        <ul className="mt-1.5 space-y-1">
          {contract.missingVariables.map((name) => (
            <li key={`v-${name}`} className="flex items-center gap-1.5 text-destructive/90">
              <Hash className="h-3 w-3" />
              <code className="font-mono">{name}</code>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/60" />
              <span className="text-muted-foreground">required variable</span>
            </li>
          ))}
          {contract.missingSlots.map((name) => (
            <li key={`s-${name}`} className="flex items-center gap-1.5 text-destructive/90">
              <KeyRound className="h-3 w-3" />
              <code className="font-mono">{name}</code>
              <ArrowRight className="h-2.5 w-2.5 text-muted-foreground/60" />
              <span className="text-muted-foreground">required context slot</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
