"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, Clock, EyeOff } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";

import { HrDecisionPanel } from "@/features/hr/tasks/components/HrDecisionPanel";
import { HrDeliveryState } from "@/features/hr/tasks/components/HrDeliveryState";
import { relativeDue } from "@/features/hr/tasks/urgency";
import type { HrInboxRow } from "@/features/hr/tasks/types";
import { HR_NOT_PROVIDED } from "@/features/hr/constants";
import {
  hrTaskStepEntityRef,
  hrTaskStepMenuSection,
  type HrTaskStepMenuRow,
} from "@/features/hr/tasks/task-step-actions";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";

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
    onRowDecided,
}: {
    rows: HrInboxRow[];
    isLoading?: boolean;
    selectedIds?: string[];
    onSelectedIdsChange?: (ids: string[]) => void;
    bulkActions?: (selected: HrInboxRow[], selectedIds: string[]) => React.ReactNode;
    emptyTitle: string;
    emptyDescription?: string;
    showDelivery?: boolean;
    /** Reload the queue after a decision taken in the row window. */
    onRowDecided?: () => void;
}) {
    /** Right-clicked row — STATE (not a ref) so the menu reads the row that
     *  was actually clicked. */
    const [contextRow, setContextRow] = useState<HrInboxRow | null>(null);

    function menuRowFor(row: HrInboxRow): HrTaskStepMenuRow {
        return {
            stepId: row.step_id,
            label: row.title ?? row.flow_label ?? row.flow_key,
            deepLink: row.deep_link,
        };
    }

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
                        {/* The icon marks a restricted flow. It does NOT mean the name is
                            hidden — an approver holding the decision is entitled to it
                            (T-L10-5), and the door says which case this is. */}
                        {row.sensitivity_tier === "restricted" ? (
                            <EyeOff
                                className="h-3 w-3 shrink-0"
                                aria-label={
                                    row.subject_withheld
                                        ? "Restricted — the subject is not shown to you"
                                        : "Restricted — visible to you because you hold this decision"
                                }
                            />
                        ) : null}
                        {row.subject_withheld ? (
                            <span className="shrink-0">Subject withheld</span>
                        ) : null}
                        <span className="truncate">{row.step_label ?? row.step_key}</span>
                    </div>
                    {/*
                        🚨 WHAT IT CHANGES, ON THE ROW. The queue's job is letting somebody
                        triage without opening every item, and it listed a kind and a step
                        and nothing about the thing being decided. One line, truncated —
                        the panel carries the full before/after; this only has to stop the
                        row from being a mystery.
                    */}
                    {row.change && row.change.length > 0 ? (
                        <div className="truncate text-xs text-muted-foreground">
                            {/* The SAME phrase the decision panel uses. These two
                                render the same change and said different words for
                                the same absence — and on a pay row the dash could
                                not be told apart from a withheld amount. */}
                            {row.change
                                .map(
                                    (c) =>
                                        `${c.label}: ${c.from ?? HR_NOT_PROVIDED} → ${c.to ?? HR_NOT_PROVIDED}`,
                                )
                                .join(" · ")}
                        </div>
                    ) : row.digest ? (
                        <div className="truncate text-xs text-muted-foreground">
                            {row.digest}
                        </div>
                    ) : null}
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
    ];

    // Declared as its own typed const rather than an inline literal behind a cast: an inline
    // array in a spread widens to `{...}[]`, and the cast that used to hide that would also have
    // hidden a genuinely wrong column definition.
    const deliveryColumn: MatrxColumnDef<HrInboxRow> = {
        id: "delivery",
        // §5.9 wants delivery/read state ON THE ROW. `notices` is undefined on a scope row (only
        // `needs_my_decision` rows carry evidence) — sorting treats that as 0 notices, which is
        // true, while the cell renders "No notice sent" rather than an empty space.
        accessorFn: (row) => row.notices?.length ?? 0,
        header: "Notified",
        sortable: true,
        filter: false,
        mobileHidden: true,
        // `showBody={false}` is stated, not defaulted: this is one narrow cell in a row per task,
        // so the sentence is truncated to a single line rather than allowed to grow the row.
        cell: (row) => <HrDeliveryState notices={row.notices} showBody={false} />,
    };
    if (showDelivery) columns.push(deliveryColumn);

    return (
        <NonEditableContextMenu
            sourceFeature="admin"
            contentSource={{ type: "raw" }}
            resolveContextOnOpen={(target) => {
                const id = target
                    ?.closest("[data-row-id]")
                    ?.getAttribute("data-row-id");
                const row = (id && rows.find((r) => r.step_id === id)) || null;
                setContextRow(row);
                if (!row) return null;
                return {
                    [CONTEXT_MENU_ENTITY_KEY]: hrTaskStepEntityRef(menuRowFor(row)),
                    content: [
                        row.subject_withheld
                            ? "Withheld"
                            : (row.title ?? row.flow_label ?? row.flow_key),
                        row.step_label ?? row.step_key,
                    ]
                        .filter(Boolean)
                        .join("\n"),
                };
            }}
            extraSections={
                contextRow ? [hrTaskStepMenuSection(menuRowFor(contextRow))] : []
            }
        >
        <MatrxDataTable<HrInboxRow>
            data={rows}
            columns={columns}
            getRowId={(row) => row.step_id}
            isLoading={isLoading}
            pageSize={25}
            emptyState={{ title: emptyTitle, description: emptyDescription }}
            /*
                🚨 THE WINDOW CONTROL OPENED A RAW FIELD DUMP (hr_c4_55 / D9).
                `MatrxDataTable`'s panel icon falls back to `DataRowInspector` when a table
                declares no window body — so the small window beside each HR row opened
                "Leave request — Tomo Iversen-G32" whose ENTIRE contents were `STEP_ID … /
                INSTANCE_ID … / FLOW_KEY leave_request / STEP_KEY manager_approval / DUE_AT … /
                PRIORITY normal / URGENT false / RESOLUTION_PATH authority / AUTONOMY_MODE 4`,
                with no Approve and no Reject. The neighbouring `Open` link was fine the whole
                time, which is what made this a trap: two controls, one row, and the smaller one
                silently downgraded the item to its own primary key.

                So the window hosts the DECISION SURFACE ITSELF — the same `HrDecisionPanel` the
                `Open` link renders, at the same step, with its summary, its change list, its
                delivery evidence and its real controls. Not a summary rebuilt here: a second
                implementation of the decision controls would fork the reason rules, the refusal
                rendering, the quorum counter and the never-approve-yourself guard.

                `renderEdit: false` keeps it one body with no View/Edit tabs — there is no
                separate "edit" of an approval, and the panel already owns every write.
            */
            window={{
                title: (row) => row.title ?? row.flow_label ?? row.flow_key,
                renderEdit: false,
                width: 860,
                height: 640,
                renderView: (row) => (
                    <HrDecisionPanel
                        instanceId={row.instance_id}
                        stepId={row.step_id}
                        noticeId={null}
                        failureId={null}
                        embedded
                        onDecided={onRowDecided}
                    />
                ),
            }}
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
        </NonEditableContextMenu>
    );
}
