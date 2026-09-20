// ShellUserBlock — THE profile menu, bottom-left, one copy.
//
// Server Component. Owns the avatar trigger that sits where the sidebar ends
// (Claude, ChatGPT, Notion, Slack, Cursor all put the person here), the
// click-out backdrop and the menu panel. It is a sibling of the sidebar, not a
// child of it, for three reasons:
//   1. `/chat`, the launchpads and the settings route hide or reshape the
//      sidebar (`.shell-hide-sidebar`, `[data-settings-route]`); the person
//      must still be able to reach their menu there.
//   2. The canvas pane and MatrxDynamicPanel cover the header's top-right
//      corner — the reason the avatar used to be copied three times
//      (header, canvas pane header, glass-layer stand-in). Bottom-left is
//      never covered, so there is now ONE copy and no CSS to hide it.
//   3. Mobile has no sidebar: the same panel opens from the profile row at
//      the bottom of the navigation drawer (`MobileDrawerUserRow`); only the
//      trigger here is desktop-only.
//
// The open state is the shell's `#shell-user-menu` checkbox (rendered by the
// shell root), so every menu item's `<label htmlFor="shell-user-menu">` close
// keeps working unchanged. Geometry lives in styles/shell.css § 15b.

import UserMenuTrigger from "../header/header-right-menu/UserMenuTrigger";
import UserMenuPanel from "../header/header-right-menu/UserMenuPanel";
import GuestUserMenuTrigger from "../header/header-right-menu/GuestUserMenuTrigger";
import GuestUserMenuPanel from "../header/header-right-menu/GuestUserMenuPanel";
import type { UserData } from "@/utils/userDataMapper";

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
  return (
    <div className="shell-user-block shell-user-menu-wrapper" data-shell-user-block>
      <div className="shell-user-block-trigger">
        {isAuthenticated ? (
          <UserMenuTrigger userData={userData} />
        ) : (
          <GuestUserMenuTrigger />
        )}
        {isAuthenticated ? (
          <label
            htmlFor="shell-user-menu"
            className="shell-user-block-name"
            title={displayName}
          >
            <span className="shell-user-block-name-primary">{displayName}</span>
            {userData.email && userData.email !== displayName ? (
              <span className="shell-user-block-name-secondary">
                {userData.email}
              </span>
            ) : null}
          </label>
        ) : null}
      </div>
      <label
        htmlFor="shell-user-menu"
        className="shell-user-menu-backdrop"
        aria-hidden="true"
      />
      <div className="shell-user-menu-panel">
        {isAuthenticated ? (
          <UserMenuPanel userData={userData} />
        ) : (
          <GuestUserMenuPanel />
        )}
      </div>
    </div>
  );
}
