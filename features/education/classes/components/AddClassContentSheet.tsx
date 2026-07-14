"use client";

// features/education/classes/components/AddClassContentSheet.tsx
//
// "Add study content to this class" — a thin wrapper over the canonical
// UniversalAssociationPicker, targeting the class SCOPE as the container. Attach
// writes the same source=content → target=('scope', classId) edge the hub reads,
// so attaching here and tagging from an artifact are ONE relationship.

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { UniversalAssociationPicker } from "@/features/scopes/components/associations/UniversalAssociationPicker";
import { CLASS_PICKER_TOKENS } from "../hooks/useClassContent";
import type { useClassContent } from "../hooks/useClassContent";

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
  const userId = useAppSelector(selectUserId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add to {className}</SheetTitle>
          <SheetDescription>
            Search your decks, quizzes, notes, media, and files, and tag them to
            this class.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-2 min-h-0 flex-1">
          <UniversalAssociationPicker
            tokens={CLASS_PICKER_TOKENS}
            attachedKeys={content.attachedKeys}
            ownerId={userId ?? undefined}
            onAttach={(token, id, title) => content.attach(token, id, title)}
            onDetach={(token, id) => content.detach(token, id)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
