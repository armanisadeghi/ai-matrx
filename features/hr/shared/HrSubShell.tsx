// features/hr/shared/HrSubShell.tsx
//
// `HrShell` PLUS THE SECTION'S ROUTE-TAB BAR (SPEC-UI-IA §3, `shell` column).
//
// The bar is owned by the section's `layout.tsx`, exactly like
// `app/(admin)/administration/users/UsersAdminLayoutClient.tsx` — which this is a
// deliberate copy of, because that pattern is already right:
//
//   • A FLAT array of tabs. No nesting, no accordion, no second selector.
//   • EVERY TAB IS A REAL ROUTE — deep-linkable, new-tab-able, back-button-able.
//     A tab that swaps client state instead of navigating is a dead end (LAW 1).
//   • `usePathname()` computes the active tab; `useTransition()` + `router.push`
//     drives the change and the pressed tab shows `Loader2` while it is pending,
//     so a slow section never looks like a dead click.
//   • The body scrolls, the bar does not.
//
// 🚨 A TAB WITH `visible: false` IS ABSENT FROM THE BAR. Never rendered disabled,
// never rendered greyed with a lock. There is no greyed control anywhere in HR
// (SPEC-UI-IA §4.2 — the rule covers tabs and columns, not just fields).

"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, type LucideIcon } from "lucide-react";

import { allowNativeNewTab } from "@/utils/navigation/should-open-in-new-tab";
import { cn } from "@/lib/utils";

import { HrShell } from "./HrShell";

export type HrRouteTab = {
  key: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  /** `false` → the tab is ABSENT from the bar. Omitted means visible. */
  visible?: boolean;
};

function routePath(href: string): string {
  const index = href.indexOf("?");
  return index === -1 ? href : href.slice(0, index);
}

/**
 * The active tab is the one whose route path is the LONGEST prefix of the current
 * pathname. Longest-wins is load-bearing: `/hr/people` is a prefix of
 * `/hr/people/org-chart`, so a first-match scan would light up Directory while the
 * user is on the org chart.
 */
export function resolveActiveHrTab(
  tabs: HrRouteTab[],
  pathname: string,
): string | null {
  let bestKey: string | null = null;
  let bestLength = -1;
  for (const tab of tabs) {
    const path = routePath(tab.href);
    const matches = pathname === path || pathname.startsWith(`${path}/`);
    if (matches && path.length > bestLength) {
      bestKey = tab.key;
      bestLength = path.length;
    }
  }
  return bestKey;
}

export function HrSubShell({
  tabs,
  children,
  title,
  description,
  actions,
}: {
  tabs: HrRouteTab[];
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  // ABSENT, not disabled.
  const visible = tabs.filter((tab) => tab.visible !== false);
  const activeKey = resolveActiveHrTab(visible, pathname);

  const navigate = (tab: HrRouteTab) => {
    if (isPending || tab.key === activeKey) return;
    setPendingKey(tab.key);
    startTransition(() => router.push(tab.href));
  };

  return (
    <HrShell
      title={title}
      description={description}
      actions={actions}
      subNav={
        visible.length > 0 ? (
          <nav
            aria-label="Section"
            className="flex h-11 min-w-0 items-center gap-1 overflow-x-auto px-2 sm:h-12 sm:px-4"
          >
            {visible.map((tab) => {
              const active = tab.key === activeKey;
              const navigating = isPending && pendingKey === tab.key;
              const Icon = tab.icon;
              return (
                // A real <Link href>, so cmd/ctrl/middle-click opens the tab in a
                // new browser tab natively. The onClick only intercepts the PLAIN
                // click, to carry the pending state.
                <Link
                  key={tab.key}
                  href={tab.href}
                  onClick={(event) => {
                    if (allowNativeNewTab(event)) return;
                    event.preventDefault();
                    navigate(tab);
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-busy={navigating || undefined}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:min-h-9",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    isPending && !navigating && "opacity-60",
                  )}
                >
                  {navigating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : Icon ? (
                    <Icon className="h-4 w-4" />
                  ) : null}
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null
      }
    >
      {children}
    </HrShell>
  );
}
