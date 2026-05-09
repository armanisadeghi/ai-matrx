import { UserData } from "@/utils/userDataMapper";
import { OverlayMenuItem } from "./OverlayMenuItem";
import { LinkMenuItem } from "./LinkMenuItem";
import { AdminIndicatorMenuItem } from "./AdminIndicatorMenuItem";
import { NotificationsMenuItem } from "./NotificationsMenuItem";
import { MessagesMenuItem } from "./MessagesMenuItem";
import { ThemeToggleMenuItem } from "./ThemeToggleMenuItem";
import { SignOutMenuItem } from "./SignOutMenuItem";
import { UserProfileHeader } from "./UserProfileHeader";
import { MenuGroup } from "./MenuGroup";
import {
  QUICK_ACCESS_ITEMS,
  COMMUNICATION_ITEMS,
  SETTINGS_ITEMS,
} from "./userMenuItems.constants";

const divider = (
  <div className="h-px my-1 mx-2 bg-[var(--matrx-glass-border-color)]" />
);

interface UserMenuPanelProps {
  userData: UserData;
}

export default function UserMenuPanel({ userData }: UserMenuPanelProps) {
  if (!userData) {
    return (
      <div className="matrx-glass-thin-border w-52 p-1.5 rounded-xl shadow-2xl">
        <LinkMenuItem href="/login" icon="LogOut" label="Sign In" />
      </div>
    );
  }

  return (
    <div className="matrx-glass-thin-border w-60 max-lg:w-auto p-1.5 rounded-xl max-lg:rounded-2xl max-lg:p-2 shadow-2xl">
      <UserProfileHeader userData={userData} />

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
