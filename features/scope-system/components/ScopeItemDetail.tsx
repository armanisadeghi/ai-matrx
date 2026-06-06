"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Home,
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
  selectScopeBySlugOrId,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { selectScopeTypeBySlugOrId } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemBySlugOrId,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { ScopeFieldInput } from "./ScopeFieldInput";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { ScopeGlyph } from "./ScopeGlyph";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  orgScopesHref,
  scopeHref,
  scopeItemHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";

interface ScopeItemDetailProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgSlug: string;
  orgIsPersonal: boolean;
  typeParam: string;
  scopeParam: string;
  itemParam: string;
}

export function ScopeItemDetail({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  scopeParam,
  itemParam,
}: ScopeItemDetailProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const resolvedTypeId = scopeType?.id;
  const scope = useAppSelector((s) =>
    selectScopeBySlugOrId(s, resolvedTypeId, scopeParam),
  );
  const item = useAppSelector((s) =>
    selectItemBySlugOrId(s, resolvedTypeId, itemParam),
  );
  const items = useAppSelector((s) =>
    selectItemsByType(s, resolvedTypeId ?? ""),
  );
  const rows = useAppSelector((s) => selectValuesByScope(s, scope?.id ?? ""));

  const [editingItem, setEditingItem] = useState(false);

  useEffect(() => {
    if (!resolvedTypeId) return;
    dispatch(fetchScopes({ org_id: orgId, type_id: resolvedTypeId }));
    dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, orgId, resolvedTypeId]);

  useEffect(() => {
    if (!scope?.id) return;
    dispatch(getScopeContext({ scope_id: scope.id, include_empty: true }));
  }, [dispatch, scope?.id]);

  if (!scopeType || !scope || !item) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const color = resolveColor(scopeType);
  const valueRow = (rows ?? []).find((r) => r.item_id === item.id);
  const itemIndex = items.findIndex((i) => i.id === item.id);
  const prevItem = itemIndex > 0 ? items[itemIndex - 1] : null;
  const nextItem =
    itemIndex >= 0 && itemIndex < items.length - 1 ? items[itemIndex + 1] : null;

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
          href={scopeHref(orgSlugOrId, scopeType, scope)}
          className="text-muted-foreground hover:text-foreground"
        >
          {scope.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">{item.display_name}</span>
      </div>

      {/* Item identity + value for this scope */}
      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                {item.display_name}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {scopeType.label_singular} · {scope.name}
              </p>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingItem(true)}
            className="shrink-0"
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit item
          </Button>
        </div>

        {/* The value for THIS scope × item */}
        <div className="border-t border-border pt-5">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Value for {scope.name}
          </p>
          {valueRow ? (
            <ScopeFieldInput scopeId={scope.id} row={valueRow} />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading value…
            </div>
          )}
        </div>
      </Card>

      {/* Properties (normal + advanced) */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-foreground mb-3">Details</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <PropRow label="Type" value={VALUE_TYPE_CONFIG[item.value_type]?.label ?? item.value_type} />
          <PropRow label="Category" value={item.category || "—"} />
          <PropRow label="URL slug" value={item.slug || "—"} mono />
          <PropRow label="Key" value={item.key} mono />
          <PropRow label="Sensitivity" value={item.sensitivity} />
          <PropRow label="Fetch hint" value={item.fetch_hint?.replace(/_/g, " ")} />
          <PropRow label="Sort order" value={String(item.sort_order ?? 0)} />
          <PropRow
            label="Tags"
            value={(item.tags ?? []).length ? (item.tags ?? []).join(", ") : "—"}
          />
        </dl>
      </Card>

      {/* Prev / next item within this scope */}
      <div className="flex items-center justify-between">
        {prevItem ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(scopeItemHref(orgSlugOrId, scopeType, scope, prevItem))
            }
            className="text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {prevItem.display_name}
          </Button>
        ) : (
          <span />
        )}
        {nextItem ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(scopeItemHref(orgSlugOrId, scopeType, scope, nextItem))
            }
            className="text-muted-foreground"
          >
            {nextItem.display_name}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <span />
        )}
      </div>

      <EditContextItemSheet
        open={editingItem}
        onOpenChange={setEditingItem}
        itemId={item.id}
      />
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
    <div className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-2">
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
