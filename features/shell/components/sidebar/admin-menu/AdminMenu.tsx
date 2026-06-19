"use client";

/**
 * AdminMenu — desktop 3-layer admin cascade for the sidebar.
 *
 *   Layer 1: the "Administration" nav item (this trigger)
 *   Layer 2: flyout listing every admin category
 *   Layer 3: per-category submenu of tools
 *
 * Lives in a lazy chunk (loaded by AdminSidebarSection only for admins), so the
 * catalog data and IconResolver never touch the main bundle. Icons resolve by
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
import { adminCategoriesData } from "@/features/admin/constants/admin-categories";
import { ADMIN_APP_URL } from "@/features/shell/constants/nav-data";

const iconSlot =
  "flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground [&>svg]:h-4 [&>svg]:w-4 [&>svg]:max-w-none";

export default function AdminMenu() {
  const pathname = usePathname() ?? "";

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
        className="max-h-[80vh] w-60 overflow-y-auto"
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

        {adminCategoriesData.map((category) => (
          <DropdownMenuSub key={category.name}>
            <DropdownMenuSubTrigger className="gap-2">
              <span className={iconSlot}>
                <IconResolver iconName={category.iconName} />
              </span>
              <span className="flex-1 truncate">{category.name}</span>
              <span className="text-xs text-muted-foreground">
                {category.features.length}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent className="max-h-[80vh] w-72 overflow-y-auto">
                {category.features.map((feature) => {
                  const active = pathname === feature.link;
                  return (
                    <DropdownMenuItem
                      key={feature.link}
                      asChild
                      className={cn("gap-2", active && "bg-accent/60")}
                    >
                      <Link href={feature.link}>
                        <span className={iconSlot}>
                          <IconResolver iconName={feature.iconName} />
                        </span>
                        <span className="flex-1 truncate">{feature.title}</span>
                        {feature.isNew && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                            New
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
