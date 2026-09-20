import AppLink from "@/components/navigation/AppLink";
import { tabIdToHref, SETTINGS_BASE } from "@/features/settings/route-shell/routing";
import { UserData } from "@/utils/userDataMapper";
import { ShellUserAvatarImage } from "./ShellUserAvatarImage";

interface UserProfileHeaderProps {
  userData: UserData;
}

export function UserProfileHeader({ userData }: UserProfileHeaderProps) {
  const name = userData.userMetadata.name;
  const displayName = name ?? userData.email ?? "You";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  // Only show the email as a second line when it's genuinely additional
  // information — a name-less account already shows its email as the
  // display name above, and repeating it below prints `admin@admin.com`
  // twice (cold-walk-13 friction item).
  const showEmailBelow = Boolean(name && userData.email);
  return (
    <label htmlFor="shell-user-menu" className="block">
      <AppLink
        href={tabIdToHref(SETTINGS_BASE, "account.identity")}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--matrx-glass-bg-hover)] transition-colors"
      >
        {userData.userMetadata.avatarUrl ? (
          <span className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-full">
            <ShellUserAvatarImage
              src={userData.userMetadata.avatarUrl}
              alt={displayName}
              sizes="28px"
            />
          </span>
        ) : (
          <span className="w-7 h-7 rounded-full bg-[var(--matrx-glass-bg-active)] flex items-center justify-center text-xs font-semibold text-[var(--shell-nav-text)] shrink-0">
            {initial}
          </span>
        )}
        <span className="flex flex-col min-w-0">
          <span className="text-base font-medium text-foreground truncate">
            {displayName}
          </span>
          {showEmailBelow && (
            <span className="text-xs text-foreground truncate">
              {userData.email}
            </span>
          )}
        </span>
      </AppLink>
    </label>
  );
}
