"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
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
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
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
