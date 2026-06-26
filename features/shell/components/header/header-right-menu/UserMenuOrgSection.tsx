"use client";

// UserMenuOrgSection — the active-organization switcher INSIDE the user-menu
// dropdown. The persistent home for org selection: the user can always see the
// current org, switch it, and pin a default. The drop-down HeaderOrgReminder
// only appears as a one-time nudge while no org is chosen; this section is
// always available. Default management uses the same canonical pieces as the
// reminder popover (useDefaultOrganization + DefaultOrgSwitch).

import { Check, Star } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectShouldPromptForOrganization,
} from "@/lib/redux/slices/appContextSlice";
import { chooseActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";
import { DefaultOrgSwitch } from "@/features/organizations/components/DefaultOrgSwitch";
import { MenuGroup } from "./MenuGroup";
import { MENU_ITEM_CLASS } from "./menuItemClass";

export default function UserMenuOrgSection() {
  const dispatch = useAppDispatch();
  const activeOrgId = useAppSelector(selectOrganizationId);
  const promptForOrg = useAppSelector(selectShouldPromptForOrganization);
  const { organizations, loading } = useUserOrganizations();
  const { isDefault } = useDefaultOrganization();

  return (
    <MenuGroup
      id="organization"
      icon="Building2"
      label="Organization"
      defaultOpen={promptForOrg}
      iconClassName={promptForOrg ? "[&_svg]:text-red-500" : undefined}
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
        <>
          {organizations.map((org) => {
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
                {isDefault(org.id) && (
                  <Star
                    className="shrink-0 fill-amber-400 text-amber-400"
                    aria-label="Default organization"
                  />
                )}
                {isActive && (
                  <Check className="shrink-0 text-primary" strokeWidth={2.5} />
                )}
              </button>
            );
          })}
          <DefaultOrgSwitch className="mt-0.5" />
        </>
      )}
    </MenuGroup>
  );
}
