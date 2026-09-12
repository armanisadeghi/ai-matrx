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
import { Check, ChevronDown, Plus, RefreshCw } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
} from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
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
type PlanContext =
  | { kind: "known"; plan: Plan; limit: PlanLimit | null }
  | { kind: "no_plan" }
  | { kind: "unreadable"; reason: string };

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [addonRows, orgRows, planRows, limitRows, capRows, assignmentResult] =
        await Promise.all([
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
    () => new Map(plans.map((plan) => [plan.id, plan])),
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
          (row) => row.plan_id === plan.id && row.capability === capability,
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
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-3" variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const now = new Date();
  const liveCount = addons.filter((row) => addonIsInEffect(row, now)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium">An add-on only ever raises an allowance.</p>
          <p className="mt-1 text-muted-foreground">
            The plan grid says what every account on that plan gets. An add-on
            lifts one org above its plan for one capability — more points, more
            provider spend — for as long as it is in effect. It can never lower
            anything. A lower, self-imposed ceiling is a{" "}
            <strong>guardrail</strong>, and the org or the person sets that on
            their own settings page, not here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setGrantOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Grant an add-on
          </Button>
        </div>
      </div>

      {assignmentsError && (
        <p className="text-xs text-warning">
          Could not read which plan each org is on (
          <span className="font-mono">billing.org_plan_list</span> refused:{" "}
          {assignmentsError}). The add-on values below are real; the
          &ldquo;plan gives&rdquo; column cannot be filled in for this session.
        </p>
      )}

      {addons.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">No add-ons have been granted yet.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Every org is on exactly what its plan includes. When one account
            needs more of a single capability than its plan gives — a customer
            who paid for extra AI points, a pilot that needs more provider
            spend — grant it here and it shows up in this list with who granted
            it, why, and until when. Expired grants stay in the list, marked
            expired.
          </p>
          <Button className="mt-4" size="sm" onClick={() => setGrantOpen(true)}>
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
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Capability</TableHead>
                  <TableHead className="text-right">Add-on gives</TableHead>
                  <TableHead className="text-right">Plan gives</TableHead>
                  <TableHead className="text-right">Raises by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Until</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addons.map((row) => (
                  <AddonRow
                    key={row.id}
                    addon={row}
                    org={orgById.get(row.organization_id)}
                    capability={capabilityByName.get(row.capability)}
                    planContext={planContextFor(row.organization_id, row.capability)}
                    now={now}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
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
  );
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

function AddonRow({
  addon,
  org,
  capability,
  planContext,
  now,
}: {
  addon: AccountAddon;
  org: OrganizationOption | undefined;
  capability: Capability | undefined;
  planContext: PlanContext;
  now: Date;
}) {
  const startsLater = new Date(addon.effective_from).getTime() > now.getTime();
  const inEffect = addonIsInEffect(addon, now);
  const expired = !inEffect && !startsLater;
  const period = addon.period ?? capability?.period ?? null;
  const points = isPoints(addon.capability);
  const addonUsd = points ? pointsToUsdLabel(addon.limit_value, period) : null;

  const planLimitValue =
    planContext.kind === "known" ? planContext.limit?.limit_value : undefined;
  const planIncludes =
    planContext.kind === "known" && planContext.limit !== null;

  let raisesBy: string;
  if (planContext.kind !== "known") {
    raisesBy = "—";
  } else if (addon.limit_value === null) {
    raisesBy = "to unlimited";
  } else if (!planIncludes || planLimitValue === 0) {
    raisesBy = "from nothing";
  } else if (planLimitValue === null || planLimitValue === undefined) {
    raisesBy = "plan is already unlimited";
  } else {
    const delta = addon.limit_value - planLimitValue;
    raisesBy =
      delta > 0
        ? `+${limitToHuman(addon.capability, delta)}`
        : `no raise (${limitToHuman(addon.capability, delta)})`;
  }

  return (
    <TableRow className={cn(!inEffect && "text-muted-foreground")}>
      <TableCell>
        <div className="min-w-0">
          <EntityRef
            token="organization"
            id={addon.organization_id}
            name={org?.name ?? null}
            openInNewTab
          />
          <p className="truncate font-mono text-xs text-muted-foreground">
            {org
              ? `${org.slug}${org.is_personal ? " · personal" : ""}`
              : "not among the organizations this session can read"}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs">{addon.capability}</span>
          {capability ? (
            <EnforcementBadge enforced={capability.enforced} />
          ) : (
            <Badge variant="outline" className="text-xs">
              not in billing.capability
            </Badge>
          )}
        </div>
        {period && (
          <p className="text-xs text-muted-foreground">per {period}</p>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <p className={cn("font-medium", inEffect && "text-foreground")}>
          {limitToHuman(addon.capability, addon.limit_value)}
          {addon.limit_value !== null && !isMicroUsd(addon.capability) && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {capabilityUnitLabel(addon.capability)}
            </span>
          )}
        </p>
        {addonUsd && (
          <p className="text-xs text-muted-foreground">{addonUsd}</p>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {planContext.kind === "known" ? (
          <>
            <p>
              {planIncludes
                ? limitToHuman(addon.capability, planLimitValue ?? null)
                : "not included"}
            </p>
            <p className="text-xs text-muted-foreground">{planContext.plan.name}</p>
          </>
        ) : planContext.kind === "no_plan" ? (
          <span className="text-xs">no plan assigned</span>
        ) : (
          <span className="text-xs text-warning" title={planContext.reason}>
            unreadable
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{raisesBy}</TableCell>
      <TableCell>
        {inEffect ? (
          <Badge variant="default" className="text-xs">
            in effect
          </Badge>
        ) : startsLater ? (
          <Badge variant="outline" className="text-xs">
            starts {formatDate(addon.effective_from)}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-destructive text-xs text-destructive">
            expired
          </Badge>
        )}
        {inEffect && capability && !capability.enforced && (
          <p className="mt-1 text-xs text-warning">counted, not enforced</p>
        )}
        {expired && (
          <p className="mt-1 text-xs">no longer raises anything</p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {formatDate(addon.effective_from)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {formatDate(addon.expires_at)}
      </TableCell>
      <TableCell>
        <p className="text-xs">{addon.source}</p>
        {addon.granted_by && (
          <p
            className="max-w-[10ch] truncate font-mono text-[10px] text-muted-foreground"
            title={addon.granted_by}
          >
            by {addon.granted_by}
          </p>
        )}
      </TableCell>
      <TableCell className="max-w-[24ch]">
        <p className="truncate text-xs" title={addon.note ?? undefined}>
          {addon.note ?? <span className="text-muted-foreground">—</span>}
        </p>
      </TableCell>
    </TableRow>
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
        toast.error("The expiry is in the past — that add-on would never be in effect");
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
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
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
              {money && <span className="text-sm text-muted-foreground">$</span>}
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
          <Button onClick={() => void submit()} disabled={submitting || !orgId || !cap}>
            {submitting ? "Granting…" : "Grant add-on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
