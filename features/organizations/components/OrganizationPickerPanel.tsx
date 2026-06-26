"use client";

// OrganizationPickerPanel — the canonical "choose your organization" body:
// a selectable list of the user's orgs + the "Set as my default" switch.
// Rendered inside the header reminder's popover; reusable anywhere an org
// chooser is needed. Selecting an org writes the global active org via the
// sanctioned switcher (chooseActiveOrganization); the default switch persists
// the preference. Active org = Check; default org = Star badge.

import { Building2, Check, Star } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";
import { DefaultOrgSwitch } from "./DefaultOrgSwitch";

export function OrganizationPickerPanel() {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const { organizations, loading } = useUserOrganizations();
  const { isDefault } = useDefaultOrganization();

  // Selecting does NOT close the container — the user may still toggle "Set as
  // default" (the switch enables only once an org is active). Containers close
  // on outside-click / Esc.
  const select = (id: string, name: string | null) => {
    dispatch(chooseActiveOrganization({ id, name }));
  };

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
