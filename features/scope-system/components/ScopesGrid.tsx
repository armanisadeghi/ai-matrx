"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  selectScopeTypesLoading,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  selectScopesByOrg,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  listScopeTypeItems,
  selectAllContextItems,
} from "@/features/scope-system/redux/contextItemsSlice";
import { ScopeTypeCard } from "./ScopeTypeCard";
import { AddScopeTypeCard } from "./AddScopeTypeCard";
import { AddScopeModal } from "./AddScopeModal";
import { TemplateGalleryDrawer } from "./TemplateGalleryDrawer";

interface ScopesGridProps {
  orgId: string;
  orgSlugOrId: string;
  personalOnly?: boolean;
}

export function ScopesGrid({
  orgId,
  orgSlugOrId,
  personalOnly,
}: ScopesGridProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const scopeTypes = useAppSelector((s) => selectScopeTypesByOrg(s, orgId));
  const loading = useAppSelector(selectScopeTypesLoading);
  const allScopes = useAppSelector((s) => selectScopesByOrg(s, orgId));
  const allItems = useAppSelector(selectAllContextItems);

  const [modalOpen, setModalOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchScopeTypes(orgId));
    dispatch(fetchScopes({ org_id: orgId }));
  }, [dispatch, orgId]);

  useEffect(() => {
    for (const t of scopeTypes) {
      dispatch(listScopeTypeItems(t.id));
    }
  }, [dispatch, scopeTypes]);

  const scopeCountByType = new Map<string, number>();
  for (const s of allScopes) {
    scopeCountByType.set(
      s.scope_type_id,
      (scopeCountByType.get(s.scope_type_id) ?? 0) + 1,
    );
  }
  const itemCountByType = new Map<string, number>();
  for (const i of allItems) {
    itemCountByType.set(
      i.scope_type_id,
      (itemCountByType.get(i.scope_type_id) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          Scopes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Group what your team works on — clients, products, teams, anything.
        </p>
      </div>

      {loading && scopeTypes.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : scopeTypes.length === 0 ? (
        // Empty-state — surface the template gallery prominently
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Start with a template
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a template to scaffold scopes and context items instantly.
              You can edit anything after — or start blank.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AddScopeTypeCard
              onAddBlank={() => setModalOpen(true)}
              onPickTemplate={() => setGalleryOpen(true)}
            />
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {scopeTypes.map((t) => (
            <ScopeTypeCard
              key={t.id}
              scopeType={t}
              scopeCount={scopeCountByType.get(t.id) ?? 0}
              itemCount={itemCountByType.get(t.id) ?? 0}
              onClick={() =>
                router.push(`/organizations/${orgSlugOrId}/scopes/${t.id}`)
              }
            />
          ))}
          <AddScopeTypeCard
            onAddBlank={() => setModalOpen(true)}
            onPickTemplate={() => setGalleryOpen(true)}
          />
        </div>
      )}

      <AddScopeModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        orgId={orgId}
      />
      <TemplateGalleryDrawer
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        orgId={orgId}
        personalOnly={personalOnly}
      />
    </div>
  );
}
