"use client";

import { organizationColor } from "@ai-matrx/design-system";
import { RailMenuHeader } from "@/features/shell/components/account-rail/RailMenuHeader";
import {
  tabIdToHref,
  SETTINGS_BASE,
} from "@/features/settings/route-shell/routing";
import { UserData } from "@/utils/userDataMapper";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserAvatarUrl } from "@/lib/redux/selectors/userSelectors";
import { ShellUserAvatarImage } from "./ShellUserAvatarImage";
import { MenuItemCloseLabel } from "./menuCheckboxId";

interface UserProfileHeaderProps {
  userData: UserData;
}

export function UserProfileHeader({ userData }: UserProfileHeaderProps) {
  const displayName = userData.userMetadata.name ?? userData.email ?? "You";
  // The server-rendered prop is the first paint; the live Redux avatar wins once a save
  // dispatches `setUserMetadata`, so a new photo shows here at once (as in the rail).
  const liveAvatarUrl = useAppSelector(selectUserAvatarUrl);
  const avatarUrl = liveAvatarUrl || userData.userMetadata.avatarUrl;
  const initial = displayName.charAt(0).toUpperCase() || "?";
  // The same header row the Settings and Organization menus open with
  // (RailMenuHeader): a 28px mark, the name, the email beneath — printed only
  // when a separate name holds the first line, never twice (cold walk 13).
  return (
    <MenuItemCloseLabel>
      <RailMenuHeader
        mark={
          avatarUrl ? (
            <span className="relative block h-7 w-7 overflow-hidden rounded-full">
              <ShellUserAvatarImage
                src={avatarUrl}
                alt={displayName}
                sizes="28px"
              />
            </span>
          ) : (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full type-secondary font-semibold"
              style={organizationColor(userData.id ?? displayName)}
            >
              {initial}
            </span>
          )
        }
        title={displayName}
        subtitle={userData.email && userData.userMetadata.name ? userData.email : null}
        href={tabIdToHref(SETTINGS_BASE, "account.identity")}
      />
    </MenuItemCloseLabel>
  );
}
