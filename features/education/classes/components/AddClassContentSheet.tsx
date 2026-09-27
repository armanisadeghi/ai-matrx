"use client";

// features/education/classes/components/AddClassContentSheet.tsx
//
// "Add study content to this class" — a thin wrapper over the canonical
// UniversalAssociationPicker, targeting the class SCOPE as the container. Attach
// writes the same source=content → target=('scope', classId) edge the hub reads,
// so attaching here and tagging from an artifact are ONE relationship.
//
// Hosted in the NON-BLOCKING docked panel, never a Sheet: the picker's Files
// tab opens the Add-files WindowPanel, and a focus-trapping Sheet made that
// window untypeable (every-picker-takes-new-input.md rule 4).

import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { UniversalAssociationPicker } from "@ai-matrx/associations/react";
import { CLASS_PICKER_TOKENS } from "../hooks/useClassContent";
import { useClassContent } from "../hooks/useClassContent";

interface AddClassContentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  content: ReturnType<typeof useClassContent>;
}

export function AddClassContentSheet({
  open,
  onOpenChange,
  className,
  content,
}: AddClassContentSheetProps) {

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={`Add to ${className}`}
      description="Search your decks, quizzes, notes, media, and files, and tag them to this class."
      expandButtonLabel="Add content"
      initialFocus
      position="right"
      defaultSize={34}
      minSize={24}
      contentClassName="flex min-h-0 flex-1 flex-col px-3 pb-3"
    >
      <UniversalAssociationPicker
        tokens={CLASS_PICKER_TOKENS}
        attachedKeys={content.attachedKeys}
        onAttach={(token, id, title) => content.attach(token, id, title)}
        onDetach={(token, id) => content.detach(token, id)}
      />
    </MatrxDynamicPanelHost>
  );
}
