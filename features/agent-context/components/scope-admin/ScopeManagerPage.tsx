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
import {
  ensureAdminOrganizationTree,
  ensureScopeTree,
  type AdminOrganizationTreeResult,
} from "@/features/scopes/redux/thunks/ensureScopeTree";
import { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ScopeManagerPageProps {
  organizationId: string;
  organizationName: string;
  isPersonal?: boolean;
  /**
   * THE ADMIN LANE — set ONLY by the `/administration/**` console route. Loads
   * this organization's tree through the platform-admin read arm (the admin is
   * usually not a member) and releases it when the console closes. A user-page
   * route never sets it: there the admin is an ordinary member.
   */
  adminLane?: boolean;
}

export function ScopeManagerPage({
  organizationId,
  organizationName,
  isPersonal,
  adminLane = false,
}: ScopeManagerPageProps) {
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [adminResult, setAdminResult] =
    useState<AdminOrganizationTreeResult | null>(null);

  // The one loader: the membership tree, or — admin lane — this organization's
  // tree through the platform-admin arm, released when the console closes.
  const load = (refresh = false) => {
    if (adminLane) {
      void dispatch(
        ensureAdminOrganizationTree(organizationId, { refresh }),
      ).then(setAdminResult);
    } else {
      void dispatch(ensureScopeTree({ refresh }));
    }
  };

  const scopeTypes = useAppSelector((state) =>
    selectScopeTypesByOrg(state, organizationId),
  );
  const loading = useAppSelector(selectScopeTypesLoading);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [dispatch, organizationId, adminLane]);

  useEffect(() => {
    if (!adminLane) return;
    return () => {
      dispatch(scopesActions.adminLaneOrganizationReleased(organizationId));
    };
  }, [adminLane, dispatch, organizationId]);

  // The chosen type, or the first one when none is chosen (or the chosen one
  // left the list) — derived, never synced into state by an effect.
  const selectedType =
    scopeTypes.find((t) => t.id === selectedTypeId) ?? scopeTypes[0] ?? null;
  const adminPending = adminLane && adminResult === null;
  const isEmpty = !loading && !adminPending && scopeTypes.length === 0;

  if (adminLane && adminResult && (adminResult.status === "not_found" || adminResult.status === "error")) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="rounded-lg border border-border bg-card p-6 text-sm">
          <p className="font-medium text-foreground">
            {adminResult.status === "not_found"
              ? "This organization was not found."
              : "This organization's scopes could not be loaded."}
            <ErrorAlchemyMenu />
          </p>
          <p className="mt-1 text-muted-foreground">
            {adminResult.status === "error"
              ? adminResult.message
              : "It may have been archived, or the link is wrong."}
          </p>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <ScopeOnboarding
          orgId={organizationId}
          isPersonal={isPersonal}
          onChanged={() => load(adminLane)}
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
          selectedTypeId={selectedType?.id ?? null}
          onSelectType={setSelectedTypeId}
          loading={loading}
        />
        <div className="p-3 border-t border-border space-y-2">
          <ScopeTemplateStarter
            organizationId={organizationId}
            compact
            onTypesCreated={() => load(adminLane)}
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
