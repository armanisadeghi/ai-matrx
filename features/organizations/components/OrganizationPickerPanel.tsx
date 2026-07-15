"use client";

// OrganizationPickerPanel — the canonical "choose your organization" body:
// a selectable list of the user's orgs + the "Set as my default" switch.
// Rendered inside the header reminder's popover; reusable anywhere an org
// chooser is needed. Selecting an org writes the global active org via the
// sanctioned switcher (chooseActiveOrganization); the default switch persists
// the preference. Active org = Check; default org = Star badge.

import { Building2, Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { DefaultOrgSwitch } from "./DefaultOrgSwitch";

export function OrganizationPickerPanel() {
  const {
    activeOrgId,
    organizations,
    loading,
    loadFailed,
    isDefault,
    selectOrganization,
  } = useActiveOrganizationPicker();

  return (
    <div className="flex flex-col">
      <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Organization
      </p>

      {loading ? (
        <div className="space-y-1 px-1 py-1">
          <div className="h-7 animate-pulse rounded-md bg-muted" />
          <div className="h-7 animate-pulse rounded-md bg-muted" />
        </div>
      ) : loadFailed ? (
        <p className="px-2 py-2 text-xs text-destructive">
          Could not load organizations.
        </p>
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
                  aria-pressed={isActive}
                  onClick={() => selectOrganization(org.id, org.name)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent",
                    isActive && "bg-primary/10 font-medium text-primary",
                  )}
                >
                  <Building2
                    size={15}
                    strokeWidth={1.75}
                    className={cn(
                      "shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  {org.is_personal && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Personal
                    </span>
                  )}
                  {isDefault(org.id) && (
                    <Star
                      size={13}
                      strokeWidth={2}
                      className="shrink-0 fill-amber-400 text-amber-400"
                      aria-label="Default organization"
                    />
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

      <div className="my-1 border-t border-border" />
      <DefaultOrgSwitch />
    </div>
  );
}
