"use client";

/**
 * AdminMobileMenu — Administration hierarchy for the mobile side sheet.
 *
 * Mobile gets a stacked accordion (no nested flyouts): each domain is a
 * <details> that expands its sections and destinations inline. Lives in a lazy chunk loaded by
 * AdminMobileMenuItem only for admins. Icons resolve by name via IconResolver.
 */

import AppLink from "@/components/navigation/AppLink";
import { IconResolver } from "@ai-matrx/icons";
import { ADMIN_LAUNCHPAD_PATH } from "@/features/admin/constants/admin-categories";
import {
  adminDomainHref,
  adminMenuDomains,
  adminMenuPathname,
  destinationOwnsPathname,
  findAdminNavigationDomainByPathname,
} from "@/features/admin/constants/admin-navigation";
import { ADMIN_APP_URL } from "@/features/shell/constants/nav-data";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toggleOverlay } from "@/lib/redux/slices/overlaySlice";
import { ERROR_INSPECTOR_OVERLAY_ID } from "@/features/admin/error-inspector/useOpenErrorInspector";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import { usePathname } from "next/navigation";

export default function AdminMobileMenu() {
  const dispatch = useAppDispatch();
  const pathname = usePathname() ?? "";
  const menuPathname = adminMenuPathname(pathname);
  const activeDomain = findAdminNavigationDomainByPathname(menuPathname);
  return (
    <>
      <div className="shell-mobile-section-divider" />
      <div className="shell-mobile-section-label">Admin</div>

      <AppLink
        href="/administration"
        data-nav-href="/administration"
        aria-current={pathname === "/administration" ? "page" : undefined}
        data-active={pathname === "/administration" ? "true" : undefined}
        className="shell-mobile-nav-item"
        onClick={closeShellMobileMenu}
      >
        <span className="shell-nav-icon">
          <IconResolver iconName="ShieldCheck" className="h-5 w-5" />
        </span>
        <span>Admin Dashboard</span>
      </AppLink>

      <AppLink
        href={ADMIN_LAUNCHPAD_PATH}
        target="_blank"
        rel="noopener noreferrer"
        aria-current={pathname === ADMIN_LAUNCHPAD_PATH ? "page" : undefined}
        data-active={pathname === ADMIN_LAUNCHPAD_PATH ? "true" : undefined}
        className="shell-mobile-nav-item"
        onClick={closeShellMobileMenu}
      >
        <span className="shell-nav-icon">
          <IconResolver iconName="Rocket" className="h-5 w-5" />
        </span>
        <span className="flex-1 font-medium">Admin Launchpad</span>
        <IconResolver iconName="ArrowUpRight" className="h-4 w-4" />
      </AppLink>

      <button
        type="button"
        className="shell-mobile-nav-item w-full"
        onClick={() => {
          dispatch(toggleOverlay({ overlayId: ERROR_INSPECTOR_OVERLAY_ID }));
          closeShellMobileMenu();
        }}
      >
        <span className="shell-nav-icon text-amber-500">
          <IconResolver iconName="AlertTriangle" className="h-5 w-5" />
        </span>
        <span>Error Inspector</span>
      </button>

      <a
        href={ADMIN_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shell-mobile-nav-item"
        onClick={closeShellMobileMenu}
      >
        <span className="shell-nav-icon text-emerald-500 dark:text-emerald-400">
          <IconResolver iconName="Gauge" className="h-5 w-5" />
        </span>
        <span className="flex-1 font-medium text-emerald-600 dark:text-emerald-400">
          Admin Console
        </span>
        <IconResolver
          iconName="ArrowUpRight"
          className="h-4 w-4 text-emerald-500/70 dark:text-emerald-400/70"
        />
      </a>

      {adminMenuDomains
        .filter((domain) => domain.slug !== "launchpad")
        .map((domain) => (
          <details
            key={domain.name}
            className="shell-mobile-nav-group"
            open={activeDomain?.name === domain.name || undefined}
          >
            <summary className="shell-mobile-nav-item list-none [&::-webkit-details-marker]:hidden">
              <span className="shell-nav-icon">
                <IconResolver iconName={domain.iconName} className="h-5 w-5" />
              </span>
              <span className="flex-1">{domain.name}</span>
              <span className="text-xs text-muted-foreground">
                {domain.sections.reduce(
                  (count, section) => count + section.destinations.length,
                  0,
                )}
              </span>
              <IconResolver
                iconName="ChevronDown"
                className="shell-mobile-admin-caret ml-1 h-4 w-4 transition-transform"
              />
            </summary>
            <div className="shell-mobile-nav-children">
              <AppLink
                href={adminDomainHref(domain)}
                data-nav-href={adminDomainHref(domain)}
                data-active={
                  pathname === adminDomainHref(domain) ? "true" : undefined
                }
                aria-current={
                  pathname === adminDomainHref(domain) ? "page" : undefined
                }
                className="shell-mobile-nav-item shell-mobile-nav-child font-medium"
                onClick={closeShellMobileMenu}
              >
                <span className="shell-nav-icon">
                  <IconResolver
                    iconName={domain.iconName}
                    className="h-[18px] w-[18px]"
                  />
                </span>
                <span>{domain.name} overview</span>
              </AppLink>
              {domain.sections.map((section) => (
                <div key={section.name}>
                  <div className="flex items-center gap-2 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <IconResolver
                      iconName={section.iconName}
                      className="h-3 w-3"
                    />
                    <span>{section.name}</span>
                  </div>
                  {section.destinations.map((item) => {
                    const active = destinationOwnsPathname(item, menuPathname);
                    return (
                      <AppLink
                        key={item.link}
                        href={item.link}
                        data-nav-href={item.link}
                        data-active={active ? "true" : undefined}
                        aria-current={active ? "page" : undefined}
                        className="shell-mobile-nav-item shell-mobile-nav-child"
                        onClick={closeShellMobileMenu}
                      >
                        <span className="shell-nav-icon">
                          <IconResolver
                            iconName={item.iconName}
                            className="h-[18px] w-[18px]"
                          />
                        </span>
                        <span>{item.title}</span>
                      </AppLink>
                    );
                  })}
                </div>
              ))}
            </div>
          </details>
        ))}
    </>
  );
}
