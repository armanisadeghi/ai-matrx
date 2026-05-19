"use client";

import { Lightbulb, ListChecks, Settings2, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) flushNow();
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="right"
        className="w-[380px] overflow-y-auto pb-safe"
      >
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            Session settings
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Per-session overrides. Saves automatically. Bounds are enforced
            at the database level.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-6">
          {/* Column 2 — cleaning */}
          <SettingsGroup
            icon={Zap}
            title="Cleaned transcript (Column 2)"
          >
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
              onChange={(id) =>
                update({ moduleId: id }, { immediate: true })
              }
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
                  <input
                    type="checkbox"
                    checked={effective.showPriorModules}
                    onChange={(e) =>
                      update(
                        { showPriorModules: e.currentTarget.checked },
                        { immediate: true },
                      )
                    }
                    className="h-3 w-3 accent-primary"
                  />
                  Show prior modules
                </label>
              </>
            )}
          </SettingsGroup>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface SettingsGroupProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
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