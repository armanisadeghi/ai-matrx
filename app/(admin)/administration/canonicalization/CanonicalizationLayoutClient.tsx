"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  AlertTriangle,
  Wrench,
  GitBranch,
  ShieldQuestion,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/administration/canonicalization",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Summary",
    href: "/administration/canonicalization/summary",
    icon: ListChecks,
  },
  {
    label: "Findings",
    href: "/administration/canonicalization/findings",
    icon: AlertTriangle,
  },
  {
    label: "Broken functions",
    href: "/administration/canonicalization/broken-functions",
    icon: Wrench,
  },
  {
    label: "Function deps",
    href: "/administration/canonicalization/function-deps",
    icon: GitBranch,
  },
  {
    label: "Candidates",
    href: "/administration/canonicalization/candidates",
    icon: ShieldQuestion,
  },
  {
    label: "Table impact",
    href: "/administration/canonicalization/table-impact",
    icon: Search,
  },
  {
    label: "Verify",
    href: "/administration/canonicalization/verify",
    icon: ListChecks,
  },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}

export function CanonicalizationLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);

  const handleNavigate = (href: string) => {
    if (pathname === href || isPending) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {isMobile ? (
        <nav className="flex shrink-0 flex-col border-b border-border bg-card">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            const pending = isPending && pendingHref === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleNavigate(item.href);
                }}
                className={cn(
                  "flex items-center gap-2 border-b border-border/60 px-4 py-3 text-sm font-medium last:border-b-0",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                )}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4 shrink-0" />
                )}
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : (
        <div className="shrink-0 border-b border-border bg-card px-4">
          <div className="flex flex-nowrap overflow-x-auto no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              const pending = isPending && pendingHref === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => {
                    e.preventDefault();
                    handleNavigate(item.href);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
