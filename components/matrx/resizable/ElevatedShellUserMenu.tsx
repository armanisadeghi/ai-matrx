"use client";

/**
 * Glass-layer stand-in for the shell header avatar while MatrxDynamicPanel
 * covers the top-right corner. Same checkbox-menu chrome as AppShell / Canvas;
 * stacked above the panel (z-110+) so open/close and the dropdown work.
 *
 * Reuses AppShell's `#shell-user-menu` checkbox (no second id) so menu items
 * that close via `htmlFor="shell-user-menu"` still dismiss the panel.
 *
 * Mount once inside Providers (AppShell → GlassPortal). Panels claim/release
 * via elevatedShellUserMenuStore — do not render this from each panel.
 */

import { useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { UserData } from "@/utils/userDataMapper";
import UserMenuTrigger from "@/features/shell/components/header/header-right-menu/UserMenuTrigger";
import UserMenuPanel from "@/features/shell/components/header/header-right-menu/UserMenuPanel";
import GuestUserMenuTrigger from "@/features/shell/components/header/header-right-menu/GuestUserMenuTrigger";
import GuestUserMenuPanel from "@/features/shell/components/header/header-right-menu/GuestUserMenuPanel";
import {
  getDynamicPanelAvatarCoverActive,
  subscribeDynamicPanelAvatarCover,
} from "./elevatedShellUserMenuStore";

function useElevatedShellUserData(): UserData | null {
  const user = useAppSelector(selectUser);
  if (!user.id) return null;

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    emailConfirmedAt: user.emailConfirmedAt,
    lastSignInAt: user.lastSignInAt,
    appMetadata: user.appMetadata,
    userMetadata: user.userMetadata,
    identities: user.identities,
    isAdmin: user.isAdmin,
    adminLevel: user.adminLevel,
    accessToken: user.accessToken,
    tokenExpiresAt: user.tokenExpiresAt,
  };
}

function ElevatedShellUserMenuChrome() {
  const userData = useElevatedShellUserData();

  return (
    <div className="elevated-shell-user-menu-root">
      <div className="elevated-shell-user-menu-wrapper">
        {userData ? (
          <UserMenuTrigger userData={userData} />
        ) : (
          <GuestUserMenuTrigger />
        )}
        <label
          htmlFor="shell-user-menu"
          className="elevated-shell-user-menu-backdrop"
          aria-hidden="true"
        />
        <div className="elevated-shell-user-menu-panel">
          {userData ? (
            <UserMenuPanel userData={userData} />
          ) : (
            <GuestUserMenuPanel />
          )}
        </div>
      </div>
    </div>
  );
}

/** Singleton host — mount once under Providers (e.g. AppShell GlassPortal). */
export function ElevatedShellUserMenuRoot() {
  const active = useSyncExternalStore(
    subscribeDynamicPanelAvatarCover,
    getDynamicPanelAvatarCoverActive,
    () => false,
  );

  if (!active) return null;
  return <ElevatedShellUserMenuChrome />;
}
