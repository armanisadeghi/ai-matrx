"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Loader2, Pencil } from "lucide-react";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectScopesByType } from "@/features/agent-context/redux/scope/scopesSlice";
import {
  listScopeTypeItems,
  selectItemsByType,
} from "@/features/scope-system/redux/contextItemsSlice";
import {
  getScopeContext,
  selectValuesByScope,
} from "@/features/scope-system/redux/scopeValuesSlice";
import { NewScopeInline } from "./NewScopeInline";
import { ScopeIcon } from "@/features/scopes/components/ScopeIcon";
import { resolveColor } from "@/features/scope-system/constants/scope-colors";
import {
  contextItemsHref,
  scopeSeg,
} from "@/features/scope-system/utils/scopeRoutes";
import type { ScopeType } from "@/features/agent-context/redux/scope/types";
import type { ContextItem } from "@/features/scope-system/redux/contextItemsSlice";
import type { ScopeContextRow } from "@/features/scope-system/redux/scopeValuesSlice";

interface OrgHomeScopeSectionProps {
  scopeType: ScopeType;
  orgId: string;
  orgSlugOrId: string;
}

const MAX_COLUMNS = 6;

export function OrgHomeScopeSection({
  scopeType,
  orgId,
  orgSlugOrId,
}: OrgHomeScopeSectionProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const scopes = useAppSelector((s) => selectScopesByType(s, scopeType.id));
  const items = useAppSelector((s) => selectItemsByType(s, scopeType.id));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    dispatch(listScopeTypeItems(scopeType.id));
  }, [dispatch, scopeType.id]);

  // Fetch values for each scope (one RPC each — fine for the small N here).
  useEffect(() => {
    for (const scope of scopes) {
      dispatch(getScopeContext({ scope_id: scope.id, include_empty: true }));
    }
    // Re-run when scope ids change
  }, [dispatch, scopes]);

  const color = resolveColor(scopeType);
  const columns = items.slice(0, MAX_COLUMNS);
  const overflowCount = Math.max(0, items.length - MAX_COLUMNS);

  return (
    <Card className="relative overflow-hidden p-6">
      {/* Color anchor: a left accent rail tying the card to this scope type. */}
      <span
        className={`absolute left-0 inset-y-0 w-1 ${color.swatch} opacity-70`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${color.fg} flex items-center justify-center shrink-0`}
          >
            <ScopeIcon name={scopeType.icon} className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {scopeType.label_plural}
            </h2>
            <p className="text-xs text-muted-foreground">
              {scopes.length}{" "}
              {scopes.length === 1
                ? scopeType.label_singular.toLowerCase()
                : scopeType.label_plural.toLowerCase()}
              {" · "}
              {items.length}{" "}
              {items.length === 1 ? "context item" : "context items"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Edit ${scopeType.label_plural}`}
            title="Edit scope type settings"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(
                `/organizations/${orgSlugOrId}/scopes/${scopeType.id}`,
              )
            }
          >
            Open
            <ChevronRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </div>

      <EditScopeTypeSheet
        open={editing}
        onOpenChange={setEditing}
        orgId={orgId}
        typeId={scopeType.id}
      />

      {scopes.length === 0 &&
        !adding &&
        (items.length > 0 ? (
          <ContextItemsReadyPreview
            scopeType={scopeType}
            items={items}
            columns={columns}
            overflowCount={overflowCount}
            orgSlugOrId={orgSlugOrId}
            nameColorClass={color.fg}
            onAdd={() => setAdding(true)}
          />
        ) : (
          <div className="text-center py-6 border-2 border-dashed border-border rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">
              No {scopeType.label_plural.toLowerCase()} yet
            </p>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add your first {scopeType.label_singular.toLowerCase()}
            </Button>
          </div>
        ))}

      {adding && (
        <div className="mb-4">
          <NewScopeInline
            orgId={orgId}
            typeId={scopeType.id}
            labelSingular={scopeType.label_singular}
            labelPlural={scopeType.label_plural}
            orgSlugOrId={orgSlugOrId}
            typeSlugOrId={scopeSeg(scopeType)}
            onCancel={() => setAdding(false)}
            onCreated={() => setAdding(false)}
          />
        </div>
      )}

      {scopes.length > 0 && (
        <>
          <div className="overflow-x-auto -mx-2">
            <Table className="table-fixed w-full">
              <colgroup>
                <col className="w-[160px]" />
                {columns.map((col) => (
                  <col key={col.id} className="w-[180px]" />
                ))}
                {overflowCount > 0 && <col className="w-[80px]" />}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-2 whitespace-nowrap">Name</TableHead>
                  {columns.map((col) => (
                    <TableHead
                      key={col.id}
                      className="px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-0"
                    >
                      <span className="block truncate" title={col.display_name}>
                        {col.display_name}
                      </span>
                    </TableHead>
                  ))}
                  {overflowCount > 0 && (
                    <TableHead className="px-2 text-muted-foreground whitespace-nowrap">
                      +{overflowCount} more
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopes.map((scope) => (
                  <ScopeRow
                    key={scope.id}
                    scopeId={scope.id}
                    scopeName={scope.name}
                    nameColorClass={color.fg}
                    columns={columns}
                    overflowCount={overflowCount}
                    onClick={() =>
                      router.push(
                        `/organizations/${orgSlugOrId}/scopes/${scopeType.id}/${scope.id}`,
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          {!adding && (
            <div className="mt-3">
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
        </>
      )}
    </Card>
  );
}

interface ContextItemsReadyPreviewProps {
  scopeType: ScopeType;
  items: ContextItem[];
  columns: ContextItem[];
  overflowCount: number;
  orgSlugOrId: string;
  nameColorClass: string;
  onAdd: () => void;
}

function ContextItemsReadyPreview({
  scopeType,
  items,
  columns,
  overflowCount,
  orgSlugOrId,
  nameColorClass,
  onAdd,
}: ContextItemsReadyPreviewProps) {
  const singular = scopeType.label_singular.toLowerCase();
  const ghostRows = [`Your first ${singular}`, `Another ${singular}…`] as const;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {items.length} context {items.length === 1 ? "item" : "items"}
        </span>{" "}
        configured — add a {singular} to start filling them in.
      </p>

      <div className="overflow-x-auto -mx-2 rounded-lg border border-dashed border-border/80 bg-muted/20">
        <Table className="table-fixed w-full">
          <colgroup>
            <col className="w-[160px]" />
            {columns.map((col) => (
              <col key={col.id} className="w-[180px]" />
            ))}
            {overflowCount > 0 && <col className="w-[80px]" />}
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-2 whitespace-nowrap">Name</TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className="px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-0"
                >
                  <span className="block truncate" title={col.display_name}>
                    {col.display_name}
                  </span>
                </TableHead>
              ))}
              {overflowCount > 0 && (
                <TableHead className="px-2 text-muted-foreground whitespace-nowrap">
                  +{overflowCount} more
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ghostRows.map((label) => (
              <TableRow
                key={label}
                role="button"
                tabIndex={0}
                onClick={onAdd}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onAdd();
                  }
                }}
                className="cursor-pointer opacity-45 hover:opacity-70 hover:bg-accent/30 transition-[opacity,background-color]"
                aria-label={`Add your first ${singular}`}
              >
                <TableCell className="px-2 font-medium max-w-0">
                  <span className={`truncate block italic ${nameColorClass}`}>
                    {label}
                  </span>
                </TableCell>
                {columns.map((col) => (
                  <TableCell
                    key={col.id}
                    className="px-2 text-muted-foreground max-w-0"
                  >
                    <span className="truncate block">—</span>
                  </TableCell>
                ))}
                {overflowCount > 0 && (
                  <TableCell className="px-2 text-muted-foreground whitespace-nowrap">
                    …
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <Link
          href={contextItemsHref(orgSlugOrId, scopeType)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all {items.length} context items
        </Link>
        <Button size="sm" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add your first {singular}
        </Button>
      </div>
    </div>
  );
}

interface ScopeRowProps {
  scopeId: string;
  scopeName: string;
  nameColorClass: string;
  columns: { id: string; display_name: string }[];
  overflowCount: number;
  onClick: () => void;
}

function ScopeRow({
  scopeId,
  scopeName,
  nameColorClass,
  columns,
  overflowCount,
  onClick,
}: ScopeRowProps) {
  const rows = useAppSelector((s) => selectValuesByScope(s, scopeId));
  const valueMap = new Map<string, ScopeContextRow>();
  for (const r of rows ?? []) valueMap.set(r.item_id, r);

  return (
    <TableRow
      onClick={onClick}
      className="cursor-pointer hover:bg-accent/40 group"
    >
      <TableCell className="px-2 font-medium max-w-0">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center gap-1.5 w-full min-w-0">
                <span className={`truncate font-semibold ${nameColorClass}`}>
                  {scopeName}
                </span>
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
              className="px-2 text-muted-foreground max-w-0"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
            </TableCell>
          );
        }
        return (
          <TableCell
            key={col.id}
            className={`px-2 max-w-0 ${isEmpty ? "text-muted-foreground" : ""}`}
          >
            {isEmpty ? (
              <span className="truncate block">—</span>
            ) : (
              <TooltipProvider delayDuration={400}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate block cursor-help">
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
        <TableCell className="px-2 text-muted-foreground whitespace-nowrap">
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
