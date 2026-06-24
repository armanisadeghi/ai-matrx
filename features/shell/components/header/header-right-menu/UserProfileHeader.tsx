import Link from "next/link";
import Image from "next/image";
import { UserData } from "@/utils/userDataMapper";

interface UserProfileHeaderProps {
  userData: UserData;
}

export function UserProfileHeader({ userData }: UserProfileHeaderProps) {
  const displayName = userData.userMetadata.name ?? userData.email ?? "You";
  const initial = displayName.charAt(0).toUpperCase() || "?";
  return (
    <label htmlFor="shell-user-menu" className="block">
      <Link
        href="/settings"
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-[var(--matrx-glass-bg-hover)] transition-colors"
      >
        {userData.userMetadata.avatarUrl ? (
          <span className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-full">
            <Image
              src={userData.userMetadata.avatarUrl}
              alt={displayName}
              fill
              className="object-cover"
              sizes="28px"
              unoptimized
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
          {userData.email && (
            <span className="text-xs text-foreground truncate">
              {userData.email}
            </span>
          )}
        </span>
      </Link>
    </label>
  );
}
