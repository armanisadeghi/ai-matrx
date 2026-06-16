"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectContextItemById } from "@/features/scope-system/redux/contextItemsSlice";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { ContextItemSettingsForm } from "./forms/ContextItemSettingsForm";

interface EditContextItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string | null;
}

/**
 * Quick-edit floating panel for a context item — a thin wrapper around the
 * shared `ContextItemSettingsForm`. The same form powers the full-page Manage
 * route (`…/context-items/[item]/edit`), so there is exactly one editor.
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
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Edit context item"
      description="Full settings for this context item. Changes apply to every scope of this type."
      expandButtonLabel="Context item"
      position="right"
    >
      {item ? (
        <ContextItemSettingsForm
          itemId={item.id}
          onSaved={() => onOpenChange(false)}
          onCancelled={() => onOpenChange(false)}
          onDeleted={() => onOpenChange(false)}
        />
      ) : null}
    </MatrxDynamicPanelHost>
  );
}
