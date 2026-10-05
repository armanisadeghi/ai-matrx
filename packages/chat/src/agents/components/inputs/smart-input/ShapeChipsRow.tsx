"use client";

/**
 * ShapeChipsRow — compact discovery chips for the high-value shapes
 * ("Flashcards", "Quiz", "Timeline", "Comparison", "Diagram") inside the
 * Quickset panel.
 *
 * Users can't discover shapes when emission depends on magic words — these
 * chips make them one-click. A chip picks its shape: it toggles the kind in
 * `builderAdvancedSettings.outputKinds` (the SAME state the composer's Output →
 * Shapes list writes) and the request carries it as `output_kinds`; the server
 * resolves the skill. No skill list gates the chips and no skill id is written.
 */

import { Chip } from "@ai-matrx/design-system/controls";
import {
  Layers,
  ListChecks,
  CalendarClock,
  Columns3,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "../../../../store/hooks";
import { cn } from "@ai-matrx/design-system";
import { selectBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "../../../types/instance.types";
import { useSkills } from "@host/features/skills/hooks/useSkills";
import { SHAPE_CHIP_DEFS } from "./shape-chips";
import { selectedOutputKinds, toggleOutputKind } from "./composer/output-selection";

/** Chip key → Lucide icon (kept out of the pure resolver module). */
const CHIP_ICONS: Record<string, LucideIcon> = {
  flashcards: Layers,
  quiz: ListChecks,
  timeline: CalendarClock,
  comparison: Columns3,
  diagram: Workflow,
};

/**
 * The shape chips' state and toggle — shared with the composer's Output →
 * Shapes menu through `output-selection.ts`, so both write the SAME
 * `outputKinds` and can never disagree.
 */
export function useShapeChipToggles(conversationId: string) {
  const dispatch = useAppDispatch();
  // A kind skill added through the Skills menu still shows its chip selected.
  const { skills } = useSkills();

  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const outputKinds = settings.outputKinds ?? [];
  const addedSkills = settings.addedSkills ?? [];
  const picked = new Set(selectedOutputKinds(outputKinds, addedSkills, skills));

  const toggle = (kind: string) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: toggleOutputKind({ outputKinds, addedSkills }, kind, skills),
      }),
    );

  return { chips: SHAPE_CHIP_DEFS, picked, toggle };
}

export { CHIP_ICONS as SHAPE_CHIP_ICONS };

export function ShapeChipsRow({
  conversationId,
}: {
  conversationId: string;
}) {
  const { chips, picked, toggle } = useShapeChipToggles(conversationId);

  // Full-width tag flow — NOT the quickset label-column grid: the control
  // column is too narrow for 5 chips (they stacked one per line).
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-1.5 gap-y-1 py-0.5">
      <span className="mr-0.5 text-xs text-foreground">Shapes</span>
        {chips.map((chip) => {
          const Icon = CHIP_ICONS[chip.key] ?? Layers;
          const selected = picked.has(chip.kind);
          return (
            <Chip
              key={chip.key}
              asChild
              pressed={selected}
              icon={<Icon />}
              label={chip.label}
              title={
                selected
                  ? `${chip.label} picked for this chat — click to remove`
                  : `Answer as ${chip.label}`
              }
            >
              <button type="button" onClick={() => toggle(chip.kind)} />
            </Chip>
          );
        })}
    </div>
  );
}
