"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectContextItemById } from "@/features/scope-system/redux/contextItemsSlice";
import { ContextItemSettingsForm } from "./forms/ContextItemSettingsForm";

interface EditContextItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
}

/**
 * Quick-edit drawer for a context item — a thin wrapper around the shared
 * `ContextItemSettingsForm`. The same form powers the full-page Manage route
 * (`…/context-items/[item]/edit`), so there is exactly one editor.
 */
export function EditContextItemSheet({
  open,
  onOpenChange,
  itemId,
}: EditContextItemSheetProps) {
  const item = useAppSelector((s) =>
    itemId ? selectContextItemById(s, itemId) : undefined,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit context item</SheetTitle>
          <SheetDescription>
            Full settings for this context item. Changes apply to every scope of
            this type.
          </SheetDescription>
        </SheetHeader>

        {open && item && (
          <div className="mt-6">
            <ContextItemSettingsForm
              itemId={item.id}
              onSaved={() => onOpenChange(false)}
              onCancelled={() => onOpenChange(false)}
              onDeleted={() => onOpenChange(false)}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
