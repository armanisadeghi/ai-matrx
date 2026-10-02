"use client";

import { useRef } from "react";
import { UserData } from "@/utils/userDataMapper";
import { useResetMenuGroupsOnOpen } from "./useResetMenuGroupsOnOpen";
import { OverlayMenuItem } from "./OverlayMenuItem";
import { CanvasToolMenuItem } from "./CanvasToolMenuItem";
import { LinkMenuItem } from "./LinkMenuItem";
import { AdminIndicatorMenuItem } from "./AdminIndicatorMenuItem";
import { CostUnitMenuItem } from "./CostUnitMenuItem";
import { ErrorInspectorMenuItem } from "./ErrorInspectorMenuItem";
import { CopyShortLinkMenuItem } from "./CopyShortLinkMenuItem";
import { SignOutMenuItem } from "./SignOutMenuItem";
import { UserProfileHeader } from "./UserProfileHeader";
import { MenuGroup } from "./MenuGroup";
import {
  QUICK_ACCESS_ITEMS,
  COMMUNICATION_ITEMS,
} from "./userMenuItems.constants";
import { USER_MENU_PANEL_CLASS } from "./menuItemClass";

const divider = (
  <div className="h-px my-1 mx-2 bg-[var(--matrx-glass-border-color)]" />
);

interface UserMenuPanelProps {
  userData: UserData;
  menuCheckboxId?: string;
}

/**
 * Authenticated-only user menu: identity, quick access, admin, sign out.
 * `ShellUserBlock` mounts it only for a signed-in person (a guest gets the
 * Sign in row), so there is no guest fallback here.
 */
export default function UserMenuPanel({
  userData,
  menuCheckboxId = "shell-user-menu",
}: UserMenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useResetMenuGroupsOnOpen(panelRef, menuCheckboxId);

  return (
    <div ref={panelRef} className={USER_MENU_PANEL_CLASS}>
      <UserProfileHeader userData={userData} />

      {divider}

      <LinkMenuItem href="/intelligence" icon="Intelligence" label="Intelligence" />

      {divider}

      <MenuGroup id="quick" icon="Rocket" label="Quick Access">
        {QUICK_ACCESS_ITEMS.map((item) =>
          "canvasTool" in item ? (
            <CanvasToolMenuItem key={item.canvasTool} {...item} />
          ) : (
            <OverlayMenuItem key={item.overlayId} {...item} />
          ),
        )}
      </MenuGroup>

      {divider}

      {COMMUNICATION_ITEMS.map((item) => (
        <OverlayMenuItem key={item.overlayId} {...item} />
      ))}

      {userData.isAdmin && (
        <>
          {divider}
          <MenuGroup
            id="admin"
            icon="Shield"
            label="Admin"
            iconClassName="[&_svg]:text-amber-500"
          >
            <LinkMenuItem
              href="/administration"
              icon="Shield"
              label="Admin Dashboard"
              className="[&_svg]:text-amber-500"
            />
            <AdminIndicatorMenuItem />
            <CostUnitMenuItem />
            <ErrorInspectorMenuItem />
          </MenuGroup>
        </>
      )}

      {divider}

      {/* Theme, Media and Preferences live in the rail's Settings slot
          (ShellSettingsMenu); the organization in its own slot. */}
      <CopyShortLinkMenuItem />

      {divider}

      <SignOutMenuItem />
    </div>
  );
}
