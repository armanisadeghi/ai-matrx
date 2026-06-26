"use client";

// UserMenuOrgSection — the active-organization switcher INSIDE the user-menu
// dropdown. This is the persistent home for org selection; the header chip
// (HeaderOrgIndicator) only appears as a red nudge while no org is chosen,
// then disappears to save header space. Here the user can always see the
// current org and switch.

import { Check } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectHasExplicitOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { MenuGroup } from "./MenuGroup";
import { MENU_ITEM_CLASS } from "./menuItemClass";

export default function UserMenuOrgSection() {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const hasExplicit = useAppSelector(selectHasExplicitOrganization);
  const { organizations, loading } = useUserOrganizations();

  return (
    <MenuGroup
      id="organization"
      icon="Building2"
      label="Organization"
      defaultOpen={!hasExplicit}
      iconClassName={hasExplicit ? undefined : "[&_svg]:text-red-500"}
    >
      {loading ? (
        <div className="space-y-1 px-3 py-1">
          <div className="h-5 animate-pulse rounded-full bg-muted" />
          <div className="h-5 animate-pulse rounded-full bg-muted" />
        </div>
      ) : organizations.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          No organizations found.
        </p>
      ) : (
        organizations.map((org) => {
          const isActive = org.id === activeOrgId;
          return (
            <button
              key={org.id}
              type="button"
              onClick={() =>
                dispatch(
                  chooseActiveOrganization({ id: org.id, name: org.name }),
                )
              }
              className={MENU_ITEM_CLASS}
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {org.name}
              </span>
              {org.isPersonal && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Personal
                </span>
              )}
              {isActive && (
                <Check className="shrink-0 text-primary" strokeWidth={2.5} />
              )}
            </button>
          );
        })
      )}
    </MenuGroup>
  );
}
