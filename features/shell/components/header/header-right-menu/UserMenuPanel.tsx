import { UserData } from "@/utils/userDataMapper";
import { OverlayMenuItem } from "./OverlayMenuItem";
import { LinkMenuItem } from "./LinkMenuItem";
import { AdminIndicatorMenuItem } from "./AdminIndicatorMenuItem";
import { ErrorInspectorMenuItem } from "./ErrorInspectorMenuItem";
import { NotificationsMenuItem } from "./NotificationsMenuItem";
import { MessagesMenuItem } from "./MessagesMenuItem";
import { ThemeToggleMenuItem } from "./ThemeToggleMenuItem";
import { SignOutMenuItem } from "./SignOutMenuItem";
import { UserProfileHeader } from "./UserProfileHeader";
import UserMenuOrgSection from "./UserMenuOrgSection";
import { MenuGroup } from "./MenuGroup";
import {
  QUICK_ACCESS_ITEMS,
  COMMUNICATION_ITEMS,
  SETTINGS_ITEMS,
} from "./userMenuItems.constants";
import { USER_MENU_PANEL_CLASS } from "./menuItemClass";

const divider = (
  <div className="h-px my-1 mx-2 bg-[var(--matrx-glass-border-color)]" />
);

interface UserMenuPanelProps {
  userData: UserData;
}

/**
 * Authenticated-only user menu. The `Header` branches on `isAuthenticated`
 * and routes unauthenticated visitors to `GuestUserMenuPanel`, so this
 * component no longer carries a guest fallback — every reachable code path
 * has a real user.
 */
export default function UserMenuPanel({ userData }: UserMenuPanelProps) {
  return (
    <div className={USER_MENU_PANEL_CLASS}>
      <UserProfileHeader userData={userData} />

      {divider}

      <UserMenuOrgSection />

      {divider}

      <MenuGroup
        id="quick"
        icon="Rocket"
        label="Quick Access"
        defaultOpen={true}
      >
        {QUICK_ACCESS_ITEMS.map((item) => (
          <OverlayMenuItem key={item.overlayId} {...item} />
        ))}
      </MenuGroup>

      {divider}

      <MessagesMenuItem />
      <NotificationsMenuItem />
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
            defaultOpen={false}
            iconClassName="[&_svg]:text-amber-500"
          >
            <LinkMenuItem
              href="/administration"
              icon="Shield"
              label="Admin Dashboard"
              className="[&_svg]:text-amber-500"
            />
            <AdminIndicatorMenuItem />
            <ErrorInspectorMenuItem />
          </MenuGroup>
        </>
      )}

      {divider}

      <ThemeToggleMenuItem />
      {SETTINGS_ITEMS.map((item) => (
        <OverlayMenuItem key={item.overlayId} {...item} />
      ))}

      {divider}

      <SignOutMenuItem />
    </div>
  );
}
