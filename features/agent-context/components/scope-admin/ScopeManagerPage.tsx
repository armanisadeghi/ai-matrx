"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "../../redux/scope/scopeTypesSlice";
import { fetchScopes } from "../../redux/scope/scopesSlice";
import type { ScopeType } from "../../redux/scope/types";
import { ScopeTypeList } from "./ScopeTypeList";
import { ScopeInstancePanel } from "./ScopeInstancePanel";
import { ScopeTemplateStarter } from "./ScopeTemplateStarter";
import { ScopeOnboarding } from "@/features/scope-system/components/ScopeOnboarding";

interface ScopeManagerPageProps {
  organizationId: string;
  organizationName: string;
}

export function ScopeManagerPage({
  organizationId,
  organizationName,
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
    dispatch(fetchScopeTypes(organizationId));
    dispatch(fetchScopes({ org_id: organizationId }));
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
          onChanged={() => {
            hasFetched.current = false;
            dispatch(fetchScopeTypes(organizationId));
            dispatch(fetchScopes({ org_id: organizationId }));
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
              dispatch(fetchScopeTypes(organizationId));
              dispatch(fetchScopes({ org_id: organizationId }));
            }}
          />
          <Link
            href={`/agent-context/hierarchy?id=${organizationId}&type=organization`}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2 text-left hover:bg-muted/50 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-[10px] text-muted-foreground">
              Open in Context Hub
            </span>
          </Link>
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
