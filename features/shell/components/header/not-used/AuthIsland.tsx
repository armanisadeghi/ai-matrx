// AuthIsland.tsx — Server component for the auth button
// Uses next/link for client-side transitions (shell stays mounted)

import Link from "next/link";
import Image from "next/image";
import ShellIcon from "../../ShellIcon";

interface AuthIslandProps {
  user: {
    name: string;
    avatarUrl?: string;
  } | null;
}

export default function AuthIsland({ user }: AuthIslandProps) {
  if (user) {
    return (
      <Link
        href="/settings"
        className="shell-auth-island matrx-glass-thin-border shell-tactile"
      >
        <span className="shell-auth-island-icon relative overflow-hidden rounded-full">
          {user.avatarUrl ? (
            <Image
              src={user.avatarUrl}
              alt={user.name}
              fill
              className="object-cover"
              sizes="24px"
              loading="eager"
              priority
            />
          ) : (
            <ShellIcon name="User" size={16} strokeWidth={2} />
          )}
        </span>
      </Link>
    );
  }

  return (
    <Link href="/login" className="shell-auth-island matrx-glass-thin-border shell-tactile">
      <span className="shell-auth-island-icon">
        <ShellIcon name="LogIn" size={16} strokeWidth={2} />
      </span>
      <span>Login</span>
    </Link>
  );
}
