"use client";

/**
 * Administration route menu rendered inside the shared AppShell sidebar.
 * RouteMenuSlot owns switching, collapse behavior, mobile presentation, and
 * the reversible Main Menu control; this component only renders registry data.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import IconResolver from "@/components/official/icons/IconResolver";
import { ADMIN_LAUNCHPAD_PATH } from "@/features/admin/constants/admin-categories";
import {
  adminDomainHref,
  adminNavigationRegistry,
  destinationOwnsPathname,
  findAdminNavigationDomainByPathname,
  findAdminNavigationLocation,
} from "@/features/admin/constants/admin-navigation";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { cn } from "@/lib/utils";

interface AdminRouteSidebarMenuProps {
  expanded: boolean;
}

export default function AdminRouteSidebarMenu({
  expanded,
}: AdminRouteSidebarMenuProps) {
  const pathname = usePathname() ?? "/administration";
  const activeLocation = findAdminNavigationLocation(pathname);
  const activeDomain =
    activeLocation?.domain ?? findAdminNavigationDomainByPathname(pathname);

  if (!expanded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin-auto">
        <Link
          href="/administration"
          title="Administration"
          aria-label="Administration"
          className={cn(
            ROUTE_MENU_NAV_ITEM_CLASS,
            pathname === "/administration" && "shell-active-pill",
          )}
        >
          <span className="shell-nav-icon">
            <IconResolver
              iconName="ShieldCheck"
              size={ROUTE_MENU_ICON_SIZE}
              style={{
                width: ROUTE_MENU_ICON_SIZE,
                height: ROUTE_MENU_ICON_SIZE,
                strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
              }}
            />
          </span>
          <span className="shell-nav-label">Administration</span>
        </Link>

        {adminNavigationRegistry.map((domain) => (
          <Link
            key={domain.name}
            href={adminDomainHref(domain)}
            target={domain.slug === "launchpad" ? "_blank" : undefined}
            rel={
              domain.slug === "launchpad" ? "noopener noreferrer" : undefined
            }
            title={domain.name}
            aria-label={domain.name}
            className={cn(
              ROUTE_MENU_NAV_ITEM_CLASS,
              activeDomain?.name === domain.name && "shell-active-pill",
            )}
          >
            <span className="shell-nav-icon">
              <IconResolver
                iconName={domain.iconName}
                size={ROUTE_MENU_ICON_SIZE}
                style={{
                  width: ROUTE_MENU_ICON_SIZE,
                  height: ROUTE_MENU_ICON_SIZE,
                  strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
                }}
              />
            </span>
            <span className="shell-nav-label">{domain.name}</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="px-1 pb-2">
        <div className="px-1.5 py-2 text-xs uppercase tracking-[0.12em] text-foreground">
          Overview
        </div>
        <Link
          href="/administration"
          aria-current={pathname === "/administration" ? "page" : undefined}
          className={cn(
            "flex min-h-8 items-center gap-3 rounded px-1.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
            pathname === "/administration" &&
              "bg-accent text-accent-foreground",
          )}
        >
          <IconResolver
            iconName="LayoutDashboard"
            className="shrink-0"
            size={ROUTE_MENU_ICON_SIZE}
            style={{
              width: ROUTE_MENU_ICON_SIZE,
              height: ROUTE_MENU_ICON_SIZE,
              strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
            }}
          />
          <span className="min-w-0 flex-1 truncate">Dashboard</span>
        </Link>
        <Link
          href={ADMIN_LAUNCHPAD_PATH}
          target="_blank"
          rel="noopener noreferrer"
          aria-current={pathname === ADMIN_LAUNCHPAD_PATH ? "page" : undefined}
          className={cn(
            "mt-1 flex min-h-8 items-center gap-3 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-1.5 text-sm text-sky-700 transition-colors hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300",
            pathname === ADMIN_LAUNCHPAD_PATH && "bg-sky-500/20",
          )}
        >
          <IconResolver
            iconName="Rocket"
            className="shrink-0"
            size={ROUTE_MENU_ICON_SIZE}
            style={{
              width: ROUTE_MENU_ICON_SIZE,
              height: ROUTE_MENU_ICON_SIZE,
              strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
            }}
          />
          <span className="min-w-0 flex-1 truncate">Launchpad</span>
          <IconResolver iconName="ArrowUpRight" className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 scrollbar-thin-auto">
        {adminNavigationRegistry
          .filter((domain) => domain.slug !== "launchpad")
          .map((domain) => {
            const domainActive = activeDomain?.name === domain.name;
            return (
              <details
                key={domain.name}
                className="group/admin-domain border-t border-border"
                open={domainActive || undefined}
              >
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-1.5 py-2 text-xs uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 truncate">{domain.name}</span>
                  <IconResolver
                    iconName="ChevronDown"
                    className="h-4 w-4 shrink-0 transition-transform group-open/admin-domain:rotate-180"
                  />
                </summary>

                <div className="pb-2">
                  {domain.sections.flatMap((section) =>
                    section.destinations.map((item) => {
                      const active = destinationOwnsPathname(item, pathname);
                      return (
                        <Link
                          key={item.link}
                          href={item.link}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex min-h-8 items-center gap-3 rounded px-1.5 py-1.5 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                            active && "bg-accent text-accent-foreground",
                          )}
                        >
                          <IconResolver
                            iconName={item.iconName}
                            className="shrink-0"
                            size={ROUTE_MENU_ICON_SIZE}
                            style={{
                              width: ROUTE_MENU_ICON_SIZE,
                              height: ROUTE_MENU_ICON_SIZE,
                              strokeWidth: ROUTE_MENU_ICON_STROKE_WIDTH,
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {item.title}
                          </span>
                        </Link>
                      );
                    }),
                  )}
                </div>
              </details>
            );
          })}
      </div>
    </div>
  );
}
