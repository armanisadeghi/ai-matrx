"use client";

/**
 * Administration route menu rendered inside the shared AppShell sidebar.
 * RouteMenuSlot owns switching, collapse behavior, mobile presentation, and
 * the reversible Main Menu control; this component only renders registry data.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import IconResolver from "@/components/official/icons/IconResolver";
import {
  adminDomainHref,
  adminNavigationRegistry,
  destinationOwnsPathname,
  findAdminNavigationLocation,
} from "@/features/admin/constants/admin-navigation";
import { cn } from "@/lib/utils";

interface AdminRouteSidebarMenuProps {
  expanded: boolean;
}

const navRow = "shell-nav-item shell-nav-stable shell-tactile-subtle";

export default function AdminRouteSidebarMenu({
  expanded,
}: AdminRouteSidebarMenuProps) {
  const pathname = usePathname() ?? "/administration";
  const activeLocation = findAdminNavigationLocation(pathname);

  if (!expanded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin-auto">
        <Link
          href="/administration"
          title="Administration"
          aria-label="Administration"
          className={cn(
            navRow,
            pathname === "/administration" && "shell-active-pill",
          )}
        >
          <span className="shell-nav-icon">
            <IconResolver iconName="ShieldCheck" className="h-[18px] w-[18px]" />
          </span>
          <span className="shell-nav-label">Administration</span>
        </Link>

        {adminNavigationRegistry.map((domain) => (
          <Link
            key={domain.name}
            href={adminDomainHref(domain.name)}
            title={domain.name}
            aria-label={domain.name}
            className={cn(
              navRow,
              activeLocation?.domain.name === domain.name &&
                "shell-active-pill",
            )}
          >
            <span className="shell-nav-icon">
              <IconResolver
                iconName={domain.iconName}
                className="h-[18px] w-[18px]"
              />
            </span>
            <span className="shell-nav-label">{domain.name}</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link
        href="/administration"
        className={cn(
          navRow,
          pathname === "/administration" && "shell-active-pill",
        )}
      >
        <span className="shell-nav-icon">
          <IconResolver iconName="ShieldCheck" className="h-[18px] w-[18px]" />
        </span>
        <span className="shell-nav-label">Administration</span>
      </Link>

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-0.5 scrollbar-thin-auto">
        {adminNavigationRegistry.map((domain) => {
          const domainActive = activeLocation?.domain.name === domain.name;
          return (
            <details
              key={domain.name}
              className="group/admin-domain mb-0.5"
              open={domainActive || undefined}
            >
              <summary
                className={cn(
                  navRow,
                  "list-none [&::-webkit-details-marker]:hidden",
                  domainActive && "shell-active-pill",
                )}
              >
                <span className="shell-nav-icon">
                  <IconResolver
                    iconName={domain.iconName}
                    className="h-[18px] w-[18px]"
                  />
                </span>
                <span className="shell-nav-label min-w-0 flex-1 truncate">
                  {domain.name}
                </span>
                <IconResolver
                  iconName="ChevronRight"
                  className="mr-1 h-3.5 w-3.5 shrink-0 transition-transform group-open/admin-domain:rotate-90"
                />
              </summary>

              <div className="mb-1 ml-3 border-l border-border/60 pl-2">
                <Link
                  href={adminDomainHref(domain.name)}
                  className="shell-tactile-subtle block rounded px-2 py-1 text-[11px] font-medium text-primary"
                >
                  Browse {domain.name}
                </Link>
                {domain.sections.map((section) => (
                  <div key={section.name} className="py-1">
                    <div className="flex items-center gap-1.5 px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <IconResolver
                        iconName={section.iconName}
                        className="h-3 w-3"
                      />
                      <span className="truncate">{section.name}</span>
                    </div>
                    {section.destinations.map((item) => {
                      const active = destinationOwnsPathname(item, pathname);
                      return (
                        <Link
                          key={item.link}
                          href={item.link}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "shell-tactile-subtle flex min-h-7 items-center gap-1.5 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground",
                            active &&
                              "bg-[var(--shell-pill-bg)] font-semibold text-[var(--shell-pill-text)]",
                          )}
                        >
                          <IconResolver
                            iconName={item.iconName}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate">{item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
