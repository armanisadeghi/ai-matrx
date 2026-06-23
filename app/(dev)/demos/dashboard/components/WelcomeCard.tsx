// WelcomeCard.tsx — Server component for the welcome/greeting card
// Shows personalized greeting with user info

import Image from "next/image";
import ShellIcon from "@/features/shell/components/ShellIcon";

interface WelcomeCardProps {
  user: {
    name: string;
    email?: string;
    avatarUrl?: string;
  } | null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeCard({ user }: WelcomeCardProps) {
  const greeting = getGreeting();

  return (
    <div className="matrx-glass-card px-4 sm:px-6 py-4 mx-4 sm:mx-6 rounded-2xl flex items-center gap-4">
      <div
        className="relative flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 overflow-hidden"
        style={{ background: "var(--matrx-glass-bg-hover)" }}
      >
        {user?.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.name}
            fill
            className="object-cover"
            sizes="48px"
            loading="eager"
            priority
          />
        ) : (
          <ShellIcon
            name="User"
            size={24}
            strokeWidth={1.5}
            style={{ color: "var(--shell-nav-icon-hover)" }}
          />
        )}
      </div>
      <div className="min-w-0">
        <h1
          className="text-lg font-semibold tracking-tight truncate"
          style={{ color: "var(--shell-nav-text-hover)" }}
        >
          {greeting}, {user?.name ?? "Guest"}
        </h1>
        {user?.email && (
          <p
            className="text-sm truncate"
            style={{ color: "var(--shell-nav-icon)" }}
          >
            {user.email}
          </p>
        )}
      </div>
    </div>
  );
}
