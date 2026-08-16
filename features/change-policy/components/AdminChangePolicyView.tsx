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
import { toast } from "sonner";
import { ShieldCheck, Building2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import {
    CHANGE_HANDLING_MODE_LABELS,
    CHANGE_TYPE_CATALOGUE,
    TIER_META_BY_TIER,
    defaultTimeoutExpiryFor,
    type ChangeTypeDef,
} from "../catalogue";
import { getChangePolicyDivergence, type OrgDivergenceRow } from "../service";

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
                    <MatrxDataTable
                        data={divergence}
                        columns={divergenceColumns}
                        getRowId={(row) => row.organization_id}
                        isLoading={loading}
                        zebra
                    />
                )}
            </div>

            <div>
                <SettingsSubHeader
                    icon={ShieldCheck}
                    title="Platform defaults — the change-type catalogue"
                    description={`All ${CHANGE_TYPE_CATALOGUE.length} change types with their default handling. The catalogue is CODE (features/change-policy/catalogue.ts); edit it there and apply the generated seed — never by hand in the DB. Row 38 is floored structurally in the resolver.`}
                />
                <MatrxDataTable
                    data={[...CHANGE_TYPE_CATALOGUE]}
                    columns={catalogueColumns}
                    getRowId={(row) => row.key}
                    pageSize={50}
                    zebra
                />
            </div>
        </div>
    );
}
