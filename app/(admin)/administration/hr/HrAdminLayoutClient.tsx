// app/(admin)/administration/hr/HrAdminLayoutClient.tsx
//
// Route-tab shell for the HR administration section (SPEC-UI-IA §3.12 routes
// 85 / 85a / 85b). Same shape as the Users & Access hub: this layout owns the
// viewport height and the tab bar; each tab is its own route.

"use client";

import React, { useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Landmark, Loader2, Scale } from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Overview", href: "/administration/hr", icon: Landmark },
  {
    label: "Jurisdiction rules",
    href: "/administration/hr/jurisdiction-rules",
    icon: Scale,
  },
  {
    label: "Verification",
    href: "/administration/hr/jurisdiction-rules/verification",
    icon: ClipboardCheck,
  },
];

/**
 * The longest declared href that owns this pathname wins, so
 * `/jurisdiction-rules/verification` lights the Verification tab rather than
 * both it and its prefix.
 */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    const owns =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (owns && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

export function HrAdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const current = activeHref(pathname);

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
          <Scale className="h-4 w-4 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-sm font-medium">
            HR &amp; Employment Law
          </span>
        </div>
        <nav
          aria-label="HR administration sections"
          className="flex h-11 min-w-0 items-center gap-1 overflow-x-auto px-2 sm:h-12 sm:px-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = current === item.href;
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
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <item.icon className="h-4 w-4" />
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
