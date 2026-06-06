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
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemBySlugOrId,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { ContextItemSettingsForm } from "./forms/ContextItemSettingsForm";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "./ScopeGlyph";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import {
  contextItemHref,
  contextItemsHref,
  orgScopesHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";

interface ContextItemEditViewProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  typeParam: string;
  itemParam: string;
  canManage: boolean;
}

/**
 * Full-page Manage route for a context item's own settings. Context above
 * (org → type → context items → item) + the shared settings form + a link down
 * to the item Hub (its value across every scope). Drawer = quick; this = full.
 */
export function ContextItemEditView({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  itemParam,
  canManage,
}: ContextItemEditViewProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const resolvedTypeId = scopeType?.id;
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );
  const item = useAppSelector((s) =>
    selectItemBySlugOrId(s, resolvedTypeId, itemParam),
  );
  const itemsLoaded = useAppSelector((s) =>
    resolvedTypeId ? selectItemsLoadedForType(s, resolvedTypeId) : false,
  );

  useEffect(() => {
    if (resolvedTypeId) dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, resolvedTypeId]);

  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}".`}
        backHref={orgScopesHref(orgSlugOrId)}
        backLabel="Back to scopes"
      />
    ) : (
      <Spinner />
    );
  }
  if (!item) {
    return itemsLoaded ? (
      <ScopeNotFound
        title="Context item not found"
        message={`No context item matches "${itemParam}".`}
        backHref={contextItemsHref(orgSlugOrId, scopeType)}
        backLabel="Back to context items"
      />
    ) : (
      <Spinner />
    );
  }

  const color = resolveColor(scopeType);
  const hubHref = contextItemHref(orgSlugOrId, scopeType, item);

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
          href={scopeTypeHref(orgSlugOrId, scopeType)}
          className="text-muted-foreground hover:text-foreground"
        >
          {scopeType.label_plural}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <Link
          href={hubHref}
          className="text-muted-foreground hover:text-foreground"
        >
          {item.display_name}
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
                {scopeType.label_singular} field
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Edit {item.display_name}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                These settings apply to{" "}
                <strong>every {scopeType.label_singular.toLowerCase()}</strong>.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={hubHref}>
              View values
              <ArrowUpRight className="h-3.5 w-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </Card>

      {/* The form (admin only) */}
      {canManage ? (
        <Card className="p-6">
          <ContextItemSettingsForm
            itemId={item.id}
            onSaved={() => router.push(hubHref)}
            onCancelled={() => router.push(hubHref)}
            onDeleted={() =>
              router.push(contextItemsHref(orgSlugOrId, scopeType))
            }
          />
        </Card>
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          You don&apos;t have permission to edit this item.{" "}
          <Link href={hubHref} className="text-primary hover:underline">
            View it instead
          </Link>
          .
        </Card>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
