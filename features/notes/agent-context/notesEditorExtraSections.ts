import { toast } from "sonner";
import { Save, Download, FolderInput, Trash2 } from "lucide-react";
import type { ContextMenuExtraSection } from "@/features/context-menu-v2/extraSections";

/**
 * Note-specific menu items injected via `extraSections` (target wiring).
 * The core menu renders these; the notes wrapper only describes them.
 */
export function createNotesEditorExtraSections(): ContextMenuExtraSection[] {
  return [
    {
      id: "notes-ops",
      label: "Note",
      anchor: "after-compare",
      items: [
        {
          kind: "item",
          id: "save",
          label: "Save",
          icon: Save,
          hint: "⌘S",
          onSelect: () => toast.success("Save note"),
        },
        {
          kind: "item",
          id: "export",
          label: "Export as Markdown",
          icon: Download,
          onSelect: () => toast.success("Export note"),
        },
        {
          kind: "submenu",
          id: "move",
          label: "Move to Folder",
          icon: FolderInput,
          children: [
            {
              kind: "item",
              id: "move-inbox",
              label: "Inbox",
              onSelect: () => toast.success("Moved to Inbox"),
            },
            {
              kind: "item",
              id: "move-archive",
              label: "Archive",
              onSelect: () => toast.success("Moved to Archive"),
            },
          ],
        },
        { kind: "separator", id: "sep" },
        {
          kind: "item",
          id: "delete",
          label: "Delete Note",
          icon: Trash2,
          destructive: true,
          onSelect: () => toast.error("Delete note"),
        },
      ],
    },
  ];
}
