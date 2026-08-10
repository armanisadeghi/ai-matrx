"use client";

/**
 * SlotAgentPicker — the reusable consumer-facing "which agent runs this step"
 * control. Drop it next to any affordance whose agent resolves through an
 * agent slot: it shows the currently-resolved agent (system default vs your
 * override), and lets the user swap in one of THEIR agents or reset to the
 * system default.
 *
 * THE TWO SELECTION LAWS (SoR common-docs/systems/agent-slots/FEATURE.md):
 * options feed from the canonical Redux agent-definition slice
 * (selectOwnedAgents + selectSharedWithMeAgents — never a raw table dump),
 * rendered through the ONE canonical picker (AgentListInlinePicker).
 *
 * Writes ride the ONE bind path (aidream PUT/DELETE
 * /agent-slots/{slot_key}/binding). The candidate is contract-checked
 * client-side as an instant pre-flight; the server's bind-time check is the
 * authority and its 422 detail is shown VERBATIM. Saving invalidates the
 * client slot cache, so any mounted useAgentSlot consumer re-resolves
 * automatically. The full editor (settings-only overrides, org bindings)
 * lives at /agents/slots.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Loader2, RotateCcw, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { isJsonObject, type JsonValue } from "@/types/json";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  fetchAgentExecutionMinimal,
  fetchAgentsListFull,
} from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentExecutionPayload,
  selectOwnedAgents,
  selectSharedWithMeAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentListInlinePicker } from "@/features/agents/components/agent-listings/AgentListInlinePicker";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import type { ContextSlot } from "@/features/agents/types/agent-api-types";
import {
  fetchSlotPickerData,
  parseSlotContract,
  putSlotBinding,
  removeSlotBinding,
  type SlotPickerData,
} from "../overrides";
import { compareContracts, compareStoredContract } from "../contract-compare";

/** Externally-owned override store (e.g. research's per-topic
 * `rs_topic.agent_config`). When provided, picking a candidate still runs the
 * contract pre-flight (against `contractSource` when supplied, else the
 * slot's stored contract) but the WRITE goes through these callbacks instead
 * of a user `agent.slot_binding`. */
export interface SlotAgentPickerOverrideControl {
  /** The current override agent id, or null when the default runs. */
  agentId: string | null;
  apply: (candidateId: string) => Promise<void> | void;
  reset: () => Promise<void> | void;
}

/** A live full-declaration comparison source (a system agent's declared
 * variables + context slots) for the pre-flight, in place of the slot's
 * STORED contract. Same shape `selectAgentExecutionPayload` returns. */
export interface SlotContractSource {
  variableDefinitions: VariableDefinition[] | null;
  contextSlots: ContextSlot[];
}

export function SlotAgentPicker({
  slotKey,
  className,
  override,
  contractSource,
}: {
  slotKey: string;
  /** Styles the trigger button. */
  className?: string;
  override?: SlotAgentPickerOverrideControl;
  /** When set, the contract pre-flight compares the candidate against THIS
   * live declaration (canonical `compareContracts`) instead of the slot's
   * stored contract — research passes the live system agent so what the role
   * card SHOWS is what the pre-flight CHECKS. Pass null while the live
   * declaration is still loading; the stored contract is the fallback. */
  contractSource?: SlotContractSource | null;
}) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const userId = useAppSelector(selectUserId);

  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SlotPickerData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preflight, setPreflight] = useState<string | null>(null);

  const ownedAgents = useAppSelector(selectOwnedAgents);
  const sharedAgents = useAppSelector(selectSharedWithMeAgents);


  const load = useCallback(() => {
    if (!userId) return;
    fetchSlotPickerData(slotKey, userId)
      .then((next) => {
        setData(next);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[agent-slots] picker failed to load ${slotKey}:`, message);
        setLoadError(message);
      });
  }, [slotKey, userId]);

  // Load lazily on first open (and refresh options via the canonical listing).
  useEffect(() => {
    if (!open) return;
    load();
    void dispatch(fetchAgentsListFull());
  }, [open, load, dispatch]);

  const overrideAgentId = override
    ? override.agentId
    : data?.myBinding?.is_enabled
      ? (data.myBinding.agent_id ?? null)
      : null;
  const overrideAgentName = overrideAgentId
    ? ([...ownedAgents, ...sharedAgents].find((a) => a.id === overrideAgentId)
        ?.name ?? "your agent")
    : null;

  const handlePick = async (candidateId: string) => {
    if (!data || saving || candidateId === overrideAgentId) return;
    setPreflight(null);
    setSaving(true);
    try {
      // Instant client pre-flight (the server's bind-time check is
      // authoritative for binding writes; for externally-owned overrides this
      // pre-flight IS the gate). The candidate must at least RESOLVE — an
      // agent the execution RPC can't see (inaccessible, deleted) is never
      // silently bound, even when the slot declares no contract requirements.
      await dispatch(fetchAgentExecutionMinimal(candidateId)).unwrap();
      const payload = selectAgentExecutionPayload(store.getState(), candidateId);
      if (!payload.isReady) {
        setPreflight(
          "Could not verify this agent — it may be inaccessible or deleted.",
        );
        return;
      }
      // Comparison source: the live declaration when the consumer supplied
      // one (what the surface SHOWS is what we CHECK), else the slot's
      // stored contract.
      const check = contractSource
        ? compareContracts(contractSource, {
            variableDefinitions: payload.variableDefinitions,
            contextSlots: payload.contextSlots ?? [],
          })
        : compareStoredContract(parseSlotContract(data.slot.contract), {
            variableNames: (payload.variableDefinitions ?? []).map((v) => v.name),
            contextSlotKeys: (payload.contextSlots ?? []).map((s) => s.key),
          });
      if (!check.passing) {
        setPreflight(
          `That agent can't run this step — missing: ${[
            ...check.missingVariables,
            ...check.missingSlots,
          ]
            .map((r) => r.name)
            .join(", ")}`,
        );
        return;
      }
      if (override) {
        await override.apply(candidateId);
      } else {
        // Preserve any settings-only overrides already on the binding.
        const existing = data.myBinding?.config_overrides;
        const configOverrides = isJsonObject(existing)
          ? Object.fromEntries(
              Object.entries(existing).filter(
                (entry): entry is [string, JsonValue] => entry[1] !== undefined,
              ),
            )
          : null;
        await putSlotBinding(
          dispatch,
          slotKey,
          { principalType: "user" },
          {
            agentId: candidateId,
            configOverrides,
          },
        );
      }
      toast.success("This step now runs your agent.");
      load();
    } catch (err) {
      // A 422 here is the server's contract verdict — shown verbatim.
      const message = err instanceof Error ? err.message : String(err);
      setPreflight(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (saving) return;
    setPreflight(null);
    setSaving(true);
    try {
      if (override) {
        await override.reset();
      } else {
        await removeSlotBinding(dispatch, slotKey, { principalType: "user" });
      }
      toast.success("Back to the system default.");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't reset: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!userId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground",
            className,
          )}
          title="Choose which agent runs this step"
        >
          <Settings2 className="h-3 w-3" />
          {overrideAgentName ? (
            <span className="max-w-40 truncate">{overrideAgentName}</span>
          ) : (
            "Agent"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-3">
        {loadError ? (
          <p className="flex items-start gap-1.5 text-[12px] text-destructive">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            {loadError}
          </p>
        ) : !data ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {data.slot.label ?? data.slot.slot_key}
              </p>
              <p className="text-[11.5px] text-muted-foreground">
                Pick which agent runs this step. Yours must accept the same inputs.
              </p>
            </div>

            {/* System default row */}
            <button
              type="button"
              onClick={() => void handleReset()}
              disabled={saving || overrideAgentId == null}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                overrideAgentId == null
                  ? "border-primary/25 bg-primary/[0.05]"
                  : "border-border/60 hover:border-border",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-foreground">
                  {data.defaultAgentName}
                </span>
                <span className="block text-[10.5px] text-muted-foreground">
                  System default
                </span>
              </span>
              {overrideAgentId == null ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <RotateCcw className="h-2.5 w-2.5" /> Use default
                </span>
              )}
            </button>

            {/* THE canonical agent picker — full search, tabs with counts,
                sort, favorites, category + tag filters. */}
            <AgentListInlinePicker
              consumerId={`slot-agent-picker-${slotKey}`}
              onSelect={(id) => void handlePick(id)}
              activeAgentId={overrideAgentId}
              initialTab="mine"
              autoFocusSearch={false}
              className="h-80 rounded-md border border-border bg-card"
            />

            {saving ? (
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking and saving…
              </p>
            ) : null}
            {preflight ? (
              <p className="flex items-start gap-1.5 text-[11.5px] text-destructive">
                <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                {preflight}
              </p>
            ) : null}

            <p className="text-[10.5px] text-muted-foreground">
              Settings-only overrides (model, thinking level) and org-wide overrides live in{" "}
              <Link
                href="/agents/slots"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Agent steps
              </Link>
              .
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
