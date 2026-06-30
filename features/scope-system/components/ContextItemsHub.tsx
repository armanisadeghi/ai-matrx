"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
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
  fetchScopeTypes,
  selectScopeTypeBySlugOrId,
  selectScopeTypesByOrg,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import { fetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";
import {
  selectFullContextOrganizations,
  selectFullContextStatus,
  type NavOrganization,
} from "@/features/agent-context/redux/hierarchySlice";
import {
  canManageSettings,
  type OrgRole,
} from "@/features/organizations/types";
import {
  listScopeTypeItems,
  updateContextItem,
  selectItemsByType,
  selectItemsLoadedForType,
  type ContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";
import { ContextItemAddForm } from "./ContextItemAddForm";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { ReorderDialog } from "./ReorderDialog";
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
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";
import type { ScopeType } from "@/features/agent-context/redux/scope/types";

interface ContextItemsHubProps {
  orgId: string;
  orgSlugOrId: string;
  orgName: string;
  orgIsPersonal: boolean;
  /** Present → one scope type's items (full add/reorder). Absent → all of the org's
   * types, grouped (the "drop the type filter" view that forces type headers). */
  typeParam?: string;
  canManage: boolean;
}

/**
 * Context Items Hub — one component, two scopes:
 *  - with `typeParam`: the items of a single scope type (full manage UI).
 *  - without: every scope type in the org, each as its own section (grouped).
 * Dropping the type filter forces the scope-type grouping headers — which is also
 * how this view always shows you which dimension you're looking at.
 */
export function ContextItemsHub(props: ContextItemsHubProps) {
  return props.typeParam ? (
    <ContextItemsTypeView {...props} typeParam={props.typeParam} />
  ) : (
    <ContextItemsOrgView {...props} />
  );
}

const PERSONAL_PROJECTS_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * All context items across every organization the user belongs to, grouped
 * org → scope type → items. Same `ScopeTypeItemsSection` building block as the
 * org/type levels — the only difference is iterating the user's orgs.
 */
export function AllContextItemsHub() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const orgs = useAppSelector(selectFullContextOrganizations);
  const status = useAppSelector(selectFullContextStatus);

  useEffect(() => {
    dispatch(fetchFullContext());
  }, [dispatch]);

  const realOrgs = (orgs ?? []).filter(
    (o) => o.id !== PERSONAL_PROJECTS_ORG_ID,
  );

  return (
    <div className="space-y-6 pr-14">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="h-7 px-2 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              All organizations
            </p>
            <h1 className="text-2xl font-bold text-foreground leading-tight">
              All context items
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every field across all your organizations, grouped by org and
              scope type.
            </p>
          </div>
        </div>
      </Card>

      {status === "loading" && realOrgs.length === 0 ? (
        <CenteredSpinner />
      ) : realOrgs.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No organizations.
        </Card>
      ) : (
        realOrgs.map((org) => <OrgContextItemsBlock key={org.id} org={org} />)
      )}
    </div>
  );
}

function OrgContextItemsBlock({ org }: { org: NavOrganization }) {
  const dispatch = useAppDispatch();
  const types = useAppSelector((s) => selectScopeTypesByOrg(s, org.id));
  const canManage = canManageSettings(org.role as OrgRole);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchScopeTypes(org.id));
  }, [dispatch, org.id]);

  if (types.length === 0) return null;

  return (
    <div className="space-y-3">
      <Link
        href={`/organizations/${org.slug}/context-items`}
        className="group inline-flex items-center gap-2 text-lg font-bold text-foreground hover:text-primary"
      >
        {org.is_personal ? (
          <Home className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}
        {org.is_personal ? "Personal workspace" : org.name}
        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
      </Link>

      <div className="space-y-4 pl-2 border-l-2 border-border">
        {types.map((type) => (
          <ScopeTypeItemsSection
            key={type.id}
            type={type}
            orgSlugOrId={org.slug}
            canManage={canManage}
            onEditItem={setEditingItemId}
          />
        ))}
      </div>

      <EditContextItemSheet
        open={editingItemId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingItemId(null);
        }}
        itemId={editingItemId}
      />
    </div>
  );
}

// ── Type level: a single scope type's context items (full manage) ────────────

function ContextItemsTypeView({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  typeParam,
  canManage,
}: ContextItemsHubProps & { typeParam: string }) {
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
      <CenteredSpinner />
    );
  }

  const color = resolveColor(scopeType);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-lg ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
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
                Fields defined once on {scopeType.label_plural}, filled in per{" "}
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

      {!itemsLoaded ? (
        <CenteredSpinner />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((item) => (
              <ContextItemListRow
                key={item.id}
                item={item}
                href={contextItemHref(orgSlugOrId, scopeType, item)}
                canManage={canManage}
                onEdit={() => setEditingItemId(item.id)}
              />
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

// ── Org level: every scope type in the org, grouped ──────────────────────────

function ContextItemsOrgView({
  orgId,
  orgSlugOrId,
  orgName,
  orgIsPersonal,
  canManage,
}: ContextItemsHubProps) {
  const scopeTypes = useAppSelector((s) => selectScopeTypesByOrg(s, orgId));
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {orgIsPersonal ? "Personal workspace" : orgName}
            </p>
            <h1 className="text-2xl font-bold text-foreground leading-tight">
              All context items
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every field across all scope types in this organization, grouped
              by type.
            </p>
          </div>
        </div>
      </Card>

      {!typesLoaded ? (
        <CenteredSpinner />
      ) : scopeTypes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No scope types yet.
        </Card>
      ) : (
        scopeTypes.map((type) => (
          <ScopeTypeItemsSection
            key={type.id}
            type={type}
            orgSlugOrId={orgSlugOrId}
            canManage={canManage}
            onEditItem={setEditingItemId}
          />
        ))
      )}

      <EditContextItemSheet
        open={editingItemId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingItemId(null);
        }}
        itemId={editingItemId}
      />
    </div>
  );
}

function ScopeTypeItemsSection({
  type,
  orgSlugOrId,
  canManage,
  onEditItem,
}: {
  type: ScopeType;
  orgSlugOrId: string;
  canManage: boolean;
  onEditItem: (id: string) => void;
}) {
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => selectItemsByType(s, type.id));
  const loaded = useAppSelector((s) => selectItemsLoadedForType(s, type.id));
  const color = resolveColor(type);

  useEffect(() => {
    dispatch(listScopeTypeItems(type.id));
  }, [dispatch, type.id]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={contextItemsHref(orgSlugOrId, type)}
          className="group inline-flex items-center gap-2 text-base font-semibold text-foreground hover:text-primary"
        >
          <span
            className={`w-6 h-6 rounded ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center`}
          >
            <ScopeGlyph icon={type.icon} className="h-3.5 w-3.5" />
          </span>
          {type.label_plural}
          <span className="text-sm font-normal text-muted-foreground">
            ({items.length})
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
        </Link>
      </div>

      {!loaded ? (
        <div className="flex items-center py-6 px-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card className="px-4 py-5 text-sm text-muted-foreground">
          No context items for {type.label_plural.toLowerCase()} yet.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {items.map((item) => (
              <ContextItemListRow
                key={item.id}
                item={item}
                href={contextItemHref(orgSlugOrId, type, item)}
                canManage={canManage}
                onEdit={() => onEditItem(item.id)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function ContextItemListRow({
  item,
  href,
  canManage,
  onEdit,
}: {
  item: ContextItem;
  href: string;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={href}
            className="group/name inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
          >
            {item.display_name}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
          </Link>
          <Badge variant="secondary" className="text-[10px]">
            {VALUE_TYPE_CONFIG[item.value_type]?.label ?? item.value_type}
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
          onClick={onEdit}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
          aria-label={`Edit ${item.display_name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
