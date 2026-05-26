// DEPRECATED — This module is scheduled for deletion.
// Stubbed to avoid entity system crashes during the entity lazy-loading migration.

import type { UnifiedLayoutProps } from "@/components/matrx/Entity/prewired-components/layouts/types";

export const temptDefaults = {
  currentMode: "default",
  version: 1,
};

export const getLayoutOptions = (): UnifiedLayoutProps | null => {
    try {
        const { getSimplifiedLayoutProps } = require("@/app/entities/layout/configs");
        return getSimplifiedLayoutProps({
            entityKey: 'recipe',
            formComponent: 'MINIMAL',
            quickReferenceType: 'LIST',
            isExpanded: true,
            handlers: {},
            excludeFields: ['id'],
            defaultShownFields: ['name', 'status', 'isPublic', 'description', 'tags', 'version'],
            density: 'compact',
            size: 'sm',
        });
    } catch {
        return null;
    }
};
