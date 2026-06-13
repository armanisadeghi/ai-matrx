"use client";

import React, { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopeById,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  fetchScopeTypes,
  selectScopeTypeById,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { ScopeForm } from "@/features/agent-context/components/scope-admin/ScopeForm";

export interface ScopeEditWindowData {
  /** Existing scope to edit. Omit to create a new scope. */
  scopeId?: string | null;
  /** Required: which scope type this scope belongs to. */
  scopeTypeId: string;
  /** Required: owning organization. */
  organizationId: string;
  /** Create-only: pre-select a parent scope (inline nesting). */
  parentScopeId?: string;
}

interface ScopeEditWindowProps {
  isOpen: boolean;
  onClose: () => void;
  data?: ScopeEditWindowData;
}

const OVERLAY_ID = "scopeEditWindow";

export default function ScopeEditWindow({
  isOpen,
  onClose,
  data,
}: ScopeEditWindowProps) {
  if (!isOpen || !data?.scopeTypeId || !data?.organizationId) return null;
  return <ScopeEditWindowInner onClose={onClose} data={data} />;
}

function ScopeEditWindowInner({
  onClose,
  data,
}: {
  onClose: () => void;
  data: ScopeEditWindowData;
}) {
  const dispatch = useAppDispatch();
  const { scopeId, scopeTypeId, organizationId, parentScopeId } = data;

  const scopeType = useAppSelector((s) => selectScopeTypeById(s, scopeTypeId));
  const editingScope = useAppSelector((s) =>
    scopeId ? (selectScopeById(s, scopeId) ?? null) : null,
  );

  // Hydrate the agent-context scope slices on demand — the window can be opened
  // from surfaces (e.g. the context-assignment field) that read a different
  // tree, so the canonical scope-admin slices may not be loaded yet.
  useEffect(() => {
    if (!scopeType) void dispatch(fetchScopeTypes(organizationId));
  }, [dispatch, scopeType, organizationId]);
  useEffect(() => {
    if (scopeId && !editingScope) {
      void dispatch(
        fetchScopes({ org_id: organizationId, type_id: scopeTypeId }),
      );
    }
  }, [dispatch, scopeId, editingScope, organizationId, scopeTypeId]);

  const title = !scopeType
    ? "Edit scope"
    : scopeId
      ? `Edit ${scopeType.label_singular}`
      : `New ${scopeType.label_singular}`;

  const loading = !scopeType || (!!scopeId && !editingScope);

  return (
    <WindowPanel
      title={title}
      id="scope-edit-window"
      overlayId={OVERLAY_ID}
      onClose={onClose}
      position="center"
      width={460}
      height={460}
      minWidth={340}
      minHeight={340}
      maxWidth={680}
    >
      <div className="h-full overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScopeForm
            organizationId={organizationId}
            scopeType={scopeType}
            editingScope={editingScope}
            parentScopeId={parentScopeId}
            onDone={onClose}
            onCancel={onClose}
          />
        )}
      </div>
    </WindowPanel>
  );
}
