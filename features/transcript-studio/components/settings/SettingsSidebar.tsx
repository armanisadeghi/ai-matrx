"use client";

import {
  Webhook,
  Lightbulb,
  ListChecks,
  Settings2,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { AUDIO_ASSISTANT_AGENT_ID } from "../../constants";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  CLEANING_INTERVAL_DEFAULT_MS,
  CONCEPT_INTERVAL_DEFAULT_MS,
  DEFAULT_CLEANING_SHORTCUT_ID,
  DEFAULT_CONCEPT_SHORTCUT_ID,
} from "../../constants";
import { useStudioSettings } from "../../hooks/useStudioSettings";
import { getModule } from "../../modules/registry";
import { AgentShortcutPicker } from "./AgentShortcutPicker";
import { IntervalSlider } from "./IntervalSlider";
import { ModulePicker } from "./ModulePicker";
import { Checkbox } from "@/components/ui/checkbox";

interface SettingsSidebarProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Per-session settings sheet. Slides in from the right edge. Each control
 * writes through `useStudioSettings.update`, which debounces slider drags
 * and fires module / shortcut picks immediately.
 *
 * The active module's interval slider is shown only when the module is
 * registered (otherwise we'd lock the user to a default they can't reset).
 */
export function SettingsSidebar({
  sessionId,
  open,
  onOpenChange,
}: SettingsSidebarProps) {
  const { effective, update, bounds, flushNow } = useStudioSettings(sessionId);
  const moduleDef = getModule(effective.moduleId);

  const handleOpenChange = (next: boolean) => {
    if (!next) flushNow();
    onOpenChange(next);
  };

  const settingsBody = (
    <div className="flex flex-col gap-6">
      {/* Audio assistant — the chat agent in the Agent / Live / Agent+ tabs */}
      <SettingsGroup icon={Webhook} title="Scribe assistant">
        <DefaultAssistantAgentPicker />
      </SettingsGroup>

      {/* Column 2 — cleaning */}
      <SettingsGroup icon={Zap} title="Cleaned transcript (Column 2)">
        <AgentShortcutPicker
          label="Cleaning agent"
          description="Polishes Column 1 text via the [[RESUME]] marker contract."
          value={effective.cleaningShortcutId}
          defaultId={DEFAULT_CLEANING_SHORTCUT_ID}
          onChange={(id) =>
            update({ cleaningShortcutId: id }, { immediate: true })
          }
        />
        <IntervalSlider
          label="Cleaning interval"
          description="Plus a ±5s silence-detection window."
          valueMs={effective.cleaningIntervalMs}
          minMs={bounds.cleaning.min}
          maxMs={bounds.cleaning.max}
          defaultMs={CLEANING_INTERVAL_DEFAULT_MS}
          stepMs={5000}
          onChange={(ms) => update({ cleaningIntervalMs: ms })}
        />
      </SettingsGroup>

      {/* Column 3 — concepts */}
      <SettingsGroup icon={Lightbulb} title="Concepts (Column 3)">
        <AgentShortcutPicker
          label="Concept agent"
          description="Themes, key ideas, entities, questions."
          value={effective.conceptShortcutId}
          defaultId={DEFAULT_CONCEPT_SHORTCUT_ID}
          onChange={(id) =>
            update({ conceptShortcutId: id }, { immediate: true })
          }
        />
        <IntervalSlider
          label="Extraction interval"
          valueMs={effective.conceptIntervalMs}
          minMs={bounds.concept.min}
          maxMs={bounds.concept.max}
          defaultMs={CONCEPT_INTERVAL_DEFAULT_MS}
          stepMs={10000}
          onChange={(ms) => update({ conceptIntervalMs: ms })}
        />
      </SettingsGroup>

      {/* Column 4 — pluggable module */}
      <SettingsGroup icon={ListChecks} title="Module (Column 4)">
        <ModulePicker
          value={effective.moduleId}
          onChange={(id) => update({ moduleId: id }, { immediate: true })}
        />
        {moduleDef && (
          <>
            <AgentShortcutPicker
              label={`${moduleDef.label} agent`}
              description="Override the module's default shortcut."
              value={effective.moduleShortcutId}
              defaultId={moduleDef.defaultShortcutId}
              onChange={(id) =>
                update({ moduleShortcutId: id }, { immediate: true })
              }
            />
            <IntervalSlider
              label={`${moduleDef.label} interval`}
              valueMs={effective.moduleIntervalMs}
              minMs={bounds.module.min}
              maxMs={bounds.module.max}
              defaultMs={moduleDef.defaultIntervalMs}
              stepMs={5000}
              onChange={(ms) => update({ moduleIntervalMs: ms })}
            />
            <label className="flex items-center gap-2 text-[11px] text-foreground">
              <Checkbox
                checked={effective.showPriorModules}
                onCheckedChange={(v) =>
                  update({ showPriorModules: v === true }, { immediate: true })
                }
              />
              Show prior modules
            </label>
          </>
        )}
      </SettingsGroup>
    </div>
  );

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={handleOpenChange}
      title={
        <span className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          Session settings
        </span>
      }
      description="Per-session overrides. Saves automatically. Bounds are enforced at the database level."
      expandButtonLabel="Session settings"
      position="right"
      defaultSize={30}
    >
      {settingsBody}
    </MatrxDynamicPanelHost>
  );
}

interface SettingsGroupProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}

/**
 * User-wide default agent for the Scribe audio assistant. New sessions start
 * with this agent; each session can then switch on its own (the per-session
 * choice lives on the session, not here). Null → the seeded default agent.
 */
function DefaultAssistantAgentPicker() {
  const [agentId, setAgentId] = useSetting<string | null>(
    "userPreferences.transcription.scribeAssistantAgentId",
  );
  const effectiveId = agentId ?? AUDIO_ASSISTANT_AGENT_ID;
  const name = useAppSelector((s) => selectAgentById(s, effectiveId)?.name);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-foreground">
        Default agent
      </label>
      <div className="flex items-center gap-2">
        <AgentListDropdown
          onSelect={(id) => setAgentId(id)}
          compact
          triggerSlot={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 py-1.5 text-left transition-colors active:bg-accent"
            >
              <Webhook className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate text-[12px] text-foreground">
                {name ?? "Default assistant"}
              </span>
            </button>
          }
        />
        {agentId && (
          <button
            type="button"
            onClick={() => setAgentId(null)}
            className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            Reset
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Used for new sessions. Each session can change its own agent.
      </p>
    </div>
  );
}

function SettingsGroup({ icon: Icon, title, children }: SettingsGroupProps) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
        <Icon className="h-3 w-3 text-muted-foreground" />
        {title}
      </h3>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

void X; // reserved — close-button icon may surface later
void cn;
