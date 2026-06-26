"use client";

// HeaderOrgIndicator — the active-organization control next to the user
// avatar. Part of the org-enforcement rollout: it makes the current org
// always visible and one click to switch.
//
// Soft enforcement: when no org is EXPLICITLY selected the control turns red
// to nudge the user to pick one (the personal org still rides along on API
// calls via selectEffectiveOrganizationId — see activeOrgBootstrap).

import { useState } from "react";
import { Building2, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
  selectHasExplicitOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useUserOrganizations } from "@/features/organizations/hooks";

export default function HeaderOrgIndicator() {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const hasExplicit = useAppSelector(selectHasExplicitOrganization);
  const { organizations, loading } = useUserOrganizations();

  const select = (id: string, name: string | null) => {
    dispatch(chooseActiveOrganization({ id, name }));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            hasExplicit
              ? `Organization: ${activeOrgName}`
              : "No organization selected — choose one"
          }
          title={
            hasExplicit
              ? (activeOrgName ?? "Organization")
              : "No organization selected"
          }
          className={[
            "flex max-w-[180px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            hasExplicit
              ? "border-border bg-card text-foreground hover:bg-accent"
              : "border-red-500 text-red-600 dark:text-red-400 hover:bg-red-500/10",
          ].join(" ")}
        >
          <Building2 size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="truncate">
            {hasExplicit
              ? (activeOrgName ?? "Organization")
              : "Select organization"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="end" sideOffset={8}>
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Organization
        </p>
        {loading ? (
          <div className="space-y-1 px-1 py-1">
            <div className="h-7 animate-pulse rounded-md bg-muted" />
            <div className="h-7 animate-pulse rounded-md bg-muted" />
          </div>
        ) : organizations.length === 0 ? (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            No organizations found.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {organizations.map((org) => {
              const isActive = org.id === activeOrgId;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => select(org.id, org.name)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent"
                  >
                    <Building2
                      size={15}
                      strokeWidth={1.75}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">{org.name}</span>
                    {org.isPersonal && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Personal
                      </span>
                    )}
                    {isActive && (
                      <Check
                        size={15}
                        strokeWidth={2}
                        className="shrink-0 text-primary"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
