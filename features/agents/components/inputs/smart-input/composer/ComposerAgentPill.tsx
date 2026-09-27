"use client";

/**
 * The agent pill (brief §8, Amendment 1 A2/A3).
 *
 *  - Chat mode: a flat list of ★ chat presets (`name · model`), then Custom
 *    (the default chat agent — `chat.default_new_chat` — with the person's own
 *    default model), then "Manage chat agents". Pill label: `name · model` for
 *    a preset or Custom, the agent's name otherwise.
 *  - Work mode: the agent panel — the agent + Change (the ONE agent picker),
 *    Recent (last three), Model (the canonical model picker, per conversation).
 *  - Advanced adds Overrides and Advanced (today's run-settings screens).
 *
 * The composer never switches agents itself: the host's `onSelectAgent` says
 * what switching means on that surface. No `onSelectAgent` = a fixed agent —
 * no presets, no Change, no Recent.
 */

import { useState } from "react";
import { AppWindow, ChevronDown, Cpu, Star } from "lucide-react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { QuickRunModelSelect } from "@/features/agents/components/run-controls/RunModelPicker";
import { RunConfigOverrides } from "@/features/agents/components/run-controls/RunConfigOverrides";
import { RunInputCapabilities } from "@/features/agents/components/run-controls/RunInputCapabilities";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { useOpenRunControlsWindow } from "@/features/overlays/openers/runControlsWindow";
import { selectIsManualExecutionMode } from "@/features/agents/redux/execution-system/selectors/aggregate.selectors";
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
  ComposerSubmenu,
} from "./ComposerMenu";
import { composerShows } from "./composer-mode-visibility";
import type { ComposerAgentControl, ComposerMode, ComposerSize } from "./composer-types";
import { useComposerAgent, type ComposerAgentInfo } from "./useComposerAgent";
import { useRecentWorkAgents } from "./useRecentWorkAgents";

const MANUAL_MODE_HINT = "Per-run settings are edited in the builder panel during test runs";

interface ComposerAgentPillProps {
  conversationId: string;
  mode: ComposerMode;
  size: ComposerSize;
  agentControl?: ComposerAgentControl;
  menuSide: "top" | "bottom";
}

export function composerPillClass(size: ComposerSize, open: boolean): string {
  return cn(
    "inline-flex min-w-0 shrink items-center gap-1 rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    size === "compact" ? "h-7 px-1.5 text-[13px]" : "h-8 px-2 text-sm",
    open && "bg-accent text-foreground",
  );
}

function pillLabel(info: ComposerAgentInfo, mode: ComposerMode): string {
  const name = info.agentName ?? "Agent";
  if (composerShows(mode, "agent.presets")) {
    if (info.isCustom) return info.effectiveModelLabel ? `Custom · ${info.effectiveModelLabel}` : "Custom";
    if (info.preset) {
      return info.effectiveModelLabel ? `${info.preset.name} · ${info.effectiveModelLabel}` : info.preset.name;
    }
  }
  return name;
}

export function ComposerAgentPill({ conversationId, mode, size, agentControl, menuSide }: ComposerAgentPillProps) {
  const [open, setOpen] = useState(false);
  const info = useComposerAgent(conversationId);
  const label = pillLabel(info, mode);
  const presetsMode = composerShows(mode, "agent.presets");

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={composerPillClass(size, open)}
          aria-label={`Agent: ${label}`}
          title={label}
        >
          <span className="truncate font-medium text-foreground">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        /* sizing: fixed — the agent panel is a fixed 320px menu of known rows (brief §8) */
        side={menuSide}
        align="end"
        sideOffset={8}
        className="flex w-80 max-h-[var(--radix-popover-content-available-height)] flex-col overflow-y-auto p-1"
      >
        {presetsMode ? (
          <ChatPresetsPanel
            conversationId={conversationId}
            info={info}
            agentControl={agentControl}
            close={() => setOpen(false)}
          />
        ) : (
          <AgentPanel
            conversationId={conversationId}
            info={info}
            mode={mode}
            agentControl={agentControl}
            open={open}
            close={() => setOpen(false)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Chat mode: presets · Custom · Manage ────────────────────────────────────

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
        <ComposerMenuRow label={info.agentName ?? "Agent"} detail={info.effectiveModelLabel ?? undefined} checked />
        <ComposerMenuHelp>This page always answers with this agent.</ComposerMenuHelp>
      </>
    );
  }

  const choose = (agentId: string) => {
    close();
    if (agentId !== info.agentId) onSelectAgent(agentId);
  };

  const setPersonalModel = async (modelId: string) => {
    if (!organizationId || !userId) {
      toast.error("Choose an organization first — your default model is saved per organization.");
      return;
    }
    const result = await setKnobOverride({
      feature: "agents.model_prefs",
      key: "chat_default_model",
      scopeKind: "user",
      scopeId: userId,
      organizationId,
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
    } else if (info.customAgentId) {
      choose(info.customAgentId);
    }
  };

  return (
    <>
      <ComposerMenuLabel>Chat agents</ComposerMenuLabel>
      {info.presets.length === 0 ? (
        <ComposerMenuHelp>
          No chat presets yet. An agent becomes a preset when it carries the chat-agent tag.
        </ComposerMenuHelp>
      ) : (
        info.presets.map((preset) => (
          <ComposerMenuRow
            key={preset.id}
            icon={Star}
            label={preset.name}
            detail={preset.modelLabel ?? undefined}
            checked={preset.id === info.agentId}
            onClick={() => choose(preset.id)}
          />
        ))
      )}
      <ComposerMenuDivider />
      <ComposerMenuRow
        label="Custom"
        description="Your own default chat, on the model you pick"
        checked={info.isCustom}
        disabled={!info.customAgentId}
        onClick={() => info.customAgentId && choose(info.customAgentId)}
      />
      <div className="px-1.5 pb-1">
        <ModelListDropdown
          value={personalModelId}
          onValueChange={(modelId) => void setPersonalModel(modelId)}
          inputModalities={[]}
          outputModalities={["text"]}
          placeholder={personalModelLabel ?? "Pick a model"}
          aria-label="Model for Custom"
          className="w-full"
        />
      </div>
      <ComposerMenuDivider />
      <Link
        href="/agents/all"
        onClick={close}
        className="flex h-9 w-full items-center rounded-lg px-2.5 text-sm text-foreground hover:bg-accent"
      >
        <span className="min-w-0 flex-1 truncate">Manage chat agents</span>
        <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
      </Link>
    </>
  );
}

// ── Work / Advanced: the agent panel ────────────────────────────────────────

function AgentPanel({
  conversationId,
  info,
  mode,
  agentControl,
  open,
  close,
}: {
  conversationId: string;
  info: ComposerAgentInfo;
  mode: ComposerMode;
  agentControl?: ComposerAgentControl;
  open: boolean;
  close: () => void;
}) {
  const isManualMode = useAppSelector(selectIsManualExecutionMode(conversationId));
  const openRunControlsWindow = useOpenRunControlsWindow();
  const onSelectAgent = agentControl?.onSelectAgent;
  const recent = useRecentWorkAgents(open && Boolean(onSelectAgent), [
    info.agentId,
    info.customAgentId,
    ...info.presets.map((p) => p.id),
  ]);

  const choose = (agentId: string) => {
    close();
    if (onSelectAgent && agentId !== info.agentId) onSelectAgent(agentId);
  };

  return (
    <>
      <ComposerMenuLabel>Agent</ComposerMenuLabel>
      <div className="flex h-9 min-w-0 items-center gap-2 px-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{info.agentName ?? "Agent"}</span>
        {onSelectAgent ? (
          <AgentListDropdown
            onSelect={(agentId: string) => choose(agentId)}
            activeAgentId={info.agentId}
            contentSide="left"
            triggerSlot={
              <span className="inline-flex h-6 shrink-0 cursor-pointer items-center rounded-md bg-primary/10 px-2 text-xs font-medium text-primary hover:bg-primary/15">
                Change
              </span>
            }
          />
        ) : null}
      </div>

      {onSelectAgent ? (
        <>
          <ComposerMenuLabel>Recent</ComposerMenuLabel>
          {recent.status === "loading" ? (
            <div className="space-y-1 px-2.5 py-1" aria-busy="true" aria-label="Loading recent agents">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ) : recent.status === "error" ? (
            <ComposerMenuHelp>Your recent agents could not be read: {recent.message}</ComposerMenuHelp>
          ) : recent.agents.length === 0 ? (
            <ComposerMenuHelp>Agents you start conversations with will appear here.</ComposerMenuHelp>
          ) : (
            recent.agents.map((agent) => (
              <ComposerMenuRow key={agent.id} label={agent.name} onClick={() => choose(agent.id)} />
            ))
          )}
        </>
      ) : null}

      <ComposerMenuDivider />
      <ComposerMenuLabel>Model</ComposerMenuLabel>
      <div className="px-1.5 pb-1">
        <QuickRunModelSelect conversationId={conversationId} className="h-8 w-full" />
      </div>

      {composerShows(mode, "agent.overrides") ? (
        <>
          <ComposerMenuDivider />
          <ComposerSubmenu
            row={{
              icon: Cpu,
              label: "Overrides",
              disabled: isManualMode,
              title: isManualMode ? MANUAL_MODE_HINT : "Per-run model overrides",
            }}
            panelClassName="w-[360px] h-[min(70dvh,520px)]"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <RunConfigOverrides conversationId={conversationId} />
              <RunInputCapabilities conversationId={conversationId} />
            </div>
          </ComposerSubmenu>
          <ComposerMenuRow
            icon={AppWindow}
            label="Advanced"
            disabled={isManualMode}
            title={isManualMode ? MANUAL_MODE_HINT : "Advanced settings"}
            chevron
            onClick={() => {
              close();
              openRunControlsWindow({ conversationId, initialTab: "settings" });
            }}
          />
        </>
      ) : null}
    </>
  );
}
