// features/admin/spend/SpendWindowPanels.tsx — WHAT THE SPEND PAGE KEEPS FOR A WINDOW (lane
// DRILL-PRESETS-RETIRE, THE FLIP; PROGRESS-DRILL-FINISH decision 19).
//
// The Spend Explorer's cuts, series, findings, 80/20 line and costliest requests are the usage
// explorer's now (/administration/usage and its built-in Saved views). What stays here is what only
// this page does for a window: the batch savings and the estimated (never invoiced) cost, under the
// same window picker and address (`win`, `from`, `to`), plus one link that opens the window in the
// usage explorer.
//
// THE ORGANIZATION FILTER (lane DRILL-PARITY-LAST; the old Spend Explorer narrowed batch savings by
// a clicked organization): the page-local, URL-backed filter of the active-org law (`?org_filter=`,
// absent = All organizations, never the active organization). Its options are the organizations
// that have batch work in the window (batch.savings_summary's own by-organization rows), read when
// the menu first opens — so a platform admin can narrow to ANY organization, not only her own.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2, Check, ChevronDown } from "lucide-react";

import AppLink from "@/components/navigation/AppLink";
import { useIsMounted } from "@/hooks/use-is-mounted";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BatchSavingsPanel } from "@/features/batch-savings/BatchSavingsPanel";
import { fetchBatchSavings } from "@/features/batch-savings/service";
import { orgFilterPatch, readOrgFilter } from "@/lib/entity-list/orgFilterUrl";
import { spendAddressToUsage } from "@/features/admin/usage-drill/usageLinks";
import { ADMIN_BILLING_SPEND_SURFACE_NAME } from "@/features/surfaces/manifests/admin-billing-spend.manifest";
import { useSurfaceScopeContribution } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

import { EstimatedCostPanel } from "./explorer/EstimatedCostPanel";
import { WindowPicker } from "./explorer/WindowPicker";
import { buildBillingSpendWindowScope } from "./spend-surface-scope";
import { readExplorerUrlState, resolveWindow, WINDOW_PRESETS, writeExplorerUrlState } from "./windows";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** Mirrors the database's cap on a spend window. */
const WINDOW_DAY_CAP = 92;

export function SpendWindowPanels({ refreshKey = 0 }: { refreshKey?: number }) {
  // the default window is the browser's own day; never drawn on the server (hydration)
  const mounted = useIsMounted();
  return mounted ? <MountedSpendWindowPanels refreshKey={refreshKey} /> : null;
}

function MountedSpendWindowPanels({ refreshKey }: { refreshKey: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = readExplorerUrlState(new URLSearchParams(searchParams.toString()));
  const window = resolveWindow(urlState.preset, new Date(), urlState.fromDay, urlState.toDay);
  const windowLabel =
    urlState.preset === "custom"
      ? `${urlState.fromDay?.toLocaleDateString() ?? "?"} to ${urlState.toDay?.toLocaleDateString() ?? "?"}`
      : (WINDOW_PRESETS.find((p) => p.value === urlState.preset)?.label ?? "Selected window");
  const windowTooWide = (window.to.getTime() - window.from.getTime()) / 86_400_000 > WINDOW_DAY_CAP;
  useSurfaceScopeContribution(ADMIN_BILLING_SPEND_SURFACE_NAME, "SpendWindowPanels", () =>
    buildBillingSpendWindowScope({ urlState, window, windowLabel, windowTooWide }),
  );
  // the browser's own zone: a window the page defaulted (no `win`) is the viewer's local Yesterday
  const usage = spendAddressToUsage(
    new URLSearchParams(searchParams.toString()),
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  ).href;
  const orgId = readOrgFilter(new URLSearchParams(searchParams.toString()));
  const setOrgId = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(orgFilterPatch(next))) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    replaceAddressWithoutNavigating(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <WindowPicker
          preset={urlState.preset}
          fromDay={urlState.fromDay}
          toDay={urlState.toDay}
          onChange={(next) =>
            replaceAddressWithoutNavigating(`${pathname}?${writeExplorerUrlState(new URLSearchParams(searchParams.toString()), { ...urlState, ...next }).toString()}`)
          }
        />
        <SpendOrganizationFilter from={window.from} to={window.to} orgId={orgId} onChange={setOrgId} />
        <AppLink href={usage} className="text-sm text-primary underline-offset-2 hover:underline" data-spend-open-usage>
          Break down in AI usage
        </AppLink>
      </div>
      {windowTooWide ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive-ink">Max {WINDOW_DAY_CAP} days.</div>
      ) : (
        <>
          <BatchSavingsPanel from={window.from} to={window.to} windowLabel={windowLabel} organizationId={orgId} refreshKey={refreshKey} />
          <EstimatedCostPanel from={window.from} to={window.to} windowLabel={windowLabel} refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}

/** Org filter for the window's batch savings: All organizations, or one with batch work in it. */
function SpendOrganizationFilter({
  from,
  to,
  orgId,
  onChange,
}: {
  from: Date;
  to: Date;
  orgId: string | null;
  onChange: (orgId: string | null) => void;
}) {
  const [options, setOptions] = useState<Array<{ id: string; name: string }> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [readFor, setReadFor] = useState<string | null>(null);
  const windowKey = `${from.toISOString()}|${to.toISOString()}`;
  const load = () => {
    if (readFor === windowKey) return;
    setReadFor(windowKey);
    setFailed(null);
    fetchBatchSavings({ from, to, organizationId: null })
      .then((summary) =>
        setOptions(
          summary.byOrganization
            .filter((row) => row.key !== "(none)")
            .map((row) => ({ id: row.key, name: row.label }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch((cause: unknown) => {
        setOptions([]);
        setFailed(cause instanceof Error ? cause.message : "The organizations could not be read.");
      });
  };
  // a filter set by the address reads its organization's name once
  useEffect(() => {
    if (orgId && readFor === null) load();
  });
  const selected = orgId ? options?.find((o) => o.id === orgId) : undefined;
  const label = orgId ? `Org: ${selected?.name ?? "…"}` : "All organizations";
  return (
    <DropdownMenu onOpenChange={(open) => (open ? load() : undefined)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-spend-org-filter
          className="inline-flex h-8 max-w-[16rem] items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-foreground hover:bg-accent"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-[14rem] overflow-y-auto">
        <DropdownMenuItem data-spend-org-option="all" onSelect={() => onChange(null)}>
          <Check className={orgId ? "h-3.5 w-3.5 opacity-0" : "h-3.5 w-3.5"} aria-hidden />
          All organizations
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {options === null ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Reading organizations…</div>
        ) : failed ? (
          <div className="px-2 py-1.5 text-xs text-destructive">Organizations could not be read.<ErrorAlchemyMenu /></div>
        ) : options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No organization batched in this window.</div>
        ) : (
          options.map((o) => (
            <DropdownMenuItem key={o.id} data-spend-org-option={o.id} onSelect={() => onChange(o.id)}>
              <Check className={o.id === orgId ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-0"} aria-hidden />
              <span className="truncate">{o.name}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
