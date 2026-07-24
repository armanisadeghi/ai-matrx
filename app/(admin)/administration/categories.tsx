/**
 * categories.tsx — React view-layer over the canonical admin hierarchy.
 *
 * Do not add or organize entries here. Edit `admin-navigation.ts`; this file
 * only decorates its icon names with rendered <IconResolver> elements.
 */

import React from "react";
import IconResolver from "@/components/official/icons/IconResolver";
import { adminNavigationRegistry } from "@/features/admin/constants/admin-navigation";

export const adminNavigation = adminNavigationRegistry.map((domain) => ({
  name: domain.name,
  slug: domain.slug,
  iconColor: domain.iconColor,
  icon: <IconResolver iconName={domain.iconName} className="w-6 h-6" />,
  sections: domain.sections.map((section) => ({
    name: section.name,
    icon: <IconResolver iconName={section.iconName} className="w-5 h-5" />,
    destinations: section.destinations.map((item) => ({
      title: item.title,
      description: item.description,
      link: item.link,
      isNew: item.isNew,
      icon: <IconResolver iconName={item.iconName} />,
    })),
  })),
}));
