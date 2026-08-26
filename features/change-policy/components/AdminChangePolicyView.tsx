"use client";

/**
 * Admin twin of the change-policy surface (C-18): a READ view of the platform
 * defaults (the code catalogue, which the DB mirrors) plus per-org divergence
 * counts — each org row a door to that org's own change-policy page.
 *
 * Platform defaults are edited in CODE (features/change-policy/catalogue.ts →
 * generated seed), never from this page; that is deliberate — the row list is
 * reviewed and versioned, org choices are data.
 */

import * as React from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { ShieldCheck, Building2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
    CONTEXT_MENU_ENTITY_KEY,
    type ContextMenuExtraItem,
} from "@/features/context-menu-v3/types";
import {
    CHANGE_HANDLING_MODE_LABELS,
    CHANGE_TYPE_CATALOGUE,
    TIER_META_BY_TIER,
    defaultTimeoutExpiryFor,
    type ChangeTypeDef,
} from "../catalogue";
import { getChangePolicyDivergence, type OrgDivergenceRow } from "../service";

function divergenceRowHref(row: OrgDivergenceRow): string {
    return `/organizations/${row.organization_slug ?? row.organization_id}/settings/change-policy`;
}

function divergenceRowContent(row: OrgDivergenceRow): string {
    return [
        row.organization_name ?? row.organization_id,
        `Overridden rows: ${row.override_count}`,
        `Last change: ${row.last_updated ? new Date(row.last_updated).toLocaleString() : "—"}`,
    ].join("\n");
}

function catalogueRowContent(row: ChangeTypeDef): string {
    return [
        `${row.label} (${row.key})`,
        `Tier ${row.tier} — ${TIER_META_BY_TIER.get(row.tier)?.title ?? ""}`,
        `Platform default: ${CHANGE_HANDLING_MODE_LABELS[row.defaultMode]}`,
        `Window lapses: ${defaultTimeoutExpiryFor(row) === "proceed" ? "Proceeds" : "Holds"}`,
        row.floorHumanOnly ? "Floor: Human only" : "",
        row.description,
    ]
        .filter(Boolean)
        .join("\n");
}

const catalogueColumns: MatrxColumnDef<ChangeTypeDef>[] = [
    {
        header: "#",
        accessorKey: "rowNum",
        width: "3rem",
        filter: false,
    },
    {
        header: "Change type",
        accessorKey: "label",
        cell: (row) => (
            <div className="min-w-[16rem]">
                <div className="font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{row.description}</div>
            </div>
        ),
    },
    {
        header: "Tier",
        id: "tier",
        accessorFn: (row) => `${row.tier} — ${TIER_META_BY_TIER.get(row.tier)?.title ?? ""}`,
        filter: "select",
    },
    {
        header: "Platform default",
        id: "default_mode",
        accessorFn: (row) => CHANGE_HANDLING_MODE_LABELS[row.defaultMode],
        filter: "select",
    },
    {
        header: "Window lapses",
        id: "window_lapses",
        accessorFn: (row) => (defaultTimeoutExpiryFor(row) === "proceed" ? "Proceeds" : "Holds"),
        filter: "select",
    },
    {
        header: "Floor",
        id: "floor",
        accessorFn: (row) => (row.floorHumanOnly ? "Human only" : ""),
        filter: "select",
    },
];

export function AdminChangePolicyView() {
    const [divergence, setDivergence] = React.useState<OrgDivergenceRow[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [clickedOrgRow, setClickedOrgRow] = React.useState<OrgDivergenceRow | null>(null);
    const [clickedCatalogueRow, setClickedCatalogueRow] = React.useState<ChangeTypeDef | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const rows = await getChangePolicyDivergence();
                if (!cancelled) setDivergence(rows);
            } catch (err) {
                if (!cancelled) toast.error(err instanceof Error ? err.message : "Failed to load divergence");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const divergenceColumns: MatrxColumnDef<OrgDivergenceRow>[] = [
        {
            header: "Organization",
            id: "organization",
            accessorFn: (row) => row.organization_name ?? row.organization_id,
            cell: (row) => (
                <Link
                    href={`/organizations/${row.organization_slug ?? row.organization_id}/settings/change-policy`}
                    className="font-medium underline underline-offset-2 text-primary"
                >
                    {row.organization_name ?? row.organization_id}
                </Link>
            ),
        },
        { header: "Overridden rows", accessorKey: "override_count", filter: "number" },
        {
            header: "Last change",
            id: "last_change",
            accessorFn: (row) => (row.last_updated ? new Date(row.last_updated).toLocaleString() : "—"),
            filter: false,
        },
    ];

    return (
        <div className="p-4 md:p-6 space-y-8 max-w-6xl mx-auto pb-safe">
            <div>
                <SettingsSubHeader
                    icon={Building2}
                    title="Organizations that diverged"
                    description="Every organization with at least one change-type override. Each row opens that organization's own change-policy page."
                />
                {!loading && divergence.length === 0 ? (
                    <SettingsCallout tone="info" title="No divergence">
                        Every organization currently follows the platform defaults for all change types.
                    </SettingsCallout>
                ) : (
                    <NonEditableContextMenu
                        sourceFeature="admin"
                        contentSource={{ type: "raw" }}
                        contextData={{ content: "" }}
                        resolveContextOnOpen={(element) => {
                            const id = element?.closest("[data-row-id]")?.getAttribute("data-row-id");
                            const row = id ? divergence.find((r) => r.organization_id === id) : undefined;
                            setClickedOrgRow(row ?? null);
                            if (!row) return null;
                            return {
                                content: divergenceRowContent(row),
                                // Real registered entity (`organization`, iam.organizations) —
                                // lights up Attach To / Share for the clicked org row.
                                [CONTEXT_MENU_ENTITY_KEY]: {
                                    type: "organization",
                                    id: row.organization_id,
                                    title: row.organization_name ?? row.organization_id,
                                },
                            };
                        }}
                        extraSections={[
                            {
                                id: "change-policy-org-row",
                                label: "This organization",
                                anchor: "after-compare",
                                items: [
                                    {
                                        kind: "link",
                                        id: "change-policy-open-org",
                                        label: "Open organization's change policy",
                                        icon: Building2,
                                        href: clickedOrgRow ? divergenceRowHref(clickedOrgRow) : "#",
                                        disabled: !clickedOrgRow,
                                    },
                                ] satisfies ContextMenuExtraItem[],
                            },
                        ]}
                    >
                        <MatrxDataTable
                            data={divergence}
                            columns={divergenceColumns}
                            getRowId={(row) => row.organization_id}
                            isLoading={loading}
                            zebra
                        />
                    </NonEditableContextMenu>
                )}
            </div>

            <div>
                <SettingsSubHeader
                    icon={ShieldCheck}
                    title="Platform defaults — the change-type catalogue"
                    description={`All ${CHANGE_TYPE_CATALOGUE.length} change types with their default handling. The catalogue is CODE (features/change-policy/catalogue.ts); edit it there and apply the generated seed — never by hand in the DB. Row 38 is floored structurally in the resolver.`}
                />
                {/* No entity here: a catalogue row is a CODE constant
                    (features/change-policy/catalogue.ts), not a DB record —
                    there is no EntityTypeToken for it, so Copy/AI act on the
                    raw content only. No surfaceName either: no surface
                    manifest is registered for /administration change-policy
                    today (authoring one is surface-authoring work). */}
                <NonEditableContextMenu
                    sourceFeature="admin"
                    contentSource={{ type: "raw" }}
                    contextData={{ content: "" }}
                    resolveContextOnOpen={(element) => {
                        const id = element?.closest("[data-row-id]")?.getAttribute("data-row-id");
                        const row = id ? CHANGE_TYPE_CATALOGUE.find((r) => r.key === id) : undefined;
                        setClickedCatalogueRow(row ?? null);
                        if (!row) return null;
                        return { content: catalogueRowContent(row) };
                    }}
                    extraSections={[
                        {
                            id: "change-policy-catalogue-row",
                            label: "This change type",
                            anchor: "after-compare",
                            items: [
                                {
                                    kind: "item",
                                    id: "change-policy-copy-key",
                                    label: "Copy change-type key",
                                    icon: ShieldCheck,
                                    disabled: !clickedCatalogueRow,
                                    onSelect: () => {
                                        if (!clickedCatalogueRow) return;
                                        void navigator.clipboard
                                            .writeText(clickedCatalogueRow.key)
                                            .then(() => toast.success("Key copied"))
                                            .catch(() => toast.error("Could not copy to the clipboard"));
                                    },
                                },
                            ] satisfies ContextMenuExtraItem[],
                        },
                    ]}
                >
                    <MatrxDataTable
                        data={[...CHANGE_TYPE_CATALOGUE]}
                        columns={catalogueColumns}
                        getRowId={(row) => row.key}
                        pageSize={50}
                        zebra
                    />
                </NonEditableContextMenu>
            </div>
        </div>
    );
}
