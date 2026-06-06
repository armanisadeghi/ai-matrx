"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  ChevronRight,
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
import { EditContextItemSheet } from "./EditContextItemSheet";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { NewScopeInline } from "./NewScopeInline";
import { ContextItemAddForm } from "./ContextItemAddForm";
import { ScopeGlyph } from "./ScopeGlyph";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { selectScopeTypeById } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";

const MAX_COLUMNS = 6;

interface ScopesListProps {
  orgId: string;
  orgSlugOrId: string;
  typeId: string;
  orgName: string;
  orgSlug: string;
  orgIsPersonal: boolean;
}

export function ScopesList({
  orgId,
  orgSlugOrId,
  typeId,
  orgName,
  orgSlug,
  orgIsPersonal,
}: ScopesListProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const scopeType = useAppSelector((s) => selectScopeTypeById(s, typeId));
  const scopes = useAppSelector((s) => selectScopesByType(s, typeId));
  const items = useAppSelector((s) => selectItemsByType(s, typeId));
  const itemsLoaded = useAppSelector((s) =>
    selectItemsLoadedForType(s, typeId),
  );

  const [adding, setAdding] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    dispatch(fetchScopes({ org_id: orgId, type_id: typeId }));
    dispatch(listScopeTypeItems(typeId));
  }, [dispatch, orgId, typeId]);

  useEffect(() => {
    for (const scope of scopes) {
      dispatch(getScopeContext({ scope_id: scope.id, include_empty: true }));
    }
  }, [dispatch, scopes]);

  const sorted = useMemo(
    () =>
      [...scopes].sort(
        (a, b) =>
          new Date(b.updated_at ?? 0).getTime() -
          new Date(a.updated_at ?? 0).getTime(),
      ),
    [scopes],
  );

  const columns = items.slice(0, MAX_COLUMNS);
  const overflowCount = Math.max(0, items.length - MAX_COLUMNS);

  if (!scopeType) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const color = resolveColor(scopeType);
  const scopeCount = sorted.length;

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb: Back · Org · Scope type ───────────────────── */}
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
          href={`/organizations/${orgSlug}/scopes`}
          className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          {orgIsPersonal ? (
            <Home className="h-3.5 w-3.5" />
          ) : (
            <Building2 className="h-3.5 w-3.5" />
          )}
          {orgIsPersonal ? "Personal workspace" : orgName}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">
          {scopeType.label_plural}
        </span>
      </div>

      {/* ── Scope Type header ────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`w-14 h-14 rounded-xl ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center shrink-0`}
            >
              <ScopeGlyph icon={scopeType.icon} className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">
                  {scopeType.label_plural}
                </h1>
                <Badge variant="secondary" className="text-xs font-normal">
                  Scope Type
                </Badge>
              </div>
              {scopeType.description && (
                <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
                  {scopeType.description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-foreground">
                    {scopeCount}
                  </span>
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
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingType(true)}
            className="shrink-0"
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Edit {scopeType.label_singular} Settings
          </Button>
        </div>
      </Card>

      <EditScopeTypeSheet
        open={editingType}
        onOpenChange={setEditingType}
        orgId={orgId}
        typeId={typeId}
        onDeleted={() => router.push(`/organizations/${orgSlugOrId}/scopes`)}
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
          <Button size="sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New {scopeType.label_singular}
          </Button>
        </div>

        {adding && (
          <NewScopeInline
            orgId={orgId}
            typeId={typeId}
            labelSingular={scopeType.label_singular}
            labelPlural={scopeType.label_plural}
            onCancel={() => setAdding(false)}
            onCreated={(scopeId) => {
              setAdding(false);
              router.push(
                `/organizations/${orgSlugOrId}/scopes/${typeId}/${scopeId}`,
              );
            }}
          />
        )}

        {scopeCount === 0 && !adding ? (
          <Card className="p-10 text-center">
            <div
              className={`w-14 h-14 rounded-full ${color.bg} ${color.fg} ring-1 ${color.ring} flex items-center justify-center mx-auto mb-3`}
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
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <colgroup>
                  <col className="w-[180px]" />
                  {columns.map((col) => (
                    <col key={col.id} className="w-[200px]" />
                  ))}
                  {overflowCount > 0 && <col className="w-[80px]" />}
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-3 whitespace-nowrap">
                      Name
                    </TableHead>
                    {columns.map((col) => (
                      <TableHead key={col.id} className="px-3 max-w-0">
                        <span
                          className="block truncate"
                          title={col.display_name}
                        >
                          {col.display_name}
                        </span>
                      </TableHead>
                    ))}
                    {overflowCount > 0 && (
                      <TableHead className="px-3 text-muted-foreground text-xs whitespace-nowrap">
                        +{overflowCount} more
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((scope) => (
                    <ScopeTableRow
                      key={scope.id}
                      scopeId={scope.id}
                      scopeName={scope.name}
                      columns={columns}
                      overflowCount={overflowCount}
                      onClick={() =>
                        router.push(
                          `/organizations/${orgSlugOrId}/scopes/${typeId}/${scope.id}`,
                        )
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
          <h2 className="text-base font-semibold text-foreground">
            Context Items
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
          </h2>
          {!addingItem && (
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
                      <span className="text-sm font-medium text-foreground">
                        {item.display_name}
                      </span>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingItemId(item.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                    aria-label={`Edit ${item.display_name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              {items.length === 0 && !addingItem && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No context items yet. Add one to define what data to track for
                  each {scopeType.label_singular.toLowerCase()}.
                </div>
              )}

              {addingItem && (
                <div className="p-4 bg-muted/20">
                  <ContextItemAddForm
                    scopeTypeId={typeId}
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
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface ScopeTableRowProps {
  scopeId: string;
  scopeName: string;
  columns: { id: string; display_name: string }[];
  overflowCount: number;
  onClick: () => void;
}

function ScopeTableRow({
  scopeId,
  scopeName,
  columns,
  overflowCount,
  onClick,
}: ScopeTableRowProps) {
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const valueMap = new Map<string, ScopeContextRow>();
  for (const r of rows ?? []) valueMap.set(r.item_id, r);

  return (
    <TableRow
      onClick={onClick}
      className="cursor-pointer hover:bg-accent/40 group"
    >
      <TableCell className="px-3 font-medium max-w-0">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 w-full min-w-0">
                <span className="truncate">{scopeName}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{scopeName}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      {columns.map((col) => {
        const row = valueMap.get(col.id);
        const display = row ? renderValue(row) : "";
        const isEmpty = !display;

        if (!rows) {
          return (
            <TableCell
              key={col.id}
              className="px-3 text-muted-foreground max-w-0"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
            </TableCell>
          );
        }

        return (
          <TableCell
            key={col.id}
            className={`px-3 max-w-0 ${isEmpty ? "text-muted-foreground" : ""}`}
          >
            {isEmpty ? (
              <span className="truncate block text-xs">—</span>
            ) : (
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate block cursor-help text-sm">
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
          </TableCell>
        );
      })}
      {overflowCount > 0 && (
        <TableCell className="px-3 text-muted-foreground text-xs whitespace-nowrap">
          …
        </TableCell>
      )}
    </TableRow>
  );
}

function renderValue(row: ScopeContextRow): string {
  if (row.value_text) return row.value_text;
  if (row.value_number != null) return String(row.value_number);
  if (row.value_boolean != null) return row.value_boolean ? "Yes" : "No";
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
