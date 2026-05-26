// config.ts
// This file extracts navigation data from categories.tsx for use in the ModuleHeader

import { ModulePage } from "@/components/matrx/navigation/types";
import { adminCategories } from "./categories";

/**
 * Transforms admin categories into ModulePage format for navigation
 * Extracts all features with 'link' property and converts them to pages
 */
function extractPagesFromCategories(): ModulePage[] {
    const pages: ModulePage[] = [];
    
    adminCategories.forEach(category => {
        category.features.forEach(feature => {
            // Only include features that have a link (actual pages)
            if (feature.link) {
                pages.push({
                    title: feature.title,
                    path: feature.link.replace('/administration/', ''), // Make path relative
                    relative: true,
                    description: feature.description,
                    icon: feature.icon,
                });
            }
        });
    });
    
    return pages;
}

// Export the extracted pages
export const pages = extractPagesFromCategories();

// Filter out any invalid pages (legacy support)
export const filteredPages = pages.filter(page => page.path !== 'link-here');

// Module configuration
export const MODULE_HOME = '/administration';
export const MODULE_NAME = 'Administration';
