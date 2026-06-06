// features/scopes/components/management/ScopesManager.tsx
//
// Per-org scopes page. Minimal org-identity header (logo / name / role +
// links back to the org overview and settings), followed by a stack of
// OrgHomeScopeSection cards — one per scope type — that drive the same
// in-line preview + add/edit + open-detail flow used on the org overview.
//
// Reads/writes through the same Redux surface as the org overview page so
// adds/edits are immediately reflected here.

"use client";

import React, { useEffect, useState } from "react";
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InlineMediaRef } from "@/features/files";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypesByOrg,
  updateScopeType,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  fetchScopes,
  selectScopesByOrg,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { OrgHomeScopeSection } from "@/features/scope-system/components/OrgHomeScopeSection";
import { AddScopeModal } from "@/features/scope-system/components/AddScopeModal";
import { TemplateGalleryDrawer } from "@/features/scope-system/components/TemplateGalleryDrawer";
import { ReorderDialog } from "@/features/scope-system/components/ReorderDialog";
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
  const scopeTypes = useAppSelector((s) =>
    selectScopeTypesByOrg(s, organization.id),
  );
  const orgScopes = useAppSelector((s) =>
    selectScopesByOrg(s, organization.id),
  );
  const [addScopeOpen, setAddScopeOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reorderTypesOpen, setReorderTypesOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchScopeTypes(organization.id));
    dispatch(fetchScopes({ org_id: organization.id }));
  }, [dispatch, organization.id]);

  const slug = organization.slug ?? organization.id;
  const totalScopes = orgScopes.length;
  const canManage = role === "owner" || role === "admin";

  async function saveTypeOrder(orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) =>
        dispatch(updateScopeType({ type_id: id, sort_order: i + 1 })).unwrap(),
      ),
    );
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

      {scopeTypes.length === 0 ? (
        <Card className="p-6 md:p-8 space-y-4">
          <div className="flex items-start gap-4">
            <div className="text-sky-600 dark:text-sky-400 shrink-0">
              <FolderTree className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold mb-1">Set up your scopes</h2>
              <p className="text-sm text-muted-foreground">
                Scopes group what your team works on — clients, products, teams,
                anything. Define a few and they'll show up here with all their
                details.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Button size="sm" onClick={() => setAddScopeOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add a scope
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setGalleryOpen(true)}
            >
              <LayoutTemplate className="h-4 w-4 mr-1.5" />
              Browse templates
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {scopeTypes.map((scopeType) => (
            <OrgHomeScopeSection
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
              Add scope
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
        items={scopeTypes.map((t) => ({
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
