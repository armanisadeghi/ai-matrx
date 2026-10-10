"use client";

// features/scopes/components/management/OrgScopeTypeSection.tsx
//
// THE scope-type card — one per scope type, on the org home (/organizations/<org>) and the
// org's Scopes page (/organizations/<org>/scopes). It is the design system's table card
// (`MatrxTableCard`) around the canonical table: icon, colour rail, "4 clients · 14 fields",
// Edit (the scope type's settings sheet) and Open (the type's page), the scopes × fields
// preview, and "+ Add client" with the inline add flow.
//
// History: the org home drew its own copy of this card (features/scope-system
// OrgHomeScopeSection) and lost its look on 2026-09-21 when the shared table was dropped inside
// it as-is — a framed table in a framed card, a second toolbar row, a pager above "+ Add". The
// card now owns the frame and the two pages render this one component (Arman, 2026-09-29).
//
// Values load per scope WHEN ITS ROW IS DRAWN (the card shows 10 rows, then "Show more"), never
// for every scope up front — an org with 600 tags fired 600 reads to draw 10 rows.

import { withArticle } from "@/lib/text/withArticle";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus } from "lucide-react";
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
  MatrxDataTable,
  MatrxTableCard,
  MatrxTableCardEmpty,
} from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { canShapeScopeType } from "@ai-matrx/records/scopes";
import { makeSelectScopesForType } from "@/features/scopes/redux/selectors/tree";
import { makeSelectItemsForType } from "@/features/scopes/redux/selectors/context-items";
import { makeSelectScopeValuesEntry } from "@/features/scopes/redux/selectors/context-values";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import { ensureContextValues } from "@/features/scopes/redux/thunks/ensureContextValues";
import { EditScopeTypeSheet } from "@/features/scopes/components/management/EditScopeTypeSheet";
import { NewScopeInline } from "@/features/scopes/components/management/NewScopeInline";
import { resolveIcon } from "@/features/scopes/utils/resolveIcon";
import { resolveColor } from "@/features/scopes/constants/scope-colors";
import { contextItemsHref, scopeSeg } from "@/features/scopes/lib/scopeRoutes";
import { summarizeContextCell } from "@/features/scopes/utils/referenceCell";
import type { ContextItemRow, ScopeNode, ScopeTypeNode } from "@/features/scopes/types";

interface OrgScopeTypeSectionProps {
  scopeType: ScopeTypeNode;
  orgId: string;
  orgSlugOrId: string;
  /** The viewer's organization role; with the type's creator it decides who edits the type's structure. */
  role?: string | null;
}

/** Fields shown as columns; the rest are counted in a "+N more" column. */
const MAX_COLUMNS = 6;

export function OrgScopeTypeSection({
  scopeType,
  orgId,
  orgSlugOrId,
  role,
}: OrgScopeTypeSectionProps) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  // Structure (fields, labels, archive) is the org admins' and the type's creator's; every member adds scopes.
  const canEditStructure = canShapeScopeType(role, userId, scopeType);
  const dispatch = useAppDispatch();
  const selectScopesForType = useMemo(() => makeSelectScopesForType(), []);
  const scopes = useAppSelector((s) => selectScopesForType(s, scopeType.id));
  const selectItemsForType = useMemo(() => makeSelectItemsForType(), []);
  const items = useAppSelector((s) => selectItemsForType(s, scopeType.id));
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    void dispatch(ensureScopeTypeItems(scopeType.id));
  }, [dispatch, scopeType.id]);

  const Icon = resolveIcon(scopeType.icon);
  const color = resolveColor(scopeType);
  const columns = items.slice(0, MAX_COLUMNS);
  const overflowCount = Math.max(0, items.length - MAX_COLUMNS);
  const singular = scopeType.label_singular.toLowerCase();
  const plural = scopeType.label_plural.toLowerCase();
  const typeHref = `/organizations/${orgSlugOrId}/scopes/${scopeType.id}`;
  const scopeHref = (scope: ScopeNode) => `${typeHref}/${scope.id}`;

  const tableColumns = useMemo<MatrxColumnDef<ScopeNode>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        width: 160,
        cell: (scope) => (
          <ScopeNameCell scope={scope} href={`${typeHref}/${scope.id}`} colorClass={color.fg} />
        ),
      },
      ...columns.map(
        (item): MatrxColumnDef<ScopeNode> => ({
          id: item.id,
          header: item.display_name,
          // Values load per drawn row, so no loaded view can sort or filter by them honestly.
          accessorFn: () => "",
          width: 180,
          sortable: false,
          filter: false,
          cell: (scope) => <ScopeValueCell scopeId={scope.id} itemId={item.id} />,
        }),
      ),
      ...(overflowCount > 0
        ? [
            {
              id: "more-fields",
              header: `+${overflowCount} more`,
              accessorFn: () => "",
              width: 80,
              sortable: false,
              filter: false,
              cell: () => <span className="text-muted-foreground">…</span>,
            } satisfies MatrxColumnDef<ScopeNode>,
          ]
        : []),
    ],
    [columns, overflowCount, typeHref, color.fg],
  );

  const inlineAdd = (
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
  );

  return (
    <>
      <MatrxTableCard
        title={scopeType.label_plural}
        icon={<Icon />}
        iconClassName={color.fg}
        railClassName={color.swatch}
        records={{ count: scopes.length, singular, plural }}
        fields={items.length}
        {...(canEditStructure
          ? { edit: { onEdit: () => setEditing(true), label: `Edit ${scopeType.label_plural}` } }
          : {})}
        open={{ href: typeHref }}
        {...(scopes.length > 0 ? { add: { label: `Add ${singular}`, onAdd: () => setAdding(true) } } : {})}
        {...(adding ? { adding: inlineAdd } : {})}
      >
        {scopes.length > 0 ? (
          <MatrxDataTable<ScopeNode>
            urlState={{ id: `org-scopes-${scopeType.id}` }}
            tableId={`organizations/scopes/${scopeType.id}`}
            data={scopes}
            columns={tableColumns}
            getRowId={(scope) => scope.id}
            searchText={(scope) => scope.name}
            getRowHref={scopeHref}
            onRowOpen={(scope) => router.push(scopeHref(scope))}
            // One row in the card's header: the controls never wrap under the search box.
            toolbar={{ singleRow: true, search: true, searchPlaceholder: `Search ${plural}…` }}
            detail={{ enabled: false }}
          />
        ) : adding ? null : items.length > 0 ? (
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
          <MatrxTableCardEmpty
            message={`No ${plural} yet`}
            action={{ label: `Add your first ${singular}`, onClick: () => setAdding(true) }}
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

/** The scope's name, as a real link; drawing it loads this scope's values (once, deduped). */
function ScopeNameCell({ scope, href, colorClass }: { scope: ScopeNode; href: string; colorClass: string }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(ensureContextValues(scope.id));
  }, [dispatch, scope.id]);
  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      title={scope.name}
      className="group/name flex w-full min-w-0 items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className={`truncate font-semibold ${colorClass}`}>{scope.name}</span>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-within/name:opacity-100" />
    </Link>
  );
}

function ScopeValueCell({ scopeId, itemId }: { scopeId: string; itemId: string }) {
  const selectValuesEntry = useMemo(() => makeSelectScopeValuesEntry(), []);
  const entry = useAppSelector((s) => selectValuesEntry(s, scopeId));
  if (entry.status === "idle" || entry.status === "loading") {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Loading value" />;
  }
  const value = entry.values[itemId];
  const display = value ? (summarizeContextCell(value) ?? "") : "";
  if (!display) return <span className="block truncate text-muted-foreground">—</span>;
  return (
    <span className="block truncate" title={display}>
      {display}
    </span>
  );
}

interface ContextItemsReadyPreviewProps {
  scopeType: ScopeTypeNode;
  items: ContextItemRow[];
  columns: ContextItemRow[];
  overflowCount: number;
  orgSlugOrId: string;
  nameColorClass: string;
  onAdd: () => void;
}

/**
 * Fields exist but no scope does yet: the table's own shape with two faint placeholder rows,
 * any of which starts the inline add.
 */
export function ContextItemsReadyPreview({
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
  const fieldsWord = items.length === 1 ? "field" : "fields";

  return (
    <div className="space-y-3 px-2">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {items.length} {fieldsWord}
        </span>{" "}
        ready — add {withArticle(singular)} to start filling them in.
      </p>

      <div className="overflow-x-auto rounded-lg border border-dashed border-border/80 bg-muted/20">
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
                  <span className={`truncate block italic ${nameColorClass}`}>{label}</span>
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col.id} className="px-2 text-muted-foreground max-w-0">
                    <span className="truncate block">—</span>
                  </TableCell>
                ))}
                {overflowCount > 0 && (
                  <TableCell className="px-2 text-muted-foreground whitespace-nowrap">…</TableCell>
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
          View all {items.length} {fieldsWord}
        </Link>
        <Button icon={<Plus />} variant="primary" onClick={onAdd}>
          Add your first {singular}
        </Button>
      </div>
    </div>
  );
}
