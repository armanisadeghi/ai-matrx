import HamburgerButton from "./header-left-menu/HamburgerButton";
import UserMenuTrigger from "./header-right-menu/UserMenuTrigger";
import UserMenuPanel from "./header-right-menu/UserMenuPanel";
import GuestUserMenuTrigger from "./header-right-menu/GuestUserMenuTrigger";
import GuestUserMenuPanel from "./header-right-menu/GuestUserMenuPanel";
import { UserData } from "@/utils/userDataMapper";

interface HeaderProps {
  userData: UserData;
  isAuthenticated: boolean;
}

export default function Header({ userData, isAuthenticated }: HeaderProps) {
  return (
    <header className="shell-header">
      <HamburgerButton />

      <div className="shell-header-center" id="shell-header-center" />

      <div className="shell-header-right">
        <div className="shell-header-right-inject" id="shell-header-right" />
        <div className="shell-user-menu-wrapper">
          {isAuthenticated ? (
            <UserMenuTrigger userData={userData} />
          ) : (
            <GuestUserMenuTrigger />
          )}
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
      </div>
    </header>
  );
}
