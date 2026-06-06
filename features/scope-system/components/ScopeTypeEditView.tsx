"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Home,
  Layers,
  ListChecks,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopeTypes,
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { ScopeTypeSettingsForm } from "./forms/ScopeTypeSettingsForm";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "./ScopeGlyph";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import {
  contextItemsHref,
  orgScopesHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ScopeTypeEditViewProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  typeParam: string;
  canManage: boolean;
}

/**
 * Full-page Manage route for a scope type's OWN settings (the dimension itself).
 * Context above (org) + the settings form + links down to the two nested systems
 * it owns (context items + scopes). Drawer stays the quick accelerator.
 */
export function ScopeTypeEditView({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  canManage,
}: ScopeTypeEditViewProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );

  useEffect(() => {
    dispatch(fetchScopeTypes(orgId));
  }, [dispatch, orgId]);

  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}".`}
        backHref={orgScopesHref(orgSlugOrId)}
        backLabel="Back to scopes"
      />
    ) : (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const color = resolveColor(scopeType);
  const hubHref = scopeTypeHref(orgSlugOrId, scopeType);

  return (
    <div className="space-y-6 pr-14">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="h-7 px-2 -ml-2"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <span className="text-muted-foreground/50">·</span>
        <Link
          href={orgScopesHref(orgSlugOrId)}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {orgIsPersonal ? (
            <Home className="h-3.5 w-3.5" />
          ) : (
            <Building2 className="h-3.5 w-3.5" />
          )}
          {orgIsPersonal ? "Personal workspace" : orgName}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <Link
          href={hubHref}
          className="text-muted-foreground hover:text-foreground"
        >
          {scopeType.label_plural}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">Edit</span>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {orgIsPersonal ? "Personal workspace" : orgName} · scope type
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Edit {scopeType.label_singular} settings
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                The dimension itself — applies to all{" "}
                {scopeType.label_plural.toLowerCase()}.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={hubHref}>
              Open {scopeType.label_singular} hub
              <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </Card>

      {/* Settings form (admin only) */}
      {canManage ? (
        <Card className="p-6">
          <ScopeTypeSettingsForm
            typeId={scopeType.id}
            orgId={orgId}
            onSaved={() => router.push(hubHref)}
            onCancelled={() => router.push(hubHref)}
            onDeleted={() => router.push(orgScopesHref(orgSlugOrId))}
          />
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          You don&apos;t have permission to edit this scope type.{" "}
          <Link href={hubHref} className="text-primary hover:underline">
            Open the hub
          </Link>
          .
        </Card>
      )}

      {/* The two nested systems this type owns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href={contextItemsHref(orgSlugOrId, scopeType)}>
          <Card className="p-5 hover:bg-accent/30 transition-colors h-full">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              Context items
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              The fields defined on {scopeType.label_plural} — add, reorder,
              edit.
            </p>
          </Card>
        </Link>
        <Link href={hubHref}>
          <Card className="p-5 hover:bg-accent/30 transition-colors h-full">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <Layers className="h-4 w-4 text-muted-foreground" />
              {scopeType.label_plural}
              <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              The individual {scopeType.label_plural.toLowerCase()} of this
              type.
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
