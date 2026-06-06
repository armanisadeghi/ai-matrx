"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Home,
  Layers,
  Loader2,
  Pencil,
  Tag as TagIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
  selectScopesLoadedForType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemBySlugOrId,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { ScopeGlyph } from "./ScopeGlyph";
import { ScopeNotFound } from "./ScopeNotFound";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  contextItemsHref,
  orgScopesHref,
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";
import type { Scope } from "@/features/agent-context/redux/scope/types";

interface ContextItemHubProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  typeParam: string;
  itemParam: string;
  canManage: boolean;
}

/**
 * Context Item Hub — the page for ONE context item (e.g. "Brand Personality").
 * Shows the item's own settings (the THING) at the top, then every scope of the
 * type with its current value for this item (the nested system below), each row
 * inline-editable and deep-linking to the full value page.
 */
export function ContextItemHub({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  itemParam,
  canManage,
}: ContextItemHubProps) {
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
  const scopes = useAppSelector((s) =>
    selectScopesByType(s, resolvedTypeId ?? ""),
  );

  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
    dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    for (const scope of scopes) {
      dispatch(getScopeContext({ scope_id: scope.id, include_empty: true }));
    }
  }, [dispatch, scopes]);

  if (!scopeType) {
    return typesLoaded ? (
      <ScopeNotFound
        title="Scope type not found"
        message={`No scope type matches "${typeParam}".`}
        backHref={orgScopesHref(orgSlugOrId)}
        backLabel="Back to scopes"
      />
    ) : (
      <CenteredSpinner />
    );
  }
  if (!item) {
    return itemsLoaded ? (
      <ScopeNotFound
        title="Context item not found"
        message={`No context item matches "${itemParam}" for ${scopeType.label_plural}.`}
        backHref={contextItemsHref(orgSlugOrId, scopeType)}
        backLabel="Back to context items"
      />
    ) : (
      <CenteredSpinner />
    );
  }

  const color = resolveColor(scopeType);

  return (
    <div className="space-y-6 pr-14">
      {/* Breadcrumb: org › type › Context Items › item */}
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
          href={contextItemsHref(orgSlugOrId, scopeType)}
          className="text-muted-foreground hover:text-foreground"
        >
          Context items
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">{item.display_name}</span>
      </div>

      {/* The THING: item identity + settings */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {scopeType.label_singular} field
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {item.display_name}
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <Badge variant="secondary" className="text-[10px]">
                  {VALUE_TYPE_CONFIG[item.value_type]?.label ?? item.value_type}
                </Badge>
                {item.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {item.category}
                  </Badge>
                )}
                {(item.tags ?? []).map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-[10px] gap-1 font-normal"
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    {t}
                  </Badge>
                ))}
              </div>
              {item.description && (
                <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
                  {item.description}
                </p>
              )}
            </div>
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0"
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit item
            </Button>
          )}
        </div>

        {/* Details */}
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-5 pt-4 border-t border-border">
          <PropRow label="Key" value={item.key} mono />
          <PropRow label="URL slug" value={item.slug || "—"} mono />
          <PropRow label="Category" value={item.category || "—"} />
          <PropRow label="Sensitivity" value={item.sensitivity} />
          <PropRow
            label="Fetch hint"
            value={item.fetch_hint?.replace(/_/g, " ")}
          />
          <PropRow label="Sort order" value={String(item.sort_order ?? 0)} />
        </dl>
      </Card>

      {/* The nested system: this item's value for every scope */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            {item.display_name} across {scopeType.label_plural}
          </h2>
          <span className="text-sm text-muted-foreground">
            ({scopes.length})
          </span>
        </div>

        {scopes.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No {scopeType.label_plural.toLowerCase()} yet.
          </Card>
        ) : (
          <Card className="p-6">
            <div className="space-y-5">
              {scopes.map((scope) => (
                <ItemScopeValueRow
                  key={scope.id}
                  scope={scope}
                  itemId={item.id}
                  scopeHubHref={scopeHref(orgSlugOrId, scopeType, scope)}
                  valueHref={scopeItemHref(orgSlugOrId, scopeType, scope, item)}
                />
              ))}
            </div>
          </Card>
        )}
      </div>

      <EditContextItemSheet
        open={editing}
        onOpenChange={setEditing}
        itemId={item.id}
      />
    </div>
  );
}

function ItemScopeValueRow({
  scope,
  itemId,
  scopeHubHref,
  valueHref,
}: {
  scope: Scope;
  itemId: string;
  scopeHubHref: string;
  valueHref: string;
}) {
  const rows = useAppSelector((s) => selectValuesByScope(s, scope.id));
  const row = (rows ?? []).find((r) => r.item_id === itemId);

  if (!row) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{scope.name}</span>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    );
  }

  return (
    <ScopeFieldInput
      scopeId={scope.id}
      row={row}
      nameLabel={scope.name}
      nameHref={scopeHubHref}
      itemHref={valueHref}
    />
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function PropRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd
        className={`text-foreground text-right truncate ${mono ? "font-mono text-xs" : "capitalize"}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
