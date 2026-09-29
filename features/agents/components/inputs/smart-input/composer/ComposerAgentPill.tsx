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
import { ChevronDown, Layers, Star } from "lucide-react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { setOverrides } from "@/features/agents/redux/execution-system/instance-model-overrides/instance-model-overrides.slice";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { knobRefusalSentence, setKnobOverride } from "@/lib/scoped-config/service";
import { CHAT_DEFAULT_MODEL_KNOB } from "@/features/ai-models/preferredChatModel";
import { selectModelLabelById } from "@/features/ai-models/redux/modelRegistrySlice";
import {
  ComposerMenuDivider,
  ComposerMenuHelp,
  ComposerMenuLabel,
  ComposerMenuRow,
} from "./ComposerMenu";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerAgentControl, ComposerMode, ComposerSize } from "./composer-types";
import { useComposerAgent, type ComposerAgentInfo } from "./useComposerAgent";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { presentOrganizationRefusal } from "@/lib/organizations/organizationRefusalToast";

interface ComposerAgentPillProps {
  conversationId: string;
  mode: ComposerMode;
  size: ComposerSize;
  agentControl?: ComposerAgentControl;
  menuSide: "top" | "bottom";
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

export function ComposerAgentPill({ conversationId, mode, size, agentControl, menuSide }: ComposerAgentPillProps) {
  const [open, setOpen] = useState(false);
  const info = useComposerAgent(conversationId);
  const label = pillLabel(info, mode);
  const onSelectAgent = agentControl?.onSelectAgent;

  const pill = (
    <button type="button" className={composerPillClass(size, open)} aria-label={`Agent: ${label}`} title={label}>
      <span className="truncate font-medium text-foreground">{label}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );

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
  const personalModelLabel = useAppSelector((s) => selectModelLabelById(s, personalModelId)) ?? null;
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

  const setPersonalModel = async (modelId: string) => {
    if (!userId) {
      toast.error("Sign in first — your default model is saved to your account.");
      return;
    }
    // Your default model is saved per organization. With none known yet the
    // press is HELD: boot's answer first, then the person is asked.
    let targetOrganizationId: string;
    try {
      targetOrganizationId = organizationId ?? (await ensureOrgId(null));
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return;
      if (presentOrganizationRefusal(error, { subject: "Your default model", act: "saved" })) return;
      throw error;
    }
    const result = await setKnobOverride({
      feature: "agents.model_prefs",
      key: "chat_default_model",
      scopeKind: "user",
      scopeId: userId,
      organizationId: targetOrganizationId,
      value: modelId,
      note: "Picked under Custom in the chat composer",
    });
    if (!result.ok) {
      toast.error(`Your default chat model was not saved: ${knobRefusalSentence(result)}`);
      return;
    }
    if (info.isCustom) {
      // The saved default seeds NEW conversations; this one changes now too.
      dispatch(setOverrides({ conversationId, changes: { model: modelId } }));
    } else {
      chooseCustom();
    }
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
