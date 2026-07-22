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
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <div className="border-b border-border px-4 bg-card flex items-center gap-2">
        <Link
          href="/administration"
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-1.5 pr-2 border-r border-border h-12">
          <Users className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Users &amp; Access</span>
        </div>
        <nav className="flex items-center h-12 gap-1 overflow-x-auto">
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
                  "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap",
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
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
