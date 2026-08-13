// app/(admin)/administration/users/UsersAdminLayoutClient.tsx

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  DollarSign,
  Gauge,
  Loader2,
  Mail,
  MailPlus,
  Megaphone,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    label: "Accounts",
    href: "/administration/users",
    icon: Users,
    exact: true,
  },
  {
    label: "Organizations",
    href: "/administration/users/organizations",
    icon: Building2,
  },
  {
    label: "Preferences",
    href: "/administration/users/preferences",
    icon: SlidersHorizontal,
  },
  {
    label: "Admins & Levels",
    href: "/administration/users/admins",
    icon: ShieldCheck,
  },
  {
    label: "Invitations",
    href: "/administration/users/invitations",
    icon: MailPlus,
  },
  {
    label: "Entitlements",
    href: "/administration/users/entitlements",
    icon: Gauge,
  },
  {
    label: "Usage & Cost",
    href: "/administration/users/usage",
    icon: DollarSign,
  },
  {
    label: "Email",
    href: "/administration/users/email",
    icon: Mail,
  },
  {
    label: "Announcements",
    href: "/administration/users/announcements",
    icon: Megaphone,
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function UsersAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      <div className="flex shrink-0 flex-col border-b border-border bg-card sm:flex-row sm:items-center sm:gap-2 sm:px-4">
        <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2 sm:h-12 sm:border-b-0 sm:border-r sm:px-0 sm:pr-3">
          <Link
            href="/administration"
            aria-label="Back to administration"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:-ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-sm font-medium">
            Users &amp; Access
          </span>
        </div>
        <nav
          aria-label="Users and access sections"
          className="flex h-11 min-w-0 items-center gap-1 overflow-x-auto px-2 sm:h-12 sm:px-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const navigating = isPending && pendingHref === item.href;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => handleNavigate(item.href)}
                disabled={isPending}
                className={cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                )}
              >
                {navigating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <item.icon className="w-4 h-4" />
                )}
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
    </div>
  );
}
