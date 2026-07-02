/**
 * Recipes List Configuration
 * 
 * Configuration for the UnifiedListLayout system for the recipes route.
 */

import { ChefHat, Plus, ArrowRightLeft } from "lucide-react";
import { UnifiedListLayoutConfig } from "@/components/official/unified-list/types";
import { extractUniqueTags, extractUniqueValues } from "@/components/official/unified-list/utils";

// Recipe type matching the database schema
export interface Recipe {
    id: string;
    name: string;
    description?: string;
    tags?: unknown;
    status?: string;
    [key: string]: unknown;
}

/**
 * Main configuration for recipes list layout
 */
export const recipesConfig: UnifiedListLayoutConfig<Recipe> = {
    // Page Identity
    page: {
        title: "AI Recipes",
        icon: ChefHat,
        description: "Manage and convert your AI recipes",
        emptyMessage: "No recipes found. Create your first recipe to get started!",
        emptyAction: {
            label: "Create Recipe",
            onClick: () => {
                // This will be overridden in the component
            },
        },
    },

    // Search Configuration
    search: {
        enabled: true,
        placeholder: "Search recipes by name or description...",
        filterFn: (recipe, searchTerm) => {
            const nameLower = recipe.name.toLowerCase();
            const descLower = recipe.description?.toLowerCase() || "";
            return (
                nameLower.includes(searchTerm) ||
                descLower.includes(searchTerm)
            );
        },
    },

    // Filter Configuration
    filters: {
        sortOptions: [
            {
                value: "name-asc",
                label: "Name (A-Z)",
                sortFn: (a, b) => a.name.localeCompare(b.name),
            },
            {
                value: "name-desc",
                label: "Name (Z-A)",
                sortFn: (a, b) => b.name.localeCompare(a.name),
            },
            {
                value: "status",
                label: "Status",
                sortFn: (a, b) => (a.status || "").localeCompare(b.status || ""),
            },
        ],
        defaultSort: "name-asc",
        customFilters: [
            {
                id: "status",
                label: "Status",
                type: "select",
                extractOptions: (items) => {
                    const statuses = extractUniqueValues(items, "status");
                    return [
                        { value: "all", label: "All Statuses" },
                        ...statuses.map((status) => ({
                            value: status,
                            label: status
                                .replace(/_/g, " ")
                                .replace(/\b\w/g, (l) => l.toUpperCase()),
                        })),
                    ];
                },
                filterFn: (recipe, value) => {
                    if (value === "all") return true;
                    return recipe.status === value;
                },
                defaultValue: "all",
            },
            {
                id: "tags",
                label: "Tags",
                type: "tags",
                extractOptions: (items) => {
                    const tags = extractUniqueTags(items, "tags");
                    return tags.map((tag) => ({ value: tag, label: tag }));
                },
                filterFn: (recipe, selectedTags) => {
                    if (!Array.isArray(selectedTags) || selectedTags.length === 0) {
                        return true;
                    }

                    try {
                        const recipeTags =
                            typeof recipe.tags === "string"
                                ? JSON.parse(recipe.tags)
                                : recipe.tags;

                        const tagArray = Array.isArray(recipeTags)
                            ? recipeTags
                            : recipeTags?.tags || [];

                        return selectedTags.every((tag) => tagArray.includes(tag));
                    } catch (e) {
                        return false;
                    }
                },
                defaultValue: [],
            },
        ],
    },

    // Actions Configuration
    actions: [
        {
            id: "new",
            label: "New Recipe",
            icon: Plus,
            variant: "primary",
            showOnMobile: true,
            showOnDesktop: true,
            onClick: () => {
                // This will be overridden in the component
            },
        },
    ],

    // Layout Options
    layout: {
        gridCols: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        gap: "gap-6",
    },

    // Item Actions (CRUD operations)
    itemActions: {
        onView: (id) => {
            // This will be overridden in the component
        },
        onEdit: (id) => {
            // This will be overridden in the component
        },
        onDelete: async (id) => {
            // This will be overridden in the component
        },
        onDuplicate: async (id) => {
            // This will be overridden in the component
        },
        customActions: [
            {
                id: "convert",
                icon: ArrowRightLeft,
                label: "Convert to Prompt",
                tooltip: "Convert this recipe to a prompt",
                onClick: (recipe) => {
                    // This will be overridden in the component
                },
            },
        ],
        deleteConfirmation: {
            title: "Delete Recipe",
            message: (name) =>
                `Are you sure you want to delete "${name}"? This action cannot be undone and will permanently remove the recipe and all its compiled versions.`,
            confirmLabel: "Delete Recipe",
            cancelLabel: "Cancel",
        },
    },

    // Voice Configuration
    voice: {
        enabled: true,
        autoTranscribe: true,
    },
};

