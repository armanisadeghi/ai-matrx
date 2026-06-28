"use client";

import "@/styles/shell.css";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import type { UserData } from "@/utils/userDataMapper";
import UserMenuTrigger from "./UserMenuTrigger";
import UserMenuPanel from "./UserMenuPanel";

function useShellUserData(): UserData | null {
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

/** Authenticated profile menu — same chrome as AppShell Header, for layouts outside `.shell-root`. */
export default function ShellUserMenu() {
  const userData = useShellUserData();
  if (!userData) return null;

  return (
    <div className="shell-user-menu-portable-root">
      <input type="checkbox" id="shell-user-menu" aria-hidden="true" />
      <div className="shell-user-menu-wrapper">
        <UserMenuTrigger userData={userData} />
        <label
          htmlFor="shell-user-menu"
          className="shell-user-menu-backdrop"
          aria-hidden="true"
        />
        <div className="shell-user-menu-panel">
          <UserMenuPanel userData={userData} />
        </div>
      </div>
    </div>
  );
}
