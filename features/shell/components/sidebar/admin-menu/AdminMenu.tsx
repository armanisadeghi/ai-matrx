"use client";

/**
 * AdminMenu — Administration entry cascade for the main sidebar menu.
 *
 *   Layer 1: the "Administration" nav item (this trigger)
 *   Layer 2: flyout listing every admin domain
 *   Layer 3: per-domain sections and destinations
 *
 * Lives in a lazy chunk (loaded by AdminSidebarSection only for admins), so the
 * navigation data and IconResolver never touch the main bundle. Icons resolve by
 * name via IconResolver. Styling uses the shared shadcn dropdown (popover
 * tokens) so it matches the rest of the menu.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import IconResolver from "@/components/official/icons/IconResolver";
import {
  adminDomainHref,
  adminNavigationRegistry,
  destinationOwnsPathname,
} from "@/features/admin/constants/admin-navigation";
import { ADMIN_APP_URL } from "@/features/shell/constants/nav-data";

const iconSlot =
  "flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4 [&>svg]:max-w-none";

export default function AdminMenu() {
  const pathname = usePathname() ?? "";

  // Administration routes already replace the main nav through RouteMenuSlot.
  // Keep the footer controls, but do not render a duplicate admin-menu trigger.
  if (pathname.startsWith("/administration")) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shell-nav-item shell-tactile-subtle w-full"
          aria-label="Administration"
          data-nav-href="/administration"
        >
          <span className="shell-nav-icon">
            <IconResolver
              iconName="ShieldCheck"
              className="h-[18px] w-[18px]"
            />
          </span>
          <span className="shell-nav-label">Administration</span>
          <IconResolver
            iconName="ChevronRight"
            className="shell-nav-flyout-caret h-3.5 w-3.5"
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="max-h-[80dvh] w-60 overflow-y-auto"
      >
        <DropdownMenuLabel>Administration</DropdownMenuLabel>
        <DropdownMenuItem asChild className="gap-2">
          <Link href="/administration">
            <span className={iconSlot}>
              <IconResolver iconName="LayoutDashboard" />
            </span>
            <span className="truncate">Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="gap-2">
          <a href={ADMIN_APP_URL} target="_blank" rel="noopener noreferrer">
            <span
              className={cn(iconSlot, "text-emerald-500 dark:text-emerald-400")}
            >
              <IconResolver iconName="Gauge" />
            </span>
            <span className="flex-1 truncate font-medium text-emerald-600 dark:text-emerald-400">
              Admin Console
            </span>
            <IconResolver
              iconName="ArrowUpRight"
              className="h-3.5 w-3.5 text-emerald-500/70 dark:text-emerald-400/70"
            />
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        {adminNavigationRegistry.map((domain) => (
          <DropdownMenuSub key={domain.name}>
            <DropdownMenuSubTrigger className="gap-2">
              <span className={iconSlot}>
                <IconResolver iconName={domain.iconName} />
              </span>
              <span className="flex-1 truncate">{domain.name}</span>
              <span className="text-xs text-muted-foreground">
                {domain.sections.reduce(
                  (count, section) => count + section.destinations.length,
                  0,
                )}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-[80dvh] w-72 overflow-y-auto">
                <DropdownMenuItem asChild className="gap-2 font-medium">
                  <Link href={adminDomainHref(domain)}>
                    <span className={iconSlot}>
                      <IconResolver iconName={domain.iconName} />
                    </span>
                    <span className="flex-1 truncate">
                      {domain.name} overview
                    </span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {domain.sections.map((section, sectionIndex) => (
                  <div key={section.name}>
                    {sectionIndex > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <span className={iconSlot}>
                        <IconResolver iconName={section.iconName} />
                      </span>
                      {section.name}
                    </DropdownMenuLabel>
                    {section.destinations.map((item) => {
                      const active = destinationOwnsPathname(item, pathname);
                      return (
                        <DropdownMenuItem
                          key={item.link}
                          asChild
                          className={cn("gap-2", active && "bg-accent/60")}
                        >
                          <Link href={item.link}>
                            <span className={iconSlot}>
                              <IconResolver iconName={item.iconName} />
                            </span>
                            <span className="flex-1 truncate">{item.title}</span>
                            {item.isNew && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                                New
                              </span>
                            )}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
