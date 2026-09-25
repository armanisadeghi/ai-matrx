"use client";

import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ScopeTypeList } from "./ScopeTypeList";
import { ScopeInstancePanel } from "./ScopeInstancePanel";
import { ScopeTemplateStarter } from "./ScopeTemplateStarter";
import { ScopeOnboarding } from "@/features/scope-system/components/ScopeOnboarding";
import type { ScopeTypeNode as ScopeType } from "@/features/scopes/types";
import {
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "@/features/scopes/redux/selectors/admin";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";

interface ScopeManagerPageProps {
  organizationId: string;
  organizationName: string;
  isPersonal?: boolean;
}

export function ScopeManagerPage({
  organizationId,
  organizationName,
  isPersonal,
}: ScopeManagerPageProps) {
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const scopeTypes = useAppSelector((state) =>
    selectScopeTypesByOrg(state, organizationId),
  );
  const loading = useAppSelector(selectScopeTypesLoading);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    dispatch(ensureScopeTree());
  }, [dispatch, organizationId]);

  useEffect(() => {
    if (!selectedTypeId && scopeTypes.length > 0) {
      setSelectedTypeId(scopeTypes[0].id);
    }
    if (
      selectedTypeId &&
      scopeTypes.length > 0 &&
      !scopeTypes.find((t) => t.id === selectedTypeId)
    ) {
      setSelectedTypeId(scopeTypes[0]?.id ?? null);
    }
  }, [scopeTypes, selectedTypeId]);

  const selectedType = scopeTypes.find((t) => t.id === selectedTypeId) ?? null;
  const isEmpty = !loading && scopeTypes.length === 0;

  if (isEmpty) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <ScopeOnboarding
          orgId={organizationId}
          isPersonal={isPersonal}
          onChanged={() => {
            hasFetched.current = false;
            dispatch(ensureScopeTree());
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-background">
      <aside className="w-full md:w-72 flex-shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto bg-card">
        <ScopeTypeList
          organizationId={organizationId}
          scopeTypes={scopeTypes}
          selectedTypeId={selectedTypeId}
          onSelectType={setSelectedTypeId}
          loading={loading}
        />
        <div className="p-3 border-t border-border space-y-2">
          <ScopeTemplateStarter
            organizationId={organizationId}
            compact
            onTypesCreated={() => {
              hasFetched.current = false;
              dispatch(ensureScopeTree());
            }}
          />
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-background">
        {selectedType ? (
          <ScopeInstancePanel
            organizationId={organizationId}
            scopeType={selectedType}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Select a scope type to manage its instances
          </div>
        )}
      </main>
    </div>
  );
}
