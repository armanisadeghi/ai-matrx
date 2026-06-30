// utils/icon-mapper.tsx

import React from "react";
import { getIconComponent } from "@/components/official/icons/IconResolver";
import { isLucideModuleIconExport } from "@/utils/icons/lucide-module-icon";
import {
  Code,
  Zap,
  Settings,
  Globe,
  Database,
  Search,
  Type,
  MapPin,
  FileText,
  Wrench,
} from "lucide-react";

// Simple fallback icons based on category
const FALLBACK_ICONS: Record<string, React.ReactNode> = {
  code: <Code size={20} />,
  api: <Zap size={20} />,
  core: <Settings size={20} />,
  web: <Globe size={20} />,
  data: <Database size={20} />,
  seo: <Search size={20} />,
  text: <Type size={20} />,
  location: <MapPin size={20} />,
  files: <FileText size={20} />,
  default: <Wrench size={20} />,
};

/**
 * Maps an icon string from the database to a React icon component
 *
 * @param iconName - The icon name from the database (e.g., "Eye", "Play", "Database")
 * @param category - The tool category for fallback mapping
 * @param size - The icon size (default: 20)
 * @returns React icon component
 */
export function mapIcon(
  iconName?: string | null,
  category?: string | null,
  size: number = 20,
): React.ReactNode {
  // Try to map by icon name from database
  if (iconName && typeof iconName === "string") {
    // Clean the icon name - ensure it's in PascalCase format
    const cleanIconName = iconName
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());

    // Get icon component from IconResolver
    const IconComponent = getIconComponent(cleanIconName, "Wrench");

    if (IconComponent) {
      return <IconComponent size={size} />;
    }
  }

  // Fallback to category-based icon
  if (category && FALLBACK_ICONS[category.toLowerCase()]) {
    return FALLBACK_ICONS[category.toLowerCase()];
  }

  // Final fallback to default icon
  return FALLBACK_ICONS.default;
}

/**
 * Get all available Lucide icon names for reference
 * Note: This function now uses dynamic imports. If you need synchronous access,
 * consider using the icon-picker component which handles this internally.
 */
export async function getAvailableIconNames(): Promise<string[]> {
  const LucideIcons = (await import("lucide-react")) as Record<string, unknown>;
  return Object.keys(LucideIcons).filter((key) =>
    isLucideModuleIconExport(key, LucideIcons[key]),
  );
}

/**
 * Check if an icon name is valid
 * Note: This function now uses dynamic imports. For synchronous validation,
 * use getIconComponent and check if it returns a component.
 */
export async function isValidIconName(iconName: string): Promise<boolean> {
  const cleanIconName = iconName
    .replace(/\s+/g, "")
    .replace(/^\w/, (c) => c.toUpperCase());
  try {
    const LucideIcons = (await import("lucide-react")) as Record<
      string,
      unknown
    >;
    return isLucideModuleIconExport(cleanIconName, LucideIcons[cleanIconName]);
  } catch {
    return false;
  }
}
