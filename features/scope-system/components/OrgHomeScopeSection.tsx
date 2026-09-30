"use client";

import { withArticle } from "@/lib/text/withArticle";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { EditScopeTypeSheet } from "./EditScopeTypeSheet";
import { Button } from "@/components/ui/button";
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
import {
  listScopeTypeItems,
  selectItemsByType,
} from "@/features/scopes/redux/contextItemCatalog";
import {
  getScopeContext,
  selectValuesByScope,
} from "@/features/scopes/redux/scopeContextView";
import { NewScopeInline } from "./NewScopeInline";
import { resolveIcon } from "@/features/scopes/utils/resolveIcon";
import { resolveColor } from "@/features/scopes/constants/scope-colors";
import {
  contextItemsHref,
  scopeSeg,
} from "@/features/scopes/lib/scopeRoutes";
import type { ContextItem } from "@/features/scopes/redux/contextItemCatalog";
import type { ScopeContextRow } from "@/features/scopes/redux/scopeContextView";
import { summarizeContextCell } from "@/features/scopes/utils/referenceCell";
import {
  MatrxDataTable,
  MatrxTableCard,
  MatrxTableCardEmpty,
} from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { ScopeTypeNode as ScopeType } from "@/features/scopes/types";
import {
  selectScopesByType,
} from "@/features/scopes/redux/selectors/admin";

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

  const Icon = resolveIcon(scopeType.icon);
  const color = resolveColor(scopeType);
  const columns = items.slice(0, MAX_COLUMNS);
  const overflowCount = Math.max(0, items.length - MAX_COLUMNS);
  const tableColumns: MatrxColumnDef<(typeof scopes)[number]>[] = [
    { id: "name", header: "Name", accessorKey: "name", width: 180, cell: (scope) => <Link href={`/organizations/${orgSlugOrId}/scopes/${scopeType.id}/${scope.id}`} title={scope.name} className={`block truncate font-semibold hover:underline ${color.fg}`}>{scope.name}</Link> },
    ...columns.map((item) => ({ id: item.id, header: item.display_name, accessorFn: () => item.display_name, width: 180, sortable: false, cell: (scope: (typeof scopes)[number]) => <ScopeValueCell scopeId={scope.id} itemId={item.id} /> })),
    ...(overflowCount > 0 ? [{ id: 'more-context-items', header: `+${overflowCount} more`, accessorFn: () => overflowCount, sortable: false, cell: () => <span className="text-muted-foreground">…</span> }] : []),
  ];

  const scopeHref = (scopeId: string) =>
    `/organizations/${orgSlugOrId}/scopes/${scopeType.id}/${scopeId}`;
  const singularLower = scopeType.label_singular.toLowerCase();

  // THE TABLE CARD (canonicalize-without-destroying, 2026-09-30). The card owns the frame, the
  // icon + title + counts line, Edit/Open, the accent rail and the quiet "+ Add" row; the
  // MatrxDataTable inside it draws no frame of its own, puts its toolbar (view tabs, search,
  // columns, copy) in the card's header row and shows "Show more" instead of a pager.
  return (
    <>
      <MatrxTableCard
        title={scopeType.label_plural}
        icon={<Icon />}
        iconClassName={color.fg}
        railClassName={color.swatch}
        records={{
          count: scopes.length,
          singular: singularLower,
          plural: scopeType.label_plural.toLowerCase(),
        }}
        fields={{
          count: items.length,
          singular: "context item",
          plural: "context items",
        }}
        edit={{
          onEdit: () => setEditing(true),
          label: `Edit ${scopeType.label_plural}`,
        }}
        open={{ href: `/organizations/${orgSlugOrId}/scopes/${scopeType.id}` }}
        {...(scopes.length > 0
          ? {
              add: {
                label: `Add ${singularLower}`,
                onAdd: () => setAdding(true),
              },
            }
          : {})}
        {...(adding
          ? {
              adding: (
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
              ),
            }
          : {})}
      >
        {scopes.length > 0 ? (
          <MatrxDataTable
            urlState={{ id: `org-home-scopes-${scopeType.id}` }}
            data={scopes}
            columns={tableColumns}
            getRowId={(scope) => scope.id}
            onRowOpen={(scope) => router.push(scopeHref(scope.id))}
            toolbar={{
              // One row in the card's header: the controls never wrap under the search box.
              singleRow: true,
              search: true,
              searchPlaceholder: `Search ${scopeType.label_plural.toLowerCase()}…`,
            }}
            detail={{ enabled: false }}
          />
        ) : adding ? null : items.length > 0 ? (
          <div className="px-2">
            <ContextItemsReadyPreview
              scopeType={scopeType}
              items={items}
              columns={columns}
              overflowCount={overflowCount}
              orgSlugOrId={orgSlugOrId}
              nameColorClass={color.fg}
              onAdd={() => setAdding(true)}
            />
          </div>
        ) : (
          <MatrxTableCardEmpty
            message={`No ${scopeType.label_plural.toLowerCase()} yet`}
            action={{
              label: `Add your first ${singularLower}`,
              onClick: () => setAdding(true),
            }}
          />
        )}
      </MatrxTableCard>

      <EditScopeTypeSheet
        open={editing}
        onOpenChange={setEditing}
        orgId={orgId}
        typeId={scopeType.id}
      />
    </>
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
        configured — add {withArticle(singular)} to start filling them in.
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
                aria-label={`Add ${singular}`}
                onClick={onAdd}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onAdd();
                  }
                }}
                className="cursor-pointer opacity-45 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

function ScopeValueCell({ scopeId, itemId }: { scopeId: string; itemId: string }) {
  const rows = useAppSelector((state) => selectValuesByScope(state, scopeId));
  if (!rows) return <Loader2 className="h-3 w-3 animate-spin" />;
  const value = rows.find((row) => row.item_id === itemId);
  const display = value ? renderValue(value) : "";
  return <TooltipProvider delayDuration={400}><Tooltip><TooltipTrigger asChild><span className="block truncate cursor-help">{display || "—"}</span></TooltipTrigger>{display && <TooltipContent side="top" className="max-w-sm"><p className="text-xs whitespace-pre-wrap break-words">{display}</p></TooltipContent>}</Tooltip></TooltipProvider>;
}

function renderValue(row: ScopeContextRow): string {
  return summarizeContextCell(row) ?? "";
}
