/**
 * categories.tsx — DASHBOARD VIEW-LAYER over the admin catalog.
 *
 * The catalog data (titles, descriptions, links, icon NAMES) is the single
 * source of truth in `@/features/admin/constants/admin-categories`. This file
 * decorates each entry with a rendered <IconResolver> element so the existing
 * dashboard grid, nav tree, and module header keep consuming `.icon` JSX
 * exactly as before. Do NOT add catalog entries here — edit the pure-data file.
 */

import React from "react";
import IconResolver from "@/components/official/icons/IconResolver";
import { adminCategoriesData } from "@/features/admin/constants/admin-categories";

export const adminCategories = adminCategoriesData.map((category) => ({
  name: category.name,
  iconColor: category.iconColor,
  icon: <IconResolver iconName={category.iconName} className="w-6 h-6" />,
  features: category.features.map((feature) => ({
    title: feature.title,
    description: feature.description,
    link: feature.link,
    isNew: feature.isNew,
    icon: <IconResolver iconName={feature.iconName} />,
  })),
}));
