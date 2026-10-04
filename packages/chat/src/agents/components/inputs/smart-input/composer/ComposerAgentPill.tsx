"use client";

/**
 * The agent pill (brief §8, Amendment 1 A2/A3; Arman, 2026-09-28: "the most
 * important thing in our system are agents").
 *
 *  - Chat mode — and only Chat — shows `agent · model`. Chat agents are a
 *    finite set, so the menu is: the ★ chat agents and Custom, "All agents"
 *    (the ONE agent picker), and the MODEL FOR THIS CHAT — change the model
 *    and keep the same chat agent.
 *  - Work / Advanced: the pill names the agent and IS the agent picker — one
 *    click opens it, no half-way panel. An agent is built with its model, so
 *    the model is secondary: it lives in + › Model, beside the overrides.
 *
 * The composer never switches agents itself: the host's `onSelectAgent` says
 * what switching means on that surface. No `onSelectAgent` = a fixed agent —
 * the pill is a plain label (Work+) or the model-only menu (Chat).
 */

import { useState } from "react";
import { AppWindow, ChevronDown, Gauge, Layers, Star, Webhook } from "lucide-react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "../../../../../store/hooks";
import { cn } from "@ai-matrx/design-system";
import { toast } from "../../../../../host/notify";
import { QuickRunModelSelect } from "../../../run-controls/RunModelPicker";
import { ModelListDropdown } from "@host/features/ai-models/components/lab/ModelListDropdown";
import { seedOverrides } from "../../../../redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { selectInstanceOverrideState } from "../../../../redux/execution-system/instance-model-overrides/instance-model-overrides.selectors";
import {
  effectiveOfferingPin,
  setOfferingPin,
} from "../../../../redux/execution-system/instance-model-overrides/offering-pin";
import { useSessionKnob } from "../../../../../host/prefs-react";
import { knobRefusalSentence, setKnobOverride } from "../../../../../host/prefs";
import { CHAT_DEFAULT_MODEL_KNOB } from "@host/features/ai-models/preferredChatModel";
import { selectModelLabelWithClass } from "@host/features/ai-models/redux/modelRegistrySlice";
import {
  ComposerMenuDivider,
  ComposerMenuHelp,
  ComposerMenuLabel,
  ComposerMenuRow,
  ComposerSubmenu,
  ComposerFoldedSection,
} from "./ComposerMenu";
import { ComposerOutputPanel } from "./ComposerOutput";
import { ComposerEffortRows, useComposerEffort } from "./ComposerEffortPill";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerAgentControl, ComposerMode, ComposerSize } from "./composer-types";
import { useComposerAgent, useEffectiveModelId, type ComposerAgentInfo } from "./useComposerAgent";
import { presentOrganizationRefusal } from "@host/lib/organizations/organizationRefusalToast";
import { ensureOrgId, isOrganizationSelectionCancelled } from "../../../../../host/org";

interface ComposerAgentPillProps {
  conversationId: string;
  mode: ComposerMode;
  size: ComposerSize;
  agentControl?: ComposerAgentControl;
  menuSide: "top" | "bottom";
  /**
   * The composer is narrow (useComposerFold): Output and Effort leave the row
   * and ride THIS menu, under the agent choice (Arman, 2026-10-04).
   */
  folded?: boolean;
}

export function composerPillClass(size: ComposerSize, open: boolean): string {
  return cn(
    "inline-flex h-6 min-w-0 shrink items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    size === "compact" ? "px-1.5" : "px-2",
    open && "bg-accent text-foreground",
  );
}

function pillLabel(info: ComposerAgentInfo, mode: ComposerMode): string {
  // "Custom" and the model are Chat's words; Work+ names the agent itself.
  if (!composerShows(mode, "agent.presets")) return info.agentName ?? "Agent";
  const name = info.isCustom ? "Custom" : (info.preset?.name ?? info.agentName ?? "Agent");
  return info.effectiveModelLabel ? `${name} · ${info.effectiveModelLabel}` : name;
}

export function ComposerAgentPill({ conversationId, mode, size, agentControl, menuSide, folded = false }: ComposerAgentPillProps) {
  const [open, setOpen] = useState(false);
  const effort = useComposerEffort(conversationId, useEffectiveModelId(conversationId));
  const info = useComposerAgent(conversationId);
  const label = pillLabel(info, mode);
  const onSelectAgent = agentControl?.onSelectAgent;

  // An override is in force (the person picked another model for this chat):
  // the pill names the model that will run AND marks it. Custom's model is
  // its own design, never an override of something else.
  const showOverride = info.modelOverridden && !info.isCustom && composerShows(mode, "agent.presets");
  const overrideTitle = info.agentModelLabel ? `Agent's own model: ${info.agentModelLabel}` : "Not the agent's own model";
  const pill = (
    <button
      type="button"
      className={composerPillClass(size, open)}
      aria-label={`Agent: ${label}${showOverride ? " (model changed)" : ""}`}
      title={showOverride ? `${label} — ${overrideTitle}` : label}
    >
      <span className="truncate font-medium text-foreground">{label}</span>
      {showOverride ? (
        <span
          className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] leading-4 text-muted-foreground"
          data-testid="composer-model-override-chip"
        >
          Changed
        </span>
      ) : null}
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );

  // Narrow: ONE menu — the agent choice, then Output and Effort.
  if (folded) {
    const chatPresets = composerShows(mode, "agent.presets");
    const showEffort = Boolean(effort) && composerShows(mode, "meta.effort");
    return (
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>{pill}</PopoverTrigger>
        <PopoverContent
          /* sizing: fixed — the agent menu is a fixed 320px menu of known rows (brief §8) */
          side={menuSide}
          align="end"
          sideOffset={8}
          className="flex w-80 max-h-[var(--radix-popover-content-available-height)] flex-col overflow-y-auto p-1"
        >
          {chatPresets ? (
            <ChatPresetsPanel
              conversationId={conversationId}
              info={info}
              agentControl={agentControl}
              close={() => setOpen(false)}
            />
          ) : onSelectAgent ? (
            <AgentListDropdown
              onSelect={(agentId: string) => {
                setOpen(false);
                if (agentId !== info.agentId) onSelectAgent(agentId);
              }}
              activeAgentId={info.agentId}
              contentSide="left"
              triggerSlot={
                <button
                  type="button"
                  className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-accent"
                >
                  <Webhook className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{info.agentName ?? "Agent"}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
                </button>
              }
            />
          ) : (
            <ComposerMenuRow icon={Webhook} label={info.agentName ?? "Agent"} checked />
          )}
          <ComposerFoldedSection>
            <ComposerSubmenu row={{ icon: AppWindow, label: "Output" }} panelClassName="w-80">
              <ComposerOutputPanel conversationId={conversationId} />
            </ComposerSubmenu>
            {showEffort && effort ? (
              <ComposerSubmenu row={{ icon: Gauge, label: "Effort", detail: effort.word }} panelClassName="w-56 p-1">
                {(close) => <ComposerEffortRows effort={effort} onChosen={close} />}
              </ComposerSubmenu>
            ) : null}
          </ComposerFoldedSection>
        </PopoverContent>
      </Popover>
    );
  }

  // Work / Advanced: the pill IS the agent picker.
  if (!composerShows(mode, "agent.presets")) {
    if (!onSelectAgent) {
      return (
        <span className={cn(composerPillClass(size, false), "hover:bg-transparent")} title="This page always answers with this agent">
          <span className="truncate font-medium text-foreground">{label}</span>
        </span>
      );
    }
    return (
      <AgentListDropdown
        onSelect={(agentId: string) => {
          if (agentId !== info.agentId) onSelectAgent(agentId);
        }}
        activeAgentId={info.agentId}
        contentSide={menuSide}
        triggerSlot={pill}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — the chat agent menu is a fixed 320px menu of known rows (brief §8) */
        side={menuSide}
        align="end"
        sideOffset={8}
        className="flex w-80 max-h-[var(--radix-popover-content-available-height)] flex-col overflow-y-auto p-1"
      >
        <ChatPresetsPanel
          conversationId={conversationId}
          info={info}
          agentControl={agentControl}
          close={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

// ── Chat mode: chat agents · All agents · Model for this chat ─────────────

function ChatPresetsPanel({
  conversationId,
  info,
  agentControl,
  close,
}: {
  conversationId: string;
  info: ComposerAgentInfo;
  agentControl?: ComposerAgentControl;
  close: () => void;
}) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector((s) => s.appContext?.organization_id ?? null);
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const personalModel = useSessionKnob(CHAT_DEFAULT_MODEL_KNOB);
  const personalModelId = typeof personalModel === "string" && personalModel.trim() ? personalModel : null;
  // The class (offering) of the Custom model, for THIS chat — seeded beside
  // the model so it rides config_overrides.offering_id.
  const overrideState = useAppSelector(selectInstanceOverrideState(conversationId));
  const pinnedOfferingId = effectiveOfferingPin(overrideState);
  const personalModelLabel =
    useAppSelector((s) => selectModelLabelWithClass(s, personalModelId, pinnedOfferingId)) ?? null;
  const onSelectAgent = agentControl?.onSelectAgent;

  if (!onSelectAgent) {
    return (
      <>
        <ComposerMenuLabel>Agent</ComposerMenuLabel>
        <ComposerMenuRow label={info.agentName ?? "Agent"} checked />
        <ComposerMenuHelp>This page always answers with this agent.</ComposerMenuHelp>
        <ComposerMenuDivider />
        <ComposerMenuLabel>Model for this chat</ComposerMenuLabel>
        <div className="px-1.5 pb-1">
          <QuickRunModelSelect conversationId={conversationId} className="h-8 w-full" />
        </div>
      </>
    );
  }

  const choose = (agentId: string) => {
    close();
    if (agentId !== info.agentId) onSelectAgent(agentId);
  };
  // Custom is the default-chat JOB: launching through it is what applies the
  // person's own default model (preferredChatModel.ts).
  const chooseCustom = () => {
    if (!info.customAgentId) return;
    close();
    if (!info.isCustom) {
      onSelectAgent(info.customAgentId, { mandateKey: MANDATE_KEYS.chat__default_new_chat });
    }
  };

  // Your default for Custom is a (model, class) pair, saved per organization
  // to the model knob and its class companion. With no organization known yet
  // the press is HELD: boot's answer first, then the person is asked.
  const savePersonalDefault = async (
    key: "chat_default_model" | "chat_default_offering",
    value: string,
  ): Promise<boolean> => {
    if (!userId) {
      toast.error("Sign in first — your default model is saved to your account.");
      return false;
    }
    let targetOrganizationId: string;
    try {
      targetOrganizationId = organizationId ?? (await ensureOrgId(null));
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return false;
      if (presentOrganizationRefusal(error, { subject: "Your default model", act: "saved" })) return false;
      throw error;
    }
    const result = await setKnobOverride({
      feature: "agents.model_prefs",
      key,
      scopeKind: "user",
      scopeId: userId,
      organizationId: targetOrganizationId,
      value,
      note: "Picked under Custom in the chat composer",
    });
    if (!result.ok) {
      toast.error(`Your default chat model was not saved: ${knobRefusalSentence(result)}`);
      return false;
    }
    return true;
  };

  const setPersonalModel = async (modelId: string) => {
    if (!(await savePersonalDefault("chat_default_model", modelId))) return;
    if (info.isCustom) {
      // The saved default seeds NEW conversations; this one changes now too.
      // Seeded: this is the person's DEFAULT for Custom, not a pick for this
      // chat — it must never follow them into a named agent (W-81).
      dispatch(seedOverrides({ conversationId, changes: { model: modelId } }));
    } else {
      chooseCustom();
    }
  };

  // The class is half of the default: saved beside the model ("" = the
  // model's preferred class), and seeded for this chat at once. The picker
  // reports it BEFORE the model on every path.
  const setPersonalClass = (offeringId: string | undefined) => {
    dispatch(setOfferingPin({ conversationId, offeringId, seeded: true }));
    void savePersonalDefault("chat_default_offering", offeringId ?? "");
  };

  return (
    <>
      <ComposerMenuLabel>Chat agents</ComposerMenuLabel>
      {info.presets.map((preset) => (
        <ComposerMenuRow
          key={preset.id}
          icon={Star}
          label={preset.name}
          detail={preset.modelLabel ?? undefined}
          checked={preset.id === info.agentId}
          onClick={() => choose(preset.id)}
        />
      ))}
      <ComposerMenuRow
        label="Custom"
        description="Your own default chat, on the model you pick"
        checked={info.isCustom}
        disabled={!info.customAgentId}
        onClick={chooseCustom}
      />
      <AgentListDropdown
        onSelect={(agentId: string) => choose(agentId)}
        activeAgentId={info.agentId}
        contentSide="left"
        triggerSlot={
          <button
            type="button"
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground hover:bg-accent"
          >
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">All agents</span>
            <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
          </button>
        }
      />
      <ComposerMenuDivider />
      <ComposerMenuLabel>{info.isCustom ? "Model — your default for Custom" : "Model for this chat"}</ComposerMenuLabel>
      <div className="px-1.5 pb-1">
        {info.isCustom ? (
          <ModelListDropdown
            value={personalModelId}
            onValueChange={(modelId) => void setPersonalModel(modelId)}
            pinnedOfferingId={pinnedOfferingId}
            onOfferingPinChange={setPersonalClass}
            inputModalities={[]}
            outputModalities={["text"]}
            placeholder={personalModelLabel ?? "Pick a model"}
            aria-label="Model for Custom"
            className="w-full"
          />
        ) : (
          <QuickRunModelSelect conversationId={conversationId} className="h-8 w-full" />
        )}
      </div>
    </>
  );
}
