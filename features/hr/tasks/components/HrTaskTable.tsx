"use client";

import Link from "next/link";
import { CircleAlert, Clock, EyeOff } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";

import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
import { relativeDue } from "@/features/hr/tasks/urgency";
import type { HrInboxRow } from "@/features/hr/tasks/types";

/**
 * One actionable HR item, rendered once. Every row's title is a DOOR to the
 * exact object — `/hr/tasks/{instance}?step={step}` opens the decision panel
 * with the control focused, never a list containing the item (SPEC-UI-IA §5.9,
 * AR2). A task that can only offer a list is a defect.
 */
export function HrTaskTable({
    rows,
    isLoading,
    selectedIds,
    onSelectedIdsChange,
    bulkActions,
    emptyTitle,
    emptyDescription,
    showDelivery = true,
}: {
    rows: HrInboxRow[];
    isLoading?: boolean;
    selectedIds?: string[];
    onSelectedIdsChange?: (ids: string[]) => void;
    bulkActions?: (selected: HrInboxRow[], selectedIds: string[]) => React.ReactNode;
    emptyTitle: string;
    emptyDescription?: string;
    showDelivery?: boolean;
}) {
    const columns: MatrxColumnDef<HrInboxRow>[] = [
        {
            id: "title",
            accessorFn: (row) => row.title ?? row.flow_label ?? row.flow_key,
            header: "Item",
            sortable: true,
            filter: "text",
            cell: (row) => (
                <div className="min-w-0">
                    <Link
                        href={row.deep_link}
                        className="block truncate font-medium text-foreground hover:underline"
                    >
                        {row.title ?? row.flow_label ?? row.flow_key}
                    </Link>
                    <div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {row.sensitivity_tier === "restricted" ? (
                            <EyeOff
                                className="h-3 w-3 shrink-0"
                                aria-label="Restricted — details are only shown on the record itself"
                            />
                        ) : null}
                        <span className="truncate">{row.step_label ?? row.step_key}</span>
                    </div>
                </div>
            ),
        },
        {
            id: "flow",
            accessorFn: (row) => row.flow_label ?? row.flow_key,
            header: "Kind",
            sortable: true,
            filter: "select",
        },
        {
            id: "due_at",
            accessorKey: "due_at",
            header: "Due",
            sortable: true,
            filter: "auto",
            cell: (row) => (
                <span
                    className={
                        row.due_at && new Date(row.due_at) < new Date()
                            ? "inline-flex items-center gap-1 text-destructive"
                            : "inline-flex items-center gap-1 text-muted-foreground"
                    }
                >
                    <Clock className="h-3 w-3" />
                    {relativeDue(row.due_at)}
                </span>
            ),
        },
        {
            id: "priority",
            accessorKey: "priority",
            header: "Priority",
            sortable: true,
            filter: "select",
            cell: (row) =>
                row.urgent ? (
                    <span className="inline-flex items-center gap-1 text-destructive">
                        <CircleAlert className="h-3 w-3" />
                        urgent
                    </span>
                ) : (
                    <span className="text-muted-foreground">{row.priority}</span>
                ),
        },
        ...(showDelivery
            ? ([
                  {
                      id: "delivery",
                      accessorFn: (row) => row.notices?.length ?? 0,
                      header: "Notified",
                      sortable: true,
                      filter: false,
                      mobileHidden: true,
                      cell: (row) => <HrDeliveryState notices={row.notices} />,
                  },
              ] as MatrxColumnDef<HrInboxRow>[])
            : []),
    ];

    return (
        <MatrxDataTable<HrInboxRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.step_id}
            isLoading={isLoading}
            pageSize={25}
            emptyState={{ title: emptyTitle, description: emptyDescription }}
            rowActions={(row) => (
                <Button asChild size="sm" variant="ghost">
                    <Link href={row.deep_link}>Open</Link>
                </Button>
            )}
            selection={
                selectedIds && onSelectedIdsChange
                    ? {
                          selectedIds,
                          onSelectedIdsChange,
                          noun: "item",
                          actions: bulkActions,
                          // §5.2: bulk is unavailable for any flow whose definition
                          // forbids it (v1: termination, pay_change, adverse action).
                          // The control is ABSENT on those rows, not disabled-looking:
                          // a checkbox you can tick and then be refused is worse.
                          isRowSelectable: (row) => row.allow_bulk_decide === true,
                      }
                    : undefined
            }
        />
    );
}
