"use client";

/**
 * Per-member ORG-SCOPED resource inventory at
 * /organizations/[orgId]/admin/users/[userId]/resources.
 * Shows what the member owns within THIS org. Read-only: transferring another person's
 * resources is an audited action with its own door (DD-140), never a button on a list.
 */
import React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Package } from "lucide-react";
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
import type { Organization } from "../../types";
import { recordUnavailableMessage } from "@/lib/records/recordUnavailable";
import { useOrgMemberDetail } from "../hooks";

interface Props {
  orgId: string;
  organization: Organization;
  userId: string;
}

export function MemberResourcesView({ orgId, organization, userId }: Props) {
  const { member, loading, error } = useOrgMemberDetail(orgId, userId);


  if (loading && !member) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading resources…
      </div>
    );
  }
  if (error || !member) {
    return (
      <div className="p-4 md:p-6">
        <Card className="mx-auto max-w-lg border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error ?? recordUnavailableMessage("member", "unknown")}
        </Card>
      </div>
    );
  }

  const label = member.displayName || member.email || "this member";
  const total = member.resources.reduce((s, r) => s + r.count, 0);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
      <Link
        href={`/organizations/${organization.slug}/admin/users/${userId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {label}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Org-scoped resources</h1>
          <p className="text-sm text-muted-foreground">
            {total} resource{total === 1 ? "" : "s"} owned by {label} within {organization.name}.
            Personal-org resources are not shown and are never affected.
          </p>
        </div>
      </div>

      {member.resources.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
          <Package className="h-8 w-8 opacity-50" />
          <p className="text-sm">This member owns no org-scoped resources in {organization.name}.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table wrapperClassName="phone-stack">
            <TableHeader>
              <TableRow>
                <TableHead>Resource type</TableHead>
                <TableHead className="w-[180px]">Location</TableHead>
                <TableHead className="w-[90px] text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {member.resources.map((r) => (
                <TableRow key={r.resourceType}>
                  <TableCell data-phone="lead" className="font-medium text-foreground">{r.displayLabel}</TableCell>
                  <TableCell data-label="Location" data-phone="inline" className="font-mono text-xs text-muted-foreground">
                    {r.schemaName}.{r.tableName}
                  </TableCell>
                  <TableCell data-label="Count" data-phone="inline" className="text-right">
                    <Badge variant="secondary">{r.count}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

    </div>
  );
}
