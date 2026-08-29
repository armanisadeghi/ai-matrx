// features/scopes/components/management/ScopesManager.tsx
//
// Per-org scopes page. Minimal org-identity header (logo / name / role +
// links back to the org overview and settings), followed by a stack of
// OrgScopeTypeSection cards — one per scope type — that drive the same
// in-line preview + add/edit + open-detail flow used on the org overview.
//
// Fully canonical (Lane F W7): reads from the scopesTree slice via
// ensureScopeTree + makeSelectScopeTypesForOrg, writes through the sanctioned
// RPC-backed thunks. No features/scope-system or features/agent-context
// imports remain.

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  FolderTree,
  LayoutTemplate,
  ListChecks,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { makeSelectScopeTypesForOrg } from "@/features/scopes/redux/selectors/tree";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import { updateScopeType } from "@/features/scopes/redux/thunks/scopeTreeMutations";
import { OrgScopeTypeSection } from "@/features/scopes/components/management/OrgScopeTypeSection";
import { ScopeOnboarding } from "@/features/scopes/components/management/ScopeOnboarding";
import { AddScopeModal } from "@/features/scopes/components/management/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scopes/components/management/TemplateGalleryDrawer";
import { ReorderDialog } from "@/features/scopes/components/management/ReorderDialog";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { Organization } from "@/features/organizations/types";

interface ScopesManagerProps {
  organization: Pick<
    Organization,
    "id" | "name" | "slug" | "logoUrl" | "isPersonal"
  >;
  role?: string | null;
}

export function ScopesManager({ organization, role }: ScopesManagerProps) {
  const dispatch = useAppDispatch();
  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesForOrg(s, organization.id),
  );
  const [addScopeOpen, setAddScopeOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reorderTypesOpen, setReorderTypesOpen] = useState(false);
  const suggestions = useScopeSuggestions();
  const orgScopes = useMemo(
    () => scopeTypes.flatMap((t) => t.scopes),
    [scopeTypes],
  );
  const orgSuggestions = orgScopes.flatMap((sc) => suggestions.forScope(sc.id));

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const slug = organization.slug ?? organization.id;
  const totalScopes = orgScopes.length;
  const canManage = role === "owner" || role === "admin";

  const orderedTypes = useMemo(
    () => [...scopeTypes].sort((a, b) => a.sort_order - b.sort_order),
    [scopeTypes],
  );

  async function saveTypeOrder(orderedIds: string[]) {
    const results = await Promise.all(
      orderedIds.map((id, i) =>
        dispatch(updateScopeType({ type_id: id, sort_order: i + 1 })),
      ),
    );
    const failed = results.find(isScopesRpcErr);
    if (failed) throw new Error(failed.error.message);
    toast.success("Order saved");
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 md:p-5">
        <div className="flex items-start gap-4">
          {organization.logoUrl ? (
            <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14">
              <InlineMediaRef
                ref={organization.logoUrl}
                size="fill"
                fit="cover"
                rounded="md"
                fallback={null}
                className="border border-border"
                alt={organization.name}
              />
            </div>
          ) : (
            <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-md bg-muted flex items-center justify-center">
              <FolderTree className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Link
                href={`/organizations/${slug}`}
                className="text-xl md:text-2xl font-bold text-foreground hover:text-primary transition-colors"
              >
                {organization.name}
              </Link>
              {organization.isPersonal && (
                <Badge variant="secondary" className="text-[10px]">
                  Personal
                </Badge>
              )}
              {role && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {role}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Scopes</span>
              {" · "}
              {scopeTypes.length} type{scopeTypes.length === 1 ? "" : "s"}
              {" · "}
              {totalScopes} scope{totalScopes === 1 ? "" : "s"}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <Link
                href={`/organizations/${slug}`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Org overview
              </Link>
              <Link
                href={`/organizations/${slug}/settings`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <SettingsIcon className="h-3 w-3" />
                Org settings
              </Link>
              <Link
                href={`/organizations/${slug}/context-items`}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <ListChecks className="h-3 w-3" />
                All context items
              </Link>
              <Link
                href="/scopes"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <FolderTree className="h-3 w-3" />
                All scopes
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {orgSuggestions.length > 0 && (
        <KgSuggestionHint
          variant="banner"
          rows={orgSuggestions}
          accept={suggestions.accept}
          reject={suggestions.reject}
          defer={suggestions.defer}
          label={organization.name}
          align="start"
        />
      )}

      {scopeTypes.length === 0 ? (
        <Card className="p-6 md:p-8">
          <ScopeOnboarding
            orgId={organization.id}
            isPersonal={organization.isPersonal ?? undefined}
          />
        </Card>
      ) : (
        <>
          {orderedTypes.map((scopeType) => (
            <OrgScopeTypeSection
              key={scopeType.id}
              scopeType={scopeType}
              orgId={organization.id}
              orgSlugOrId={slug}
            />
          ))}

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddScopeOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Scope Type
            </Button>
            <span className="text-muted-foreground/50">·</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setGalleryOpen(true)}
              className="text-muted-foreground hover:text-foreground"
            >
              <LayoutTemplate className="h-4 w-4 mr-1.5" />
              Add from template
            </Button>
            {canManage && scopeTypes.length > 1 && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReorderTypesOpen(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowUpDown className="h-4 w-4 mr-1.5" />
                  Reorder types
                </Button>
              </>
            )}
          </div>
        </>
      )}

      <AddScopeModal
        open={addScopeOpen}
        onOpenChange={setAddScopeOpen}
        orgId={organization.id}
      />
      <TemplateGalleryDrawer
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        orgId={organization.id}
        personalOnly={organization.isPersonal ? true : undefined}
      />
      <ReorderDialog
        open={reorderTypesOpen}
        onOpenChange={setReorderTypesOpen}
        title="Reorder scope types"
        description="Drag the handle or use the arrows, then save."
        items={orderedTypes.map((t) => ({
          id: t.id,
          label: t.label_plural,
          sublabel: t.label_singular,
        }))}
        onSave={saveTypeOrder}
      />
    </div>
  );
}

export default ScopesManager;
