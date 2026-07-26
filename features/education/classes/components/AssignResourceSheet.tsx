"use client";

// features/education/classes/components/AssignResourceSheet.tsx
//
// "Assign to this class" — a thin wrapper over the canonical
// UniversalAssociationPicker locked to the ASSIGNABLE_TOKENS (decks + quizzes/
// practice-tests). An optional due date set at the top applies to whatever the
// owner picks. Attaching writes an assignment edge via the owner-gated
// edu_class_assign RPC (not the generic assoc_add), so the server owner check is
// the boundary. Detaching removes the assignment.

import { CalendarClock } from "lucide-react";
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
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { ASSIGNABLE_TOKENS } from "../constants";
import type { AssignableToken } from "../types";
import { useClassAssignments } from "../hooks/useClassAssignments";

interface AssignResourceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  assignments: ReturnType<typeof useClassAssignments>;
  /** The due date (ISO YYYY-MM-DD) applied to newly-picked resources. */
  dueDate: string;
  onDueDateChange: (value: string) => void;
}

export function AssignResourceSheet({
  open,
  onOpenChange,
  className,
  assignments,
  dueDate,
  onDueDateChange,
}: AssignResourceSheetProps) {
  const userId = useAppSelector(selectUserId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign to {className}</SheetTitle>
          <SheetDescription>
            Pick a deck or a quiz / practice test to assign. Every student on the
            roster sees it, and you see who has completed it.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 rounded-lg border border-border bg-card p-3">
          <label
            htmlFor="assign-due-date"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground"
          >
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
            Due date (optional)
          </label>
          <input
            id="assign-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Applied to items you assign next. Clear it to assign with no due date.
          </p>
        </div>

        <div className="mt-3 min-h-0 flex-1">
          <UniversalAssociationPicker
            tokens={ASSIGNABLE_TOKENS as EntityTypeToken[]}
            attachedKeys={assignments.assignedKeys}
            ownerId={userId ?? undefined}
            onAttach={(token, id, title) =>
              assignments.assign(
                token as AssignableToken,
                id,
                dueDate || null,
                title,
              )
            }
            onDetach={(token, id) => assignments.unassign(token, id)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
