// ShellUserBlock — THE ACCOUNT RAIL, bottom-left, one copy.
//
// Server Component. The sidebar ends in three slots that are ALWAYS visible
// and never scroll away (owner, 2026-09-30), top to bottom:
//
//   Settings      — `ShellSettingsMenu` (Settings page, Preferences, theme, Media, Trash)
//   Organization  — `ShellOrgSwitcher`, THE organization control of the chrome
//   You           — the avatar; opens the profile menu (`UserMenuPanel`)
//
// Each slot is a `.shell-nav-item.shell-nav-stable` row, so it has exactly the
// nav rail's geometry: the icon column is the nav icons' column, an icon only
// while the rail is collapsed, icon + name while it is expanded.
//
// It is a sibling of the sidebar, not a child of it, for three reasons:
//   1. `/chat`, the launchpads and the settings route hide or reshape the
//      sidebar; the person must still reach their menu there.
//   2. Bottom-left is never covered by the canvas pane or MatrxDynamicPanel.
//   3. Mobile has no sidebar: the navigation drawer ends in the same three
//      (`MobileNavigationDrawer` → Settings, `ShellOrgSwitcher variant="drawer"`,
//      `MobileDrawerUserRow`); only this desktop trigger set hides there.
//
// The profile menu's open state is the shell's `#shell-user-menu` checkbox
// (rendered by the shell root), so every item's `<label htmlFor>` close keeps
// working. Geometry lives in styles/shell.css § 15b.

import UserMenuPanel from "../header/header-right-menu/UserMenuPanel";
import GuestUserMenuTrigger from "../header/header-right-menu/GuestUserMenuTrigger";
import { RailUserAvatar } from "./RailUserAvatar";
import { ShellSettingsMenu } from "../account-rail/ShellSettingsMenu";
import { ShellOrgSwitcher } from "../account-rail/ShellOrgSwitcher";
import type { UserData } from "@/utils/userDataMapper";
import UserMenuEscape from "./UserMenuEscape";

interface ShellUserBlockProps {
  userData: UserData;
  isAuthenticated: boolean;
}

export default function ShellUserBlock({
  userData,
  isAuthenticated,
}: ShellUserBlockProps) {
  const displayName =
    userData.userMetadata?.name ?? userData.email ?? "Your account";
  const avatarUrl = userData.userMetadata?.avatarUrl;
  return (
    <div className="shell-user-block" data-shell-user-block>
      <UserMenuEscape />
      <div className="shell-account-rail" data-title-side="right">
        <ShellSettingsMenu />
        {isAuthenticated ? <ShellOrgSwitcher /> : null}
        {isAuthenticated ? (
          <label
            htmlFor="shell-user-menu"
            aria-label="Account menu"
            title={displayName}
            className="shell-nav-item shell-nav-stable shell-tactile-subtle cursor-pointer"
            data-shell-user-trigger
          >
            <span className="shell-nav-icon">
              <RailUserAvatar
                id={userData.id}
                name={userData.userMetadata?.name}
                avatarUrl={avatarUrl}
                displayName={displayName}
              />
            </span>
            <span className="shell-nav-label">{displayName}</span>
          </label>
        ) : (
          <GuestUserMenuTrigger />
        )}
      </div>
      {isAuthenticated ? (
        <label
          htmlFor="shell-user-menu"
          className="shell-user-menu-backdrop"
          aria-hidden="true"
        />
      ) : null}
      {isAuthenticated ? (
        <div className="shell-user-menu-panel">
          <UserMenuPanel userData={userData} />
        </div>
      ) : null}
    </div>
  );
}
