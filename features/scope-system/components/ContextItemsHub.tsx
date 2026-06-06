"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  ChevronRight,
  Home,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Tag as TagIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  updateContextItem,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { ContextItemAddForm } from "./ContextItemAddForm";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { ReorderDialog } from "./ReorderDialog";
import { ScopeNotFound } from "./ScopeNotFound";
import { ScopeGlyph } from "./ScopeGlyph";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  contextItemHref,
  orgScopesHref,
  scopeTypeHref,
} from "@/features/scope-system/utils/scopeRoutes";
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";

interface ContextItemsHubProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  typeParam: string;
  canManage: boolean;
}

/**
 * Context Items Collection Hub — the dedicated page for ALL context items defined
 * on a scope type ("Clients"). View, add, reorder, edit (drawer) and drill into
 * each item's own Hub. The full-route counterpart to the inline Context Items
 * section on the scope-type page.
 */
export function ContextItemsHub({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  canManage,
}: ContextItemsHubProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeParam),
  );
  const resolvedTypeId = scopeType?.id;
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );
  const items = useAppSelector((s) =>
    selectItemsByType(s, resolvedTypeId ?? ""),
  );
  const itemsLoaded = useAppSelector((s) =>
    resolvedTypeId ? selectItemsLoadedForType(s, resolvedTypeId) : false,
  );

  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);

  useEffect(() => {
    if (resolvedTypeId) dispatch(listScopeTypeItems(resolvedTypeId));
  }, [dispatch, resolvedTypeId]);

  async function saveItemOrder(orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) =>
        dispatch(updateContextItem({ id, sort_order: i + 1 })).unwrap(),
      ),
    );
    toast.success("Order saved");
  }

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
        <span className="font-medium text-foreground">Context items</span>
      </div>

      {/* Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ListChecks className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {scopeType.label_plural}
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Context items
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Fields defined once on{" "}
                <ScopeGlyph
                  icon={scopeType.icon}
                  className="h-3.5 w-3.5 inline -mt-0.5"
                />{" "}
                {scopeType.label_plural}, filled in per{" "}
                {scopeType.label_singular.toLowerCase()}.
              </p>
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              {items.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReorderOpen(true)}
                >
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                  Edit order
                </Button>
              )}
              {!addingItem && (
                <Button size="sm" onClick={() => setAddingItem(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add item
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* List */}
      {!itemsLoaded ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={contextItemHref(orgSlugOrId, scopeType, item)}
                      className="text-sm font-medium text-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      {item.display_name}
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                    <Badge variant="secondary" className="text-[10px]">
                      {VALUE_TYPE_CONFIG[item.value_type]?.label ??
                        item.value_type}
                    </Badge>
                    {item.category && (
                      <Badge variant="outline" className="text-[10px]">
                        {item.category}
                      </Badge>
                    )}
                    {(item.tags ?? []).slice(0, 3).map((t) => (
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
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingItemId(item.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                    aria-label={`Edit ${item.display_name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {items.length === 0 && !addingItem && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No context items yet
                {canManage ? " — add one to get started." : "."}
              </div>
            )}

            {addingItem && (
              <div className="p-4 bg-muted/20">
                <ContextItemAddForm
                  scopeTypeId={scopeType.id}
                  labelPlural={scopeType.label_plural}
                  onClose={() => setAddingItem(false)}
                />
              </div>
            )}
          </div>
        </Card>
      )}

      <EditContextItemSheet
        open={editingItemId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingItemId(null);
        }}
        itemId={editingItemId}
      />
      <ReorderDialog
        open={reorderOpen}
        onOpenChange={setReorderOpen}
        title="Reorder context items"
        description="Drag the handle or use the arrows, then save."
        items={items.map((i) => ({
          id: i.id,
          label: i.display_name,
          sublabel: i.category ?? undefined,
        }))}
        onSave={saveItemOrder}
      />
    </div>
  );
}
