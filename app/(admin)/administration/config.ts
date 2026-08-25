// config.ts
// ModuleHeader compatibility projection of the canonical admin hierarchy.

import { ModulePage } from "@/components/matrx/navigation/types";
import { adminNavigation } from "./categories";

/**
 * Transforms admin categories into ModulePage format for navigation
 * Extracts all features with 'link' property and converts them to pages
 */
function extractPagesFromNavigation(): ModulePage[] {
  return adminNavigation.flatMap((domain) =>
    domain.sections.flatMap((section) =>
      section.destinations.map((item) => {
        const isAdministrationRoute = item.link.startsWith("/administration/");
        return {
          title: item.title,
          path: isAdministrationRoute
            ? item.link.replace("/administration/", "")
            : item.link,
          relative: isAdministrationRoute,
          description: item.description,
          icon: item.icon,
        };
      }),
    ),
  );
}

// Export the extracted pages
export const pages = extractPagesFromNavigation();

// Filter out any invalid pages (legacy support), then sort A–Z for the header dropdown
export const filteredPages = pages
  .filter((page) => page.path !== "link-here")
  .sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
  );

// Module configuration
export const MODULE_HOME = "/administration";
export const MODULE_NAME = "Administration";
