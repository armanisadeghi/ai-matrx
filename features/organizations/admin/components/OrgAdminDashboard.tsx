"use client";

/**
 * Org-admin user-management dashboard — the hub at /organizations/[orgId]/admin.
 * Overview tiles + member roster + invite + governance audit log.
 */
import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Timer,
  Coins,
  HardDrive,
  Loader2,
  ScrollText,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InvitationManager } from "../../components/InvitationManager";
import type { Organization, OrgRole } from "../../types";
import { useOrgRoster } from "../hooks";
import type { OrgAdminOverview } from "../types";
import { formatMcents } from "../utils";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { formatFileSize } from "@ai-matrx/kit/format";
import { MemberRosterTable } from "./MemberRosterTable";
import { OrgAdminAuditTable } from "./OrgAdminAuditTable";
import { AutomationCostTable } from "@/features/scheduling/components/costs/AutomationCostTable";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { orgAgentSpendPath } from "@/features/admin/agent-spend/agentSpend";

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon
          className={`h-4 w-4 ${tone === "warning" ? "text-amber-500" : "text-primary"}`}
        />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function OverviewTiles({ overview }: { overview: OrgAdminOverview }) {
  const { unit, rate: costRate } = useCostDisplay();
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile icon={Users} label="Members" value={overview.totalMembers} hint={`${overview.admins} admins`} />
      <StatTile icon={Activity} label="Active 7d" value={overview.active7d} hint={`${overview.active30d} in 30d`} />
      <StatTile
        icon={AlertTriangle}
        label="Inactive"
        value={overview.neverActive}
        hint="never active here"
        tone={overview.neverActive > 0 ? "warning" : "default"}
      />
      <StatTile
        icon={AlertTriangle}
        label="Suspended"
        value={overview.suspended}
        tone={overview.suspended > 0 ? "warning" : "default"}
      />
      <StatTile
        icon={HardDrive}
        label="Org storage"
        value={formatFileSize(overview.orgBytesUsed)}
        hint={`${overview.orgFilesCount} files`}
      />
      <StatTile
        icon={Activity}
        label="Spend 24h"
        value={formatMcents(overview.cost24hMcents, costRate, unit)}
        hint={`${overview.requests24h} requests`}
      />
    </div>
  );
}

interface Props {
  orgId: string;
  organization: Organization;
  role: OrgRole;
}

export function OrgAdminDashboard({ orgId, organization, role }: Props) {
  const { members, overview, loading, error } = useOrgRoster(orgId);
  const [showInvite, setShowInvite] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showAutomations, setShowAutomations] = useState(false);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/organizations/${organization.slug}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {organization.name}
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">User management</h1>
          <p className="text-sm text-muted-foreground">
            Manage members, usage, budgets, and access for {organization.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button icon={<Coins />} variant="outline" asChild>
            <Link href={orgAgentSpendPath(organization.slug)}>AI spend</Link>
          </Button>
          <Button icon={<CalendarClock />} variant="outline" onClick={() => setShowAutomations((s) => !s)}>
            Automations
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/organizations/${organization.slug}/admin/triggers`}>
              <Timer className="h-4 w-4" /> Triggers
            </Link>
          </Button>
          <Button icon={<ScrollText />} variant="outline" onClick={() => setShowAudit((s) => !s)}>
            Audit log
          </Button>
          <Button icon={<UserPlus />} variant="primary" onClick={() => setShowInvite((s) => !s)}>
            Invite people
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-ink">
          {error}
          <ErrorAlchemyMenu error={error} />
        </Card>
      )}

      {showAutomations && (
        <Card className="h-[32rem] p-3">
          <AutomationCostTable orgId={orgId} seat="org" orgSlug={organization.slug} />
        </Card>
      )}

      {showInvite && (
        <Card className="p-4">
          <InvitationManager
            organizationId={orgId}
            organizationName={organization.name}
            userRole={role}
          />
        </Card>
      )}

      {loading && !overview ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading members…
        </div>
      ) : (
        <>
          {overview && <OverviewTiles overview={overview} />}
          <MemberRosterTable orgSlug={organization.slug} members={members} />
        </>
      )}

      {showAudit && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Governance audit log</h2>
          <OrgAdminAuditTable orgId={orgId} />
        </Card>
      )}
    </div>
  );
}
