"use client";

/**
 * Shell-aligned controls embedded in CanvasPane's header (not a separate row):
 * chevron-right put-away + user avatar/menu at the far right.
 */

import "@/styles/shell.css";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { UserData } from "@/utils/userDataMapper";
import { ChevronRightTapButton } from "@/components/icons/tap-buttons";
import UserMenuTrigger from "@/features/shell/components/header/header-right-menu/UserMenuTrigger";
import UserMenuPanel from "@/features/shell/components/header/header-right-menu/UserMenuPanel";
import GuestUserMenuTrigger from "@/features/shell/components/header/header-right-menu/GuestUserMenuTrigger";
import GuestUserMenuPanel from "@/features/shell/components/header/header-right-menu/GuestUserMenuPanel";

/** Separate from `#shell-user-menu` so the menu panel can sit above z-10000. */
export const CANVAS_SHELL_USER_MENU_ID = "canvas-shell-user-menu";

function useCanvasShellUserData(): UserData | null {
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

export function CanvasPaneUserMenu() {
  const userData = useCanvasShellUserData();

  return (
    <div className="canvas-shell-user-menu-root shrink-0">
      <input
        type="checkbox"
        id={CANVAS_SHELL_USER_MENU_ID}
        aria-hidden="true"
        className="sr-only"
      />
      <div className="canvas-shell-user-menu-wrapper">
        {userData ? (
          <UserMenuTrigger
            userData={userData}
            menuCheckboxId={CANVAS_SHELL_USER_MENU_ID}
          />
        ) : (
          <GuestUserMenuTrigger menuCheckboxId={CANVAS_SHELL_USER_MENU_ID} />
        )}
        <label
          htmlFor={CANVAS_SHELL_USER_MENU_ID}
          className="canvas-shell-user-menu-backdrop"
          aria-hidden="true"
        />
        <div className="canvas-shell-user-menu-panel">
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
