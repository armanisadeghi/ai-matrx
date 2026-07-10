import { Save, Trash2, Pencil } from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

/**
 * CMS-component-specific menu items injected into the canonical v3 context
 * menu via `extraSections`. The host (`ComponentsPage`) owns the handlers +
 * state — this stays a pure description, same pattern as
 * `cmsPageExtraSections.ts`.
 */
export interface CmsComponentExtraSectionsConfig {
  /** True while this component's HTML/CSS is open for edit. */
  isEditing: boolean;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function createCmsComponentExtraSections(
  config: CmsComponentExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const { isEditing, onSave, onEdit, onDelete } = config;

  const items: ContextMenuExtraItem[] = isEditing
    ? [
        {
          kind: "item",
          id: "save-component",
          label: "Save",
          icon: Save,
          onSelect: onSave,
        },
      ]
    : [
        {
          kind: "item",
          id: "edit-component",
          label: "Edit",
          icon: Pencil,
          onSelect: onEdit,
        },
      ];

  items.push(
    { kind: "separator", id: "component-danger-sep" },
    {
      kind: "item",
      id: "delete-component",
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onSelect: onDelete,
    },
  );

  return [
    {
      id: "cms-component-ops",
      label: "Component",
      anchor: "after-compare",
      items,
    },
  ];
}
