"use client";

// features/education/classes/components/AddClassContentSheet.tsx
//
// "Add study content to this class" — a thin wrapper over the canonical
// UniversalAssociationPicker, targeting the class SCOPE as the container (and,
// with a part selected, that part too — the host's onAttach writes both). Attach
// writes the same source=content → target=('scope', classId) edge the hub reads,
// so attaching here and tagging from an artifact are ONE relationship.
//
// Hosted in the NON-BLOCKING docked panel, never a Sheet: the picker's Files
// tab opens the Add-files WindowPanel, and a focus-trapping Sheet made that
// window untypeable (every-picker-takes-new-input.md rule 4).

import type { ComponentProps } from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import { CLASS_PICKER_TOKENS } from "../hooks/useClassContent";

type PickerProps = ComponentProps<typeof UniversalAssociationPicker>;

interface AddClassContentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class's name — or the selected part's, when adding into a unit. */
  className: string;
  /** What the target already holds, keyed `${token}:${id}`. */
  attachedKeys: Set<string>;
  /** Files the pick under the class (and the selected part, when there is one). */
  onAttach: PickerProps["onAttach"];
  onDetach: PickerProps["onDetach"];
}

export function AddClassContentSheet({
  open,
  onOpenChange,
  className,
  attachedKeys,
  onAttach,
  onDetach,
}: AddClassContentSheetProps) {

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={`Add to ${className}`}
      description="Decks, quizzes, notes, media and files"
      expandButtonLabel="Add content"
      initialFocus
      position="right"
      defaultSize={34}
      minSize={24}
      contentClassName="flex min-h-0 flex-1 flex-col px-3 pb-3"
    >
      <UniversalAssociationPicker
        tokens={CLASS_PICKER_TOKENS}
        attachedKeys={attachedKeys}
        onAttach={onAttach}
        onDetach={onDetach}
      />
    </MatrxDynamicPanelHost>
  );
}
