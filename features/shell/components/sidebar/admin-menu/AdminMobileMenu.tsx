"use client";

/**
 * AdminMobileMenu — admin catalog for the mobile side sheet.
 *
 * Mobile gets a stacked accordion (no nested flyouts): each category is a
 * <details> that expands its tools inline. Lives in a lazy chunk loaded by
 * AdminMobileMenuItem only for admins. Icons resolve by name via IconResolver.
 */

import Link from "next/link";
import IconResolver from "@/components/official/icons/IconResolver";
import { adminCategoriesData } from "@/features/admin/constants/admin-categories";
import { ADMIN_APP_URL } from "@/features/shell/constants/nav-data";

function closeSheet() {
  const checkbox = document.getElementById(
    "shell-mobile-menu",
  ) as HTMLInputElement | null;
  if (checkbox) checkbox.checked = false;
}

export default function AdminMobileMenu() {
  return (
    <>
      <div className="shell-mobile-section-divider" />
      <div className="shell-mobile-section-label">Admin</div>

      <Link
        href="/administration"
        data-nav-href="/administration"
        className="shell-mobile-nav-item"
        onClick={closeSheet}
      >
        <span className="shell-nav-icon">
          <IconResolver iconName="ShieldCheck" className="h-5 w-5" />
        </span>
        <span>Admin Dashboard</span>
      </Link>

      <a
        href={ADMIN_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="shell-mobile-nav-item"
        onClick={closeSheet}
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

      {adminCategoriesData.map((category) => (
        <details key={category.name} className="shell-mobile-nav-group">
          <summary className="shell-mobile-nav-item list-none [&::-webkit-details-marker]:hidden">
            <span className="shell-nav-icon">
              <IconResolver iconName={category.iconName} className="h-5 w-5" />
            </span>
            <span className="flex-1">{category.name}</span>
            <span className="text-xs text-muted-foreground">
              {category.features.length}
            </span>
            <IconResolver
              iconName="ChevronDown"
              className="shell-mobile-admin-caret ml-1 h-4 w-4 transition-transform"
            />
          </summary>
          <div className="shell-mobile-nav-children">
            {category.features.map((feature) => (
              <Link
                key={feature.link}
                href={feature.link}
                data-nav-href={feature.link}
                className="shell-mobile-nav-item shell-mobile-nav-child"
                onClick={closeSheet}
              >
                <span className="shell-nav-icon">
                  <IconResolver
                    iconName={feature.iconName}
                    className="h-[18px] w-[18px]"
                  />
                </span>
                <span>{feature.title}</span>
              </Link>
            ))}
          </div>
        </details>
      ))}
    </>
  );
}
