"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Home,
  Layers,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Tag as TagIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { EditContextItemSheet } from "./EditContextItemSheet";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { NewScopeInline } from "./NewScopeInline";
import { ContextItemAddForm } from "./ContextItemAddForm";
import { ScopeGlyph } from "./ScopeGlyph";
import { ScopeNotFound } from "./ScopeNotFound";
import { ReorderDialog } from "./ReorderDialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
  updateScope,
} from "@/features/agent-context/redux/scope/scopesSlice";
import {
  selectScopeTypeBySlugOrId,
  selectScopeTypesLoadedForOrg,
} from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  updateContextItem,
  selectItemsByType,
  selectItemsLoadedForType,
  type ContextItem,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";
import {
  orgScopesHref,
  scopeHref,
  contextItemsHref,
  contextItemHref,
  scopeTypeEditHref,
} from "@/features/scope-system/utils/scopeRoutes";
import { useScopeSuggestions } from "@/features/kg-suggestions/hooks/useScopeSuggestions";
import { KgSuggestionHint } from "@/features/kg-suggestions/components/KgSuggestionHint";
import type {
  KgAcceptResult,
  KgDecisionResponse,
  KgSuggestionRow,
} from "@/features/kg-suggestions/types";

interface ScopesListProps {
  orgId: string;
  orgSlugOrId: string;
  typeId: string;
  orgName: string;
  orgSlug: string;
  orgIsPersonal: boolean;
  /** Owner/admin: may edit the scope type (org-wide structure) + its context-item fields. */
  canManage: boolean;
}

export function ScopesList({
  orgId,
  orgSlugOrId,
  typeId,
  orgName,
  orgSlug,
  orgIsPersonal,
  canManage,
}: ScopesListProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  // `typeId` is the route segment — a UUID or a kebab slug. Resolve to the row.
  const scopeType = useAppSelector((s) =>
    selectScopeTypeBySlugOrId(s, orgId, typeId),
  );
  const typesLoaded = useAppSelector((s) =>
    selectScopeTypesLoadedForOrg(s, orgId),
  );
  const resolvedTypeId = scopeType?.id;
  const scopes = useAppSelector((s) =>
    selectScopesByType(s, resolvedTypeId ?? ""),
  );
  const items = useAppSelector((s) =>
    selectItemsByType(s, resolvedTypeId ?? ""),
  );
  const itemsLoaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, resolvedTypeId ?? ""),
  );
  const suggestions = useScopeSuggestions();

  const [adding, setAdding] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [reorderScopesOpen, setReorderScopesOpen] = useState(false);
  const [reorderItemsOpen, setReorderItemsOpen] = useState(false);

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

  const sorted = useMemo(
    () =>
      [...scopes].sort(
        (a, b) =>
          (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
          a.name.localeCompare(b.name),
      ),
    [scopes],
  );

  async function moveItem(index: number, dir: "up" | "down") {
    const target = items[index];
    const neighbor = items[index + (dir === "up" ? -1 : 1)];
    if (!target || !neighbor || movingId) return;
    const targetOrder = target.sort_order ?? index;
    const neighborOrder = neighbor.sort_order ?? index;
    setMovingId(target.id);
    try {
      await Promise.all([
        dispatch(
          updateContextItem({ id: target.id, sort_order: neighborOrder }),
        ).unwrap(),
        dispatch(
          updateContextItem({ id: neighbor.id, sort_order: targetOrder }),
        ).unwrap(),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reorder");
    } finally {
      setMovingId(null);
    }
  }

  async function saveScopeOrder(orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, i) =>
        dispatch(updateScope({ scope_id: id, sort_order: i + 1 })).unwrap(),
      ),
    );
    toast.success("Order saved");
  }

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
        message={`No scope type matches "${typeId}" in this organization.`}
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
  const scopeCount = sorted.length;
  const typeSuggestions = sorted.flatMap((s) => suggestions.forScope(s.id));

  return (
    <div className="space-y-6 pr-14">
      {/* ── Back ─────────────────────────────────────────────────── */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="h-7 px-2 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      {/* ── Identity header: "<ORG> / <Type plural>" ─────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`w-16 h-16 rounded-2xl ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-9 w-9" />
            </div>
            <div className="min-w-0">
              <Link
                href={orgScopesHref(orgSlug)}
                className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                {orgIsPersonal ? (
                  <Home className="h-3.5 w-3.5" />
                ) : (
                  <Building2 className="h-3.5 w-3.5" />
                )}
                {orgIsPersonal ? "Personal workspace" : orgName}
              </Link>
              <h1 className="text-3xl font-bold text-foreground leading-tight">
                {scopeType.label_plural}
              </h1>
              {scopeType.description && (
                <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                  {scopeType.description}
                </p>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingType(true)}
                title="Quick edit"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={scopeTypeEditHref(orgSlugOrId, scopeType)}>
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  Edit {scopeType.label_singular} Settings
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Counts — full width, left-aligned, below the logo/title */}
        <div className="mt-5 pt-4 border-t border-border flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{scopeCount}</span>
            <span className="text-muted-foreground">
              {scopeCount === 1
                ? scopeType.label_singular.toLowerCase()
                : scopeType.label_plural.toLowerCase()}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">
              {items.length}
            </span>
            <span className="text-muted-foreground">
              {items.length === 1 ? "context item" : "context items"}
            </span>
          </span>
        </div>
      </Card>

      <EditScopeTypeSheet
        open={editingType}
        onOpenChange={setEditingType}
        orgId={orgId}
        typeId={scopeType.id}
        onDeleted={() => router.push(orgScopesHref(orgSlugOrId))}
      />

      {/* ── Individual scopes (tabular) ──────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {scopeType.label_plural}
            {scopeCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({scopeCount})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {canManage && scopeCount > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReorderScopesOpen(true)}
              >
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                Edit order
              </Button>
            )}
            <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New {scopeType.label_singular}
            </Button>
          </div>
        </div>

        {typeSuggestions.length > 0 && (
          <KgSuggestionHint
            variant="banner"
            rows={typeSuggestions}
            accept={suggestions.accept}
            reject={suggestions.reject}
            defer={suggestions.defer}
            label={scopeType.label_plural.toLowerCase()}
            align="start"
          />
        )}

        {adding && (
          <NewScopeInline
            orgId={orgId}
            typeId={scopeType.id}
            labelSingular={scopeType.label_singular}
            labelPlural={scopeType.label_plural}
            onCancel={() => setAdding(false)}
            onCreated={(scopeId) => {
              setAdding(false);
              router.push(scopeHref(orgSlugOrId, scopeType, { id: scopeId }));
            }}
          />
        )}

        {scopeCount === 0 && !adding ? (
          <Card className="p-10 text-center">
            <div
              className={`w-14 h-14 rounded-full ${SCOPE_ICON_SURFACE} ${color.fg} ring-1 ${color.ring} flex items-center justify-center mx-auto mb-3`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-7 w-7" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">
              No {scopeType.label_plural.toLowerCase()} yet
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first {scopeType.label_singular.toLowerCase()} to get
              started.
            </p>
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add {scopeType.label_singular}
            </Button>
          </Card>
        ) : scopeCount > 0 ? (
          <Card className="overflow-hidden">
            {/* Scroll container: vertical + horizontal, with frozen name column + header */}
            <div className="overflow-auto max-h-[65vh]">
              <Table className="w-full border-separate border-spacing-0">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 top-0 z-30 bg-card px-3 w-[200px] min-w-[200px] border-b border-border whitespace-nowrap">
                      Name
                    </TableHead>
                    {items.map((col) => (
                      <TableHead
                        key={col.id}
                        className="sticky top-0 z-20 bg-card px-3 w-[200px] min-w-[200px] border-b border-border"
                      >
                        <span
                          className="block truncate"
                          title={col.display_name}
                        >
                          {col.display_name}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((scope) => (
                    <ScopeTableRow
                      key={scope.id}
                      scopeId={scope.id}
                      scopeName={scope.name}
                      columns={items}
                      suggestionRows={suggestions.forScope(scope.id)}
                      suggestionByItem={suggestions.byScopeItem}
                      accept={suggestions.accept}
                      reject={suggestions.reject}
                      defer={suggestions.defer}
                      onClick={() =>
                        router.push(scopeHref(orgSlugOrId, scopeType, scope))
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            {!adding && (
              <div className="px-3 py-2 border-t border-border">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdding(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add {scopeType.label_singular.toLowerCase()}
                </Button>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {/* ── Context Items (definitions) ──────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Link
            href={contextItemsHref(orgSlugOrId, scopeType)}
            className="group inline-flex items-center gap-1.5 text-base font-semibold text-foreground hover:text-primary"
          >
            Context Items
            {items.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
            <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={contextItemsHref(orgSlugOrId, scopeType)}>
                Open page
              </Link>
            </Button>
            {canManage && items.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReorderItemsOpen(true)}
              >
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5" />
                Edit order
              </Button>
            )}
            {canManage && !addingItem && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingItem(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add context item
              </Button>
            )}
          </div>
        </div>

        {!itemsLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {items.map((item, index) => (
                <ContextItemRow
                  key={item.id}
                  item={item}
                  href={contextItemHref(orgSlugOrId, scopeType, item)}
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  moving={movingId === item.id}
                  disabled={movingId !== null}
                  canManage={canManage}
                  onEdit={() => setEditingItemId(item.id)}
                  onMoveUp={() => moveItem(index, "up")}
                  onMoveDown={() => moveItem(index, "down")}
                />
              ))}

              {items.length === 0 && !addingItem && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No context items yet
                  {canManage
                    ? ` — add one to define what data to track for each ${scopeType.label_singular.toLowerCase()}.`
                    : "."}
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
      </div>

      <EditContextItemSheet
        open={editingItemId !== null}
        onOpenChange={(o) => {
          if (!o) setEditingItemId(null);
        }}
        itemId={editingItemId}
      />

      <ReorderDialog
        open={reorderScopesOpen}
        onOpenChange={setReorderScopesOpen}
        title={`Reorder ${scopeType.label_plural}`}
        description="Drag the handle or use the arrows, then save."
        items={sorted.map((s) => ({ id: s.id, label: s.name }))}
        onSave={saveScopeOrder}
      />
      <ReorderDialog
        open={reorderItemsOpen}
        onOpenChange={setReorderItemsOpen}
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

// ── Sub-components ───────────────────────────────────────────────────────────

interface ContextItemRowProps {
  item: ContextItem;
  href: string;
  isFirst: boolean;
  isLast: boolean;
  moving: boolean;
  disabled: boolean;
  canManage: boolean;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ContextItemRow({
  item,
  href,
  isFirst,
  isLast,
  moving,
  disabled,
  canManage,
  onEdit,
  onMoveUp,
  onMoveDown,
}: ContextItemRowProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-accent/30 transition-colors group">
      {/* Reorder controls (admins only) */}
      {canManage && (
        <div className="flex flex-col -my-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || disabled}
            aria-label="Move up"
            className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {moving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || disabled}
            aria-label="Move down"
            className="h-4 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={href}
            className="group/name inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
          >
            {item.display_name}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity" />
          </Link>
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
          {(item.tags?.length ?? 0) > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{(item.tags?.length ?? 0) - 3}
            </span>
          )}
          {item.sensitivity && item.sensitivity !== "internal" && (
            <Badge
              variant="outline"
              className="text-[10px] text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
            >
              {item.sensitivity}
            </Badge>
          )}
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

interface ScopeTableRowProps {
  scopeId: string;
  scopeName: string;
  columns: { id: string; display_name: string }[];
  suggestionRows: KgSuggestionRow[];
  suggestionByItem: Map<string, KgSuggestionRow[]>;
  accept: (id: string) => Promise<KgAcceptResult>;
  reject: (id: string) => Promise<KgDecisionResponse>;
  defer: (id: string) => Promise<KgDecisionResponse>;
  onClick: () => void;
}

function ScopeTableRow({
  scopeId,
  scopeName,
  columns,
  suggestionRows,
  suggestionByItem,
  accept,
  reject,
  defer,
  onClick,
}: ScopeTableRowProps) {
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const valueMap = new Map<string, ScopeContextRow>();
  for (const r of rows ?? []) valueMap.set(r.item_id, r);

  return (
    <TableRow onClick={onClick} className="cursor-pointer group">
      <TableCell className="sticky left-0 z-10 bg-card group-hover:bg-accent/40 px-3 font-medium w-[200px] min-w-[200px] border-b border-border">
        <span className="flex items-center gap-1.5 w-full min-w-0">
          <span className="truncate">{scopeName}</span>
          {suggestionRows.length > 0 && (
            <span onClick={(e) => e.stopPropagation()} className="shrink-0">
              <KgSuggestionHint
                variant="badge"
                rows={suggestionRows}
                accept={accept}
                reject={reject}
                defer={defer}
                label={scopeName}
                align="start"
              />
            </span>
          )}
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </span>
      </TableCell>
      {columns.map((col) => {
        const row = valueMap.get(col.id);
        const display = row ? renderValue(row) : "";
        const isEmpty = !display;
        const cellSuggestions =
          suggestionByItem.get(`${scopeId}:${col.id}`) ?? [];

        if (!rows) {
          return (
            <TableCell
              key={col.id}
              className="px-3 text-muted-foreground w-[200px] min-w-[200px] border-b border-border group-hover:bg-accent/40"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
            </TableCell>
          );
        }

        return (
          <TableCell
            key={col.id}
            className={`px-3 w-[200px] min-w-[200px] max-w-[200px] border-b border-border group-hover:bg-accent/40 ${isEmpty ? "text-muted-foreground" : ""}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              {isEmpty ? (
                <span className="truncate block text-xs">—</span>
              ) : (
                <TooltipProvider delayDuration={400}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate block cursor-help text-sm min-w-0">
                        {display}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-sm">
                      <p className="text-xs whitespace-pre-wrap break-words">
                        {display}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {cellSuggestions.length > 0 && (
                <span onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <KgSuggestionHint
                    variant="dot"
                    rows={cellSuggestions}
                    accept={accept}
                    reject={reject}
                    defer={defer}
                    align="start"
                  />
                </span>
              )}
            </span>
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function renderValue(row: ScopeContextRow): string {
  if (row.value_text) return row.value_text;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_boolean != null) return row.value_boolean ? "Yes" : "No";
  if (row.value_date) return row.value_date;
  if (row.value_document_url) return row.value_document_url;
  if (row.value_json) {
    try {
      return JSON.stringify(row.value_json);
    } catch {
      return "";
    }
  }
  return "";
}
