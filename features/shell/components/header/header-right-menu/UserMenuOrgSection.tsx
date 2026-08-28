"use client";

// UserMenuOrgSection — the active-organization switcher INSIDE the user-menu
// dropdown. The persistent home for org selection: the user can always see the
// current org, switch it, and pin a default. HeaderChooseOrgButton appears in the
// header only while no org is chosen; this section is always available. Default
// management uses the same canonical pieces as that button's popover
// (useActiveOrganizationPicker + DefaultOrgSwitch).

import { Check, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { DefaultOrgSwitch } from "@/features/organizations/components/DefaultOrgSwitch";
import { MenuGroup } from "./MenuGroup";
import { MENU_ITEM_CLASS } from "./menuItemClass";
import { OrganizationAbbreviation } from "@/features/organizations/components/OrganizationAbbreviation";

export default function UserMenuOrgSection() {
  const isMounted = useIsMounted();
  const {
    activeOrgId,
    activeOrgName,
    promptForOrg,
    organizations,
    loading,
    loadFailed,
    isDefault,
    selectOrganization,
  } = useActiveOrganizationPicker();

  return (
    <MenuGroup
      id="organization"
      icon="Building2"
      label="Organization"
      iconClassName={promptForOrg ? "[&_svg]:text-red-500" : undefined}
    >
      {!isMounted || loading ? (
        <div className="space-y-1 px-3 py-1">
          <div className="h-5 animate-pulse rounded-full bg-muted" />
          <div className="h-5 animate-pulse rounded-full bg-muted" />
        </div>
      ) : loadFailed ? (
        <p className="px-3 py-1 text-xs text-destructive">
          Could not load organizations.
        </p>
      ) : organizations.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">
          No organizations found.
        </p>
      ) : (
        <>
          {/*
            🚨 THE MENU NOW SAYS, IN WORDS, WHICH ORG IS ACTIVE.

            It never did. The active row carried a check mark and an accent colour
            — visual only — while `DefaultOrgSwitch` below it printed the only
            sentence in the menu that named an organization, and that sentence is
            about STARTUP. So a user who switched away from their default still
            read "Titanium loads at startup", concluded the switch had not taken,
            and reported the switcher broken. That happened five times across three
            rounds; the switcher was writing correctly every time.

            A colour is not an answer to "which one am I in". This is.
          */}
          {activeOrgId ? (
            <p className="px-3 pb-1 text-[11px] text-muted-foreground">
              Working in{" "}
              <span className="font-medium text-foreground">
                {activeOrgName ?? "the selected organization"}
              </span>
            </p>
          ) : (
            <p className="px-3 pb-1 text-[11px] text-destructive">
              No organization selected — pick one below.
            </p>
          )}
          {organizations.map((org) => {
            const isActive = org.id === activeOrgId;
            return (
              <button
                key={org.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  selectOrganization(org.id, org.name);
                }}
                className={cn(
                  MENU_ITEM_CLASS,
                  isActive &&
                    "bg-primary/10 font-medium text-primary [&>svg:last-child]:text-primary",
                )}
              >
                <OrganizationAbbreviation
                  abbreviation={org.abbreviation}
                  className="h-5 min-w-8 rounded border border-border bg-muted px-1 text-[9px] text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {org.name}
                </span>
                {org.is_personal && (
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
