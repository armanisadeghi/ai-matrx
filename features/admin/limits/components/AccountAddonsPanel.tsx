"use client";

// The add-ons third of Limits & Knobs — per-org grants that RAISE what a plan
// gives, and nothing else.
//
// An add-on is one direction only. `billing.account_addon` lifts an org's
// ceiling for one capability above what its plan says; it never lowers one. A
// lower, self-imposed ceiling is a GUARDRAIL and belongs to the org or the
// person on their own settings page, where they can see and undo it. Putting a
// guardrail here would make the platform the author of a customer's own
// restraint, which is the wrong actor holding the knob.
//
// Three things this surface must never do:
//   * Hide an expired row. It stays in the list and READS as expired; a grant
//     that silently vanishes is how "but you gave us 500k points" arguments
//     start.
//   * Show a number without its plan. "500,000 points" means nothing until it
//     sits next to "plan gives 320,000", so each row carries both and the
//     difference.
//   * Pretend a tracking-only capability stops anything. `enforced = false` is
//     labelled in words wherever the number appears.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { useTableUrlState } from "@ai-matrx/design-system/data-table/url-state";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_LIMITS_SURFACE_NAME,
  createAdminLimitsScope,
} from "@/features/surfaces/manifests/admin-limits.manifest";
import {
  fetchAccountAddons,
  fetchCapabilities,
  fetchOrganizationOptions,
  fetchOrgPlanAssignments,
  fetchPlanLimits,
  fetchPlans,
  grantAccountAddon,
} from "../service";
import type {
  AccountAddon,
  Capability,
  OrganizationOption,
  OrgPlanAssignment,
  Plan,
  PlanLimit,
} from "../types";
import {
  addonIsInEffect,
  capabilityUnitLabel,
  isMicroUsd,
  isPoints,
  limitToHuman,
  limitToStored,
  pointsToUsdLabel,
} from "../types";
import { EnforcementBadge } from "./PlanAllowancesPanel";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? dateFmt.format(time) : iso;
}

/** What the plan's row says for this org + capability, or why we cannot say. */
export type PlanContext =
  | { kind: "known"; plan: Plan; limit: PlanLimit | null }
  | { kind: "no_plan" }
  | { kind: "unreadable"; reason: string };

type AddonTableRow = {
  addon: AccountAddon;
  org?: OrganizationOption;
  capabilityDef?: Capability;
  planContext: PlanContext;
  status: "in_effect" | "starts_later" | "expired";
  addonAllowanceState: "numeric" | "unlimited";
  planAllowanceState:
    | "numeric"
    | "unlimited"
    | "not_included"
    | "no_plan"
    | "unreadable";
  raiseState:
    | "positive"
    | "to_unlimited"
    | "from_nothing"
    | "already_unlimited"
    | "no_raise"
    | "no_plan"
    | "unreadable";
  raiseAmount: number | null;
  raiseLabel: string;
  now: Date;
};

function planAllowanceState(
  planContext: PlanContext,
): AddonTableRow["planAllowanceState"] {
  if (planContext.kind === "no_plan") return "no_plan";
  if (planContext.kind === "unreadable") return "unreadable";
  if (planContext.limit === null) return "not_included";
  return planContext.limit.limit_value === null ? "unlimited" : "numeric";
}

export function createAddonTableRow(
  addon: AccountAddon,
  org: OrganizationOption | undefined,
  capabilityDef: Capability | undefined,
  planContext: PlanContext,
  now: Date,
): AddonTableRow {
  const startsLater = new Date(addon.effective_from).getTime() > now.getTime();
  const inEffect = addonIsInEffect(addon, now);
  const allowanceState = planAllowanceState(planContext);
  const planLimit =
    planContext.kind === "known" ? planContext.limit?.limit_value : undefined;
  let raiseState: AddonTableRow["raiseState"];
  let raiseAmount: number | null = null;
  let raiseLabel: string;

  if (planContext.kind === "no_plan") {
    raiseState = "no_plan";
    raiseLabel = "no plan assigned";
  } else if (planContext.kind === "unreadable") {
    raiseState = "unreadable";
    raiseLabel = "unreadable";
  } else if (addon.limit_value === null) {
    raiseState = "to_unlimited";
    raiseLabel = "to unlimited";
  } else if (allowanceState === "not_included" || planLimit === 0) {
    raiseState = "from_nothing";
    raiseAmount = addon.limit_value;
    raiseLabel = "from nothing (+" + limitToHuman(addon.capability, addon.limit_value) + ")";
  } else if (allowanceState === "unlimited" || planLimit === null) {
    raiseState = "already_unlimited";
    raiseLabel = "plan is already unlimited";
  } else {
    const delta = addon.limit_value - (planLimit ?? 0);
    raiseAmount = delta;
    raiseState = delta > 0 ? "positive" : "no_raise";
    raiseLabel =
      delta > 0
        ? "+" + limitToHuman(addon.capability, delta)
        : "no raise (" + limitToHuman(addon.capability, delta) + ")";
  }

  if (startsLater) {
    raiseLabel = "not effective yet (" + raiseLabel + ")";
  } else if (!inEffect) {
    raiseLabel = "no longer raises anything (" + raiseLabel + ")";
  }

  return {
    addon,
    org,
    capabilityDef,
    planContext,
    status: inEffect ? "in_effect" : startsLater ? "starts_later" : "expired",
    addonAllowanceState: addon.limit_value === null ? "unlimited" : "numeric",
    planAllowanceState: allowanceState,
    raiseState,
    raiseAmount,
    raiseLabel,
    now,
  };
}

function sameAddonIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

const addonColumns: MatrxColumnDef<AddonTableRow>[] = [
  {
    id: "organization",
    header: "Organization",
    accessorFn: (row) => row.org?.name ?? row.addon.organization_id,
    cell: (row) => (
      <div>
        <EntityRef
          token="organization"
          id={row.addon.organization_id}
          name={row.org?.name ?? null}
          openInNewTab
        />
      </div>
    ),
    frozen: true,
    width: 240,
  },
  {
    id: "organization_slug",
    header: "Organization slug",
    accessorFn: (row) => row.org?.slug ?? "",
  },
  {
    id: "personal_organization",
    header: "Personal organization",
    accessorFn: (row) =>
      row.org ? (row.org.is_personal ? "personal" : "shared") : "unknown",
    filter: "select",
    filterOptions: [
      { value: "personal", label: "Personal" },
      { value: "shared", label: "Shared" },
      { value: "unknown", label: "Unknown" },
    ],
  },
  {
    id: "organization_readability",
    header: "Organization access",
    accessorFn: (row) => (row.org ? "readable" : "not_readable"),
    filter: "select",
    filterOptions: [
      { value: "readable", label: "Readable" },
      { value: "not_readable", label: "Not readable" },
    ],
  },
  {
    id: "capability",
    header: "Capability",
    accessorFn: (row) => row.addon.capability,
    cell: (row) => (
      <div>
        <span className="font-mono text-xs">{row.addon.capability}</span>
        {!row.capabilityDef && (
          <Badge variant="outline" className="ml-1 text-xs">
            not in billing.capability
          </Badge>
        )}
      </div>
    ),
  },
  {
    id: "period",
    header: "Period",
    accessorFn: (row) => row.addon.period ?? row.capabilityDef?.period ?? "",
    hidden: true,
  },
  {
    id: "enforcement",
    header: "Enforcement",
    accessorFn: (row) =>
      row.capabilityDef
        ? row.capabilityDef.enforced
          ? "enforced"
          : "tracked"
        : "unknown",
    filter: "select",
    filterOptions: [
      { value: "enforced", label: "Enforced" },
      { value: "tracked", label: "Tracked, not enforced" },
      { value: "unknown", label: "Unknown" },
    ],
    cell: (row) =>
      row.capabilityDef ? (
        <EnforcementBadge enforced={row.capabilityDef.enforced} />
      ) : (
        "unknown"
      ),
  },
  {
    id: "addon_value",
    header: "Add-on gives",
    accessorFn: (row) => row.addon.limit_value,
    filter: "number",
    cell: (row) => (
      <div className="text-right">
        <p>
          {limitToHuman(row.addon.capability, row.addon.limit_value)}
          {row.addon.limit_value !== null &&
            !isMicroUsd(row.addon.capability) && (
              <span className="ml-1 text-xs text-muted-foreground">
                {capabilityUnitLabel(row.addon.capability)}
              </span>
            )}
        </p>
        {isPoints(row.addon.capability) && (
          <p className="text-xs text-muted-foreground">
            {pointsToUsdLabel(row.addon.limit_value, row.addon.period)}
          </p>
        )}
      </div>
    ),
    align: "right",
  },
  {
    id: "addon_allowance_state",
    header: "Add-on allowance",
    accessorKey: "addonAllowanceState",
    filter: "select",
    filterOptions: [
      { value: "numeric", label: "Numeric" },
      { value: "unlimited", label: "Unlimited" },
    ],
    hidden: true,
  },
  {
    id: "plan_gives",
    header: "Plan gives",
    accessorFn: (row) =>
      row.planAllowanceState === "numeric" && row.planContext.kind === "known"
        ? row.planContext.limit?.limit_value
        : undefined,
    filter: "number",
    cell: (row) => {
      if (
        row.planAllowanceState === "numeric" &&
        row.planContext.kind === "known"
      ) {
        const value = row.planContext.limit?.limit_value ?? 0;
        return (
          <>
            {limitToHuman(row.addon.capability, value)}
            {!isMicroUsd(row.addon.capability) && (
              <span className="ml-1 text-xs text-muted-foreground">
                {capabilityUnitLabel(row.addon.capability)}
              </span>
            )}
          </>
        );
      }
      return row.planAllowanceState === "unlimited"
        ? "unlimited"
        : row.planAllowanceState === "not_included"
          ? "not included"
          : row.planAllowanceState === "no_plan"
            ? "no plan assigned"
            : "unreadable";
    },
    mobileHidden: true,
  },
  {
    id: "plan_allowance_state",
    header: "Plan allowance",
    accessorKey: "planAllowanceState",
    filter: "select",
    filterOptions: [
      { value: "numeric", label: "Numeric" },
      { value: "unlimited", label: "Unlimited" },
      { value: "not_included", label: "Not included" },
      { value: "no_plan", label: "No plan" },
      { value: "unreadable", label: "Unreadable" },
    ],
    hidden: true,
  },
  {
    id: "plan_name",
    header: "Plan",
    accessorFn: (row) =>
      row.planContext.kind === "known" ? row.planContext.plan.name : "",
  },
  {
    id: "raises_by",
    header: "Raises by",
    accessorFn: (row) => row.raiseAmount,
    filter: "number",
    cell: (row) => row.raiseLabel,
    align: "right",
  },
  {
    id: "raise_state",
    header: "Raise state",
    accessorKey: "raiseState",
    filter: "select",
    filterOptions: [
      { value: "positive", label: "Positive" },
      { value: "to_unlimited", label: "To unlimited" },
      { value: "from_nothing", label: "From nothing" },
      { value: "already_unlimited", label: "Already unlimited" },
      { value: "no_raise", label: "No raise" },
      { value: "no_plan", label: "No plan" },
      { value: "unreadable", label: "Unreadable" },
    ],
    hidden: true,
  },
  {
    id: "status",
    header: "Status",
    accessorKey: "status",
    filter: "select",
    filterOptions: [
      { value: "in_effect", label: "In effect" },
      { value: "starts_later", label: "Starts later" },
      { value: "expired", label: "Expired" },
    ],
    cell: (row) => (
      <Badge
        variant={row.status === "in_effect" ? "default" : "outline"}
        className={
          row.status === "expired" ? "border-destructive text-destructive" : ""
        }
      >
        {row.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    id: "effective_from",
    header: "From",
    accessorFn: (row) => row.addon.effective_from,
    cell: (row) => formatDate(row.addon.effective_from),
    filter: "date",
    mobileHidden: true,
  },
  {
    id: "expires_at",
    header: "Until",
    accessorFn: (row) => row.addon.expires_at,
    cell: (row) => formatDate(row.addon.expires_at),
    filter: "date",
    mobileHidden: true,
  },
  {
    id: "source",
    header: "Source",
    accessorFn: (row) => row.addon.source,
    cell: (row) => (
      <div>
        <p>{row.addon.source}</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {row.addon.granted_by ? `by ${row.addon.granted_by}` : ""}
        </p>
      </div>
    ),
    mobileHidden: true,
  },
  {
    id: "note",
    header: "Note",
    accessorFn: (row) => row.addon.note ?? "",
    cell: (row) => (
      <span title={row.addon.note ?? undefined}>{row.addon.note ?? "—"}</span>
    ),
    mobileHidden: true,
  },
];

export function AccountAddonsPanel() {
  const [addons, setAddons] = useState<AccountAddon[]>([]);
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planLimits, setPlanLimits] = useState<PlanLimit[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [assignments, setAssignments] = useState<OrgPlanAssignment[]>([]);
  // `org_plan_list` is super-admin only. A refusal there must not take the
  // whole tab down — the list still renders, with the plan column saying why
  // it cannot be filled in.
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [processedAddonIds, setProcessedAddonIds] = useState<string[]>([]);
  const addonsTable = useTableUrlState({
    tableId: "account-addons",
    defaultPageSize: 25,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        addonRows,
        orgRows,
        planRows,
        limitRows,
        capRows,
        assignmentResult,
      ] = await Promise.all([
        fetchAccountAddons(),
        fetchOrganizationOptions(),
        fetchPlans(),
        fetchPlanLimits(),
        fetchCapabilities(),
        fetchOrgPlanAssignments().then(
          (rows) => ({ rows, error: null as string | null }),
          (err: unknown) => ({
            rows: [] as OrgPlanAssignment[],
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      ]);
      setAddons(addonRows);
      setOrgs(orgRows);
      setPlans(planRows);
      setPlanLimits(limitRows);
      setCapabilities(capRows);
      setAssignments(assignmentResult.rows);
      setAssignmentsError(assignmentResult.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred a tick so the first read is not a synchronous setState inside
  // the effect body (the house pattern — see TaxonomyAdminClient).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const orgById = useMemo(
    () => new Map(orgs.map((org) => [org.id, org])),
    [orgs],
  );
  const planById = useMemo(
    // Keyed by the plan SLUG — `org_plan.plan_id` and `plan_limit.plan_id` both hold it
    // (DD-173 moved that value off `billing.plan.id` to `plan_key`; the uuid keys nothing here).
    () => new Map(plans.map((plan) => [plan.plan_key, plan])),
    [plans],
  );
  const capabilityByName = useMemo(
    () => new Map(capabilities.map((cap) => [cap.capability, cap])),
    [capabilities],
  );
  const assignmentByOrg = useMemo(
    () => new Map(assignments.map((row) => [row.organization_id, row])),
    [assignments],
  );

  const planContextFor = useCallback(
    (organizationId: string, capability: string): PlanContext => {
      if (assignmentsError) {
        return { kind: "unreadable", reason: assignmentsError };
      }
      const assignment = assignmentByOrg.get(organizationId);
      const plan = assignment?.plan_id
        ? planById.get(assignment.plan_id)
        : undefined;
      if (!plan) return { kind: "no_plan" };
      const limit =
        planLimits.find(
          (row) =>
            row.plan_id === plan.plan_key && row.capability === capability,
        ) ?? null;
      return { kind: "known", plan, limit };
    },
    [assignmentsError, assignmentByOrg, planById, planLimits],
  );

  /** Only capabilities the platform actually meters can be granted. */
  const grantableCapabilities = useMemo(
    () =>
      capabilities.filter((cap) =>
        planLimits.some((row) => row.capability === cap.capability),
      ),
    [capabilities, planLimits],
  );

  // A table view is derived data. Keep its source identity stable so receiving
  // the same view cannot feed a fresh array back into the table on every render.
  const now = useMemo(() => new Date(), [addons]);
  const addonRows = useMemo(
    () =>
      addons.map((addon) =>
        createAddonTableRow(
          addon,
          orgById.get(addon.organization_id),
          capabilityByName.get(addon.capability),
          planContextFor(addon.organization_id, addon.capability),
          now,
        ),
      ),
    [addons, capabilityByName, now, orgById, planContextFor],
  );
  const processedAddonRows = useMemo(() => {
    const rowsById = new Map(
      addonRows.map((row) => [row.addon.id, row] as const),
    );
    return processedAddonIds.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [row] : [];
    });
  }, [addonRows, processedAddonIds]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const liveCount = addonRows.filter(
    (row) => row.status === "in_effect",
  ).length;

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_LIMITS_SURFACE_NAME}
      getScope={() =>
        createAdminLimitsScope({
          addons_loaded: addonRows,
          addons_loaded_count: addonRows.length,
          processed_addons: processedAddonRows,
          processed_addons_count: processedAddonRows.length,
          addons_table_query: addonsTable.state,
        })
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium">
              An add-on only ever raises an allowance.
            </p>
            <p className="mt-1 text-muted-foreground">
              The plan grid says what every account on that plan gets. An add-on
              lifts one org above its plan for one capability — more points,
              more provider spend — for as long as it is in effect. It can never
              lower anything. A lower, self-imposed ceiling is a{" "}
              <strong>guardrail</strong>, and the org or the person sets that on
              their own settings page, not here.
            </p>
          </div>
        </div>

        {assignmentsError && (
          <p className="text-xs text-warning">
            Could not read which plan each org is on (
            <span className="font-mono">billing.org_plan_list</span> refused:{" "}
            {assignmentsError}). The add-on values below are real; the
            &ldquo;plan gives&rdquo; column cannot be filled in for this
            session.
            <ErrorAlchemyMenu error={assignmentsError} />
          </p>
        )}

        {addons.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium">
              No add-ons have been granted yet.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Every org is on exactly what its plan includes. When one account
              needs more of a single capability than its plan gives — a customer
              who paid for extra AI points, a pilot that needs more provider
              spend — grant it here and it shows up in this list with who
              granted it, why, and until when. Expired grants stay in the list,
              marked expired.
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => setGrantOpen(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Grant the first add-on
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {addons.length} {addons.length === 1 ? "add-on" : "add-ons"},{" "}
              {liveCount} in effect right now.
            </p>
            <MatrxDataTable<AddonTableRow>
              data={addonRows}
              columns={addonColumns}
              getRowId={(row) => row.addon.id}
              tableId="administration/limits/addons"
              pageSize={25}
              query={{
                mode: "controlled-local",
                state: addonsTable.state,
                onStateChange: addonsTable.onStateChange,
              }}
              toolbar={{
                title: "Account add-ons",
                search: true,
                refresh: { onRefresh: load },
                add: { onAdd: () => setGrantOpen(true) },
              }}
              onViewChange={(rows) => {
                const nextIds = rows.map((row) => row.addon.id);
                setProcessedAddonIds((currentIds) =>
                  sameAddonIds(currentIds, nextIds) ? currentIds : nextIds,
                );
              }}
              coverage={{
                noun: "account add-on",
                total: addonRows.length,
                answeredBy: "client",
              }}
            />
          </div>
        )}

        <GrantAddonDialog
          open={grantOpen}
          onOpenChange={setGrantOpen}
          orgs={orgs}
          capabilities={grantableCapabilities}
          planContextFor={planContextFor}
          onGranted={load}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------
// The grant form
// ---------------------------------------------------------------------------

function GrantAddonDialog({
  open,
  onOpenChange,
  orgs,
  capabilities,
  planContextFor,
  onGranted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgs: OrganizationOption[];
  capabilities: Capability[];
  planContextFor: (organizationId: string, capability: string) => PlanContext;
  onGranted: () => Promise<void>;
}) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [capability, setCapability] = useState<string>("");
  const [limitRaw, setLimitRaw] = useState("");
  const [note, setNote] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const org = orgId ? orgs.find((row) => row.id === orgId) : undefined;
  const cap = capabilities.find((row) => row.capability === capability);
  const period = cap?.period ?? "lifetime";
  const money = cap ? isMicroUsd(cap.capability) : false;
  const points = cap ? isPoints(cap.capability) : false;
  const draftUsd = points ? pointsToUsdLabel(limitRaw, period) : null;
  const planContext =
    orgId && capability ? planContextFor(orgId, capability) : null;

  const reset = () => {
    setOrgId(null);
    setCapability("");
    setLimitRaw("");
    setNote("");
    setExpiresAt("");
  };

  const submit = async () => {
    if (!orgId || !cap) {
      toast.error("Pick an organization and a capability first");
      return;
    }
    const stored = limitToStored(cap.capability, limitRaw);
    if (stored === undefined) {
      toast.error(
        `Enter a number of ${capabilityUnitLabel(cap.capability)}, or leave it blank for unlimited`,
      );
      return;
    }
    let expiresIso: string | null = null;
    if (expiresAt.trim() !== "") {
      const parsed = new Date(expiresAt);
      if (!Number.isFinite(parsed.getTime())) {
        toast.error("The expiry date is not a date");
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        toast.error(
          "The expiry is in the past — that add-on would never be in effect",
        );
        return;
      }
      expiresIso = parsed.toISOString();
    }
    setSubmitting(true);
    try {
      await grantAccountAddon({
        organizationId: orgId,
        capability: cap.capability,
        period,
        limitValue: stored,
        note: note.trim() === "" ? null : note.trim(),
        expiresAt: expiresIso,
      });
      toast.success(
        `Granted ${org?.name ?? "the organization"} ${
          stored === null ? "unlimited" : limitToHuman(cap.capability, stored)
        } ${cap.capability}`,
      );
      reset();
      onOpenChange(false);
      await onGranted();
    } catch (err) {
      // The RPC is super-admin only and says so itself. That sentence is the
      // useful one — it is never replaced with a polite "something went wrong".
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant an add-on</DialogTitle>
          <DialogDescription>
            Raise one organization&apos;s allowance for one capability above
            what its plan gives. This never lowers anything. Requires
            super-admin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Popover open={orgPickerOpen} onOpenChange={setOrgPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between font-normal"
                >
                  {org ? (
                    <span className="truncate">
                      {org.name}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {org.slug}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Search {orgs.length} organizations…
                    </span>
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                sizing="content"
                className="p-0"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Name or slug…" />
                  <CommandList className="max-h-64">
                    <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                      No organization matches.
                    </CommandEmpty>
                    <CommandGroup>
                      {orgs.map((row) => (
                        <CommandItem
                          key={row.id}
                          value={`${row.name} ${row.slug}`}
                          onSelect={() => {
                            setOrgId(row.id);
                            setOrgPickerOpen(false);
                          }}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              row.id === orgId ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{row.name}</span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {row.slug}
                          </span>
                          {row.is_personal && (
                            <Badge
                              variant="secondary"
                              className="ml-auto shrink-0 px-1 py-0 text-[10px]"
                            >
                              personal
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Capability</Label>
            <Select value={capability} onValueChange={setCapability}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a metered capability" />
              </SelectTrigger>
              <SelectContent>
                {capabilities.map((row) => (
                  <SelectItem key={row.capability} value={row.capability}>
                    <span className="font-mono text-xs">{row.capability}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      per {row.period ?? "lifetime"}
                      {row.enforced ? "" : " · tracking only"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cap && !cap.enforced && (
              <p className="text-xs text-warning">
                Tracking only — this capability is counted but does not stop
                anything yet, so the grant changes a report, not a gate.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="addon-limit">
              Limit
              {cap && (
                <span className="ml-1 font-normal text-muted-foreground">
                  in {capabilityUnitLabel(cap.capability)}, per {period}
                </span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              {money && (
                <span className="text-sm text-muted-foreground">$</span>
              )}
              <Input
                id="addon-limit"
                placeholder="blank = unlimited"
                inputMode="decimal"
                value={limitRaw}
                onChange={(event) => setLimitRaw(event.target.value)}
                disabled={!cap}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {limitRaw.trim() === ""
                ? "Blank means unlimited — the org gets no ceiling on this capability while the add-on is in effect."
                : points
                  ? (draftUsd ?? "Not a number.")
                  : money
                    ? "Entered in US dollars; stored to the micro-dollar."
                    : "Whole units."}
            </p>
            {planContext?.kind === "known" && (
              <p className="text-xs text-muted-foreground">
                Plan {planContext.plan.name} gives{" "}
                {planContext.limit
                  ? limitToHuman(capability, planContext.limit.limit_value)
                  : "nothing"}{" "}
                for this capability
                {planContext.limit &&
                planContext.limit.limit_value !== null &&
                limitToStored(capability, limitRaw) !== undefined &&
                limitToStored(capability, limitRaw) !== null &&
                (limitToStored(capability, limitRaw) as number) <=
                  planContext.limit.limit_value
                  ? " — this value would not raise anything"
                  : ""}
                .
              </p>
            )}
            {planContext?.kind === "no_plan" && (
              <p className="text-xs text-warning">
                This org has no plan assigned, so the add-on is the whole
                allowance.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="addon-expires">Expires</Label>
              <Input
                id="addon-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Blank = never expires.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="addon-note">Note</Label>
              <Input
                id="addon-note"
                placeholder="Why this org gets more"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={submitting || !orgId || !cap}
          >
            {submitting ? "Granting…" : "Grant add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
