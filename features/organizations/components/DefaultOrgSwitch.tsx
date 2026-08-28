"use client";

// DefaultOrgSwitch — the single "Set as my default organization" control,
// shared by every org picker (the header reminder popover + the user-menu org
// section). Operates on the CURRENTLY ACTIVE org: toggling on persists it as
// the user's default (auto-selected at startup, cross-device); toggling off
// clears the default. Disabled until an org is actually selected, so the user
// always knows which org the switch would pin.

import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectOrganizationName,
} from "@/lib/redux/slices/appContextSlice";
import { useDefaultOrganization } from "@/features/organizations/hooks/useDefaultOrganization";
import { Switch } from "@/components/ui/switch";

export function DefaultOrgSwitch({ className }: { className?: string }) {
  const activeOrgId = useAppSelector(selectOrganizationId);
  const activeOrgName = useAppSelector(selectOrganizationName);
  const { isDefault, setDefaultOrganization, clearDefaultOrganization } =
    useDefaultOrganization();

  const checked = isDefault(activeOrgId);
  const disabled = !activeOrgId;

  return (
    <div
      className={[
        "flex items-center justify-between gap-3 rounded-md px-2 py-1.5",
        className ?? "",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          Set as my default
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {/*
            🚨 THIS LINE IS ABOUT STARTUP, NOT ABOUT NOW — and it used to be the
            ONLY sentence in the whole menu that named an organization. A user who
            had switched away still read "Titanium loads at startup", concluded
            Titanium was in effect, and reported the switcher as broken; that
            happened five times across three rounds. The switcher was writing
            correctly the whole time. The menu simply never said, in words, which
            org was ACTIVE — the active row carried a check mark and an accent
            colour and nothing readable.

            So this says "next time" explicitly, and `UserMenuOrgSection` now states
            the working org above the list. A control whose only sentence describes
            a DIFFERENT fact than the one the reader is looking for is a lie by
            omission, even when every value in it is true.
          */}
          {disabled
            ? "Select an organization first"
            : checked
              ? `Next startup opens ${activeOrgName ?? "this organization"}`
              : "Auto-select this at startup"}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(on) =>
          on ? setDefaultOrganization(activeOrgId) : clearDefaultOrganization()
        }
        aria-label="Set this organization as my default"
      />
    </div>
  );
}
