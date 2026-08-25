"use client";

/**
 * The run console at the ORGANIZATION tier — every brand this organization
 * controls.
 *
 * KI-049 (Arman's ruling, 2026-08-25): the same `RunConsole` component the
 * system tier mounts at `/administration/marketing/run-console`, at a
 * different `scope`. Split into its own client component because the route
 * (`app/(core)/marketing/automations/page.tsx`) is a Server Component that
 * exports real `metadata` — a "use client" page cannot also export
 * `metadata`.
 *
 * This fulfills the `marketing.automations` Coming Soon promise — see
 * `lib/coming-soon/registry.ts` (entry removed in this change) and
 * `features/marketing/lib/marketing-nav.ts` (status dropped in this change).
 * Never re-fork this into a second console.
 */

import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { RunConsole } from "./RunConsole";

/**
 * No active organization is a real, expected state (a brand-new session, or a
 * user who only just accepted an invite) — never a crash and never an empty
 * page. Same door as `RecordUnavailableNotice`'s "Switch organization" affordance.
 */
function OrganizationRequiredNotice() {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-4 text-center">
        <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium text-foreground">
          Pick an organization to run automations
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Automations run against the brands your active organization
          controls — select one to see them.
        </p>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="mt-3 h-8">
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              Choose organization
            </Button>
          </PopoverTrigger>
          <PopoverContent align="center" className="w-64 p-1">
            <OrganizationPickerPanel />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function OrganizationRunConsoleMount() {
  const organizationId = useAppSelector(selectOrganizationId);

  if (!organizationId) return <OrganizationRequiredNotice />;
  return <RunConsole scope={{ tier: "organization", organizationId }} />;
}
