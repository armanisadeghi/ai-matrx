"use client";

import type { ScopeType, Scope } from "../../redux/scope/types";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
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
  const title = isEdit
    ? `Edit ${scopeType.label_singular}`
    : `New ${scopeType.label_singular}`;

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      expandButtonLabel={scopeType.label_singular}
      position="right"
      defaultSize={32}
    >
      <ScopeForm
        organizationId={organizationId}
        scopeType={scopeType}
        editingScope={editingScope}
        parentScopeId={parentScopeId}
        onDone={() => onOpenChange(false)}
        onCancel={() => onOpenChange(false)}
      />
    </MatrxDynamicPanelHost>
  );
}
