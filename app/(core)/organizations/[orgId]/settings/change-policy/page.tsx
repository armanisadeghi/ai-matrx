"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { CrumbTrailHeader } from "@/features/shell/components/header/templates/CrumbTrailHeader";
import {
    useResolvedOrganization,
    useUserRole,
} from "@/features/organizations/hooks";
import { OrganizationAccessGate } from "@/features/organizations/components/OrganizationAccessGate";
import { ChangePolicySurface } from "@/features/change-policy/components/ChangePolicySurface";

/**
 * C-18: the change-type policy surface. Any member can SEE the policy (and
 * request changes through the access-gate flow); only owners/admins can edit
 * — the RPC enforces that server-side regardless of what renders here.
 */
export default function OrganizationChangePolicyPage() {
    const params = useParams();
    const orgId = params.orgId as string;

    const {
        organization,
        organizationId,
        loading: resolving,
        error,
        refresh,
    } = useResolvedOrganization(orgId);
    const { loading: roleLoading, canManageSettings } = useUserRole(
        organizationId ?? undefined,
    );

    if (resolving || roleLoading) {
        return (
            <div className="p-4 md:p-6 space-y-4">
                <div className="h-7 w-56 bg-muted animate-pulse rounded" />
                <div className="grid gap-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="p-4 space-y-2">
                            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                            <div className="h-3 w-64 bg-muted animate-pulse rounded" />
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (!organization || !organizationId) {
        return (
            <OrganizationAccessGate
                orgSlugOrId={orgId}
                organizationId={organizationId}
                error={error}
                onRetry={refresh}
            />
        );
    }

    return (
        <>
            <CrumbTrailHeader
                backHref={`/organizations/${orgId}/settings`}
                trail={[
                    {
                        label: organization.name ?? "Organization",
                        href: `/organizations/${orgId}`,
                    },
                    { label: "Settings", href: `/organizations/${orgId}/settings` },
                    { label: "Change policy" },
                ]}
            />
            <div className="px-4 md:px-6 pt-10 md:pt-12 max-w-4xl mx-auto pb-safe">
                <ChangePolicySurface
                    orgId={organizationId}
                    orgSlugOrId={orgId}
                    canManage={canManageSettings}
                />
            </div>
        </>
    );
}
