"use client";

/**
 * ShapeChipsRow — compact discovery chips for the high-value render_block
 * shapes ("Flashcards", "Quiz", "Timeline", "Comparison", "Diagram") inside
 * the Quickset panel.
 *
 * Users can't discover shapes when emission depends on magic words — these
 * chips make the skills visible and one-click. A chip toggles its skill into
 * `builderAdvancedSettings.addedSkills` (the SAME per-run state RunSkillPicker
 * writes; `buildSkillConfigForRequest` folds it into the request's
 * `skill_config.included`). Visibility is resolved from the live skill list
 * the skills slice already holds (`useSkills`) — a chip only shows when its
 * render_block skill exists and is active. No new fetch, no new state.
 */

import type { ComponentType, ReactNode } from "react";
import {
  Layers,
  ListChecks,
  CalendarClock,
  Columns3,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { resolveShapeChips } from "./shape-chips";

/** Chip key → Lucide icon (kept out of the pure resolver module). */
const CHIP_ICONS: Record<string, LucideIcon> = {
  flashcards: Layers,
  quiz: ListChecks,
  timeline: CalendarClock,
  comparison: Columns3,
  diagram: Workflow,
};

export function ShapeChipsRow({
  conversationId,
  row: LabeledRow,
}: {
  conversationId: string;
  /**
   * The host panel's labeled-row wrapper (QuicksetPanel's `Row`). Passed in —
   * not applied by the caller — so the "Shapes" label only renders when at
   * least one chip resolves (cold skills slice / zero matches → nothing, not
   * an empty labeled row).
   */
  row: ComponentType<{ label: string; children: ReactNode }>;
}) {
  const dispatch = useAppDispatch();
  // Same slice-backed list RunSkillPicker reads — the slice status guard makes
  // this a no-op re-read when the list is already loaded.
  const { skills } = useSkills();

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedSkills ?? [];
  const added = new Set(addedList);

  const chips = resolveShapeChips(skills);
  if (chips.length === 0) return null;

  const toggle = (registryId: string) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: {
          addedSkills: added.has(registryId)
            ? addedList.filter((id) => id !== registryId)
            : [...addedList, registryId],
        },
      }),
    );

  return (
    <LabeledRow label="Shapes">
      <div className="flex flex-wrap gap-1">
        {chips.map((chip) => {
          const Icon = CHIP_ICONS[chip.key] ?? Layers;
          const selected = added.has(chip.registryId);
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(chip.registryId)}
              title={
                selected
                  ? `${chip.label} skill added to this run — click to remove`
                  : `Add the ${chip.label} skill to this run`
              }
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
                selected
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {chip.label}
            </button>
          );
        })}
      </div>
    </LabeledRow>
  );
}
