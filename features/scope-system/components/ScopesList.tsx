"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Loader2,
  Pencil,
  Plus,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchScopes,
  selectScopesByType,
} from "@/features/agent-context/redux/scope/scopesSlice";
import { selectScopeTypeById } from "@/features/agent-context/redux/scope/scopeTypesSlice";
import {
  createContextItem,
  listScopeTypeItems,
  selectItemsByType,
  selectItemsLoadedForType,
  type ContextValueType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
  type ScopeContextRow,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import { VALUE_TYPE_CONFIG } from "@/features/agent-context/constants";
import { slugifyKey } from "@/features/scope-system/utils/slugify";

const MAX_COLUMNS = 6;

interface ScopesListProps {
  orgId: string;
  orgSlugOrId: string;
  typeId: string;
}

export function ScopesList({ orgId, orgSlugOrId, typeId }: ScopesListProps) {
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
  const [newItemName, setNewItemName] = useState("");
  const [newItemType, setNewItemType] = useState<ContextValueType>("string");
  const [addingItemBusy, setAddingItemBusy] = useState(false);

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

  const Icon = resolveIcon(scopeType.icon);
  const color = resolveColor(scopeType);

  async function handleAddItem() {
    const trimmed = newItemName.trim();
    if (!trimmed) return;
    setAddingItemBusy(true);
    try {
      await dispatch(
        createContextItem({
          scope_type_id: typeId,
          key: slugifyKey(trimmed) || trimmed.toLowerCase(),
          display_name: trimmed,
          value_type: newItemType,
        }),
      ).unwrap();
      toast.success(`Added context item "${trimmed}"`);
      setNewItemName("");
      setNewItemType("string");
      setAddingItem(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add context item",
      );
    } finally {
      setAddingItemBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      {/* ── Scope Type header ────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-xl ${color.fg} flex items-center justify-center shrink-0`}
            >
              <Icon className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">
                  {scopeType.label_plural}
                </h1>
                <Badge variant="secondary" className="text-xs font-normal">
                  Scope Type
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {sorted.length}{" "}
                {sorted.length === 1
                  ? scopeType.label_singular.toLowerCase()
                  : scopeType.label_plural.toLowerCase()}
                {" · "}
                {items.length}{" "}
                {items.length === 1 ? "context item" : "context items"}
              </p>
              {scopeType.description && (
                <p className="text-sm text-muted-foreground mt-2 max-w-xl">
                  {scopeType.description}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingType(true)}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            Edit scope type
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
            {sorted.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({sorted.length})
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

        {sorted.length === 0 && !adding ? (
          <Card className="p-10 text-center">
            <div
              className={`w-14 h-14 rounded-full ${color.fg} flex items-center justify-center mx-auto mb-3`}
            >
              <Icon className="h-8 w-8" />
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
        ) : sorted.length > 0 ? (
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
                      <Badge variant="secondary" className="text-[10px]">
                        {VALUE_TYPE_CONFIG[item.value_type]?.label ??
                          item.value_type}
                      </Badge>
                      {item.category && (
                        <Badge variant="outline" className="text-[10px]">
                          {item.category}
                        </Badge>
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
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {item.key}
                    </p>
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
                <div className="p-4 bg-muted/30 space-y-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    Adds a new field to all{" "}
                    {scopeType.label_plural.toLowerCase()}.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      autoFocus
                      placeholder="e.g. Website URL"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      style={{ fontSize: "16px" }}
                      disabled={addingItemBusy}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddItem();
                        if (e.key === "Escape") {
                          setAddingItem(false);
                          setNewItemName("");
                        }
                      }}
                    />
                    <Select
                      value={newItemType}
                      onValueChange={(v) =>
                        setNewItemType(v as ContextValueType)
                      }
                      disabled={addingItemBusy}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(VALUE_TYPE_CONFIG) as ContextValueType[]
                        ).map((k) => (
                          <SelectItem key={k} value={k}>
                            {VALUE_TYPE_CONFIG[k].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingItem(false);
                        setNewItemName("");
                        setNewItemType("string");
                      }}
                      disabled={addingItemBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      disabled={addingItemBusy || !newItemName.trim()}
                    >
                      {addingItemBusy && (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      )}
                      Add
                    </Button>
                  </div>
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
