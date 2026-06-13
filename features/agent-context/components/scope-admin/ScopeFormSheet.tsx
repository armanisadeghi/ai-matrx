"use client";

import type { ScopeType, Scope } from "../../redux/scope/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScopeForm } from "./ScopeForm";

interface ScopeFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  scopeType: ScopeType;
  editingScope: Scope | null;
  parentScopeId?: string;
}

export function ScopeFormSheet({
  open,
  onOpenChange,
  organizationId,
  scopeType,
  editingScope,
  parentScopeId,
}: ScopeFormSheetProps) {
  const isEdit = !!editingScope;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit
              ? `Edit ${scopeType.label_singular}`
              : `New ${scopeType.label_singular}`}
          </SheetTitle>
        </SheetHeader>

        <ScopeForm
          className="mt-6"
          organizationId={organizationId}
          scopeType={scopeType}
          editingScope={editingScope}
          parentScopeId={parentScopeId}
          onDone={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
