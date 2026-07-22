// ProfileItem.tsx
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { Button } from "@/components/ui/button";
import { Edit, Trash } from "lucide-react";
import { ExperienceItemType, ProfileItemType, ProfileSectionType } from "../parseMarkdownProfile";

// Props interface
type ProfileItemProps = {
  item: ProfileItemType;
  openEditModal: (
    type: "section" | "experience" | "item",
    item: ProfileSectionType | ExperienceItemType | ProfileItemType,
    action?: "edit" | "add",
    parentId?: string
  ) => void;
  deleteItem: (type: "section" | "experience" | "item", itemId: string) => void;
  editable: boolean;
  renderContent: (content: string) => React.ReactNode;
};

const ProfileItem = ({
  item,
  openEditModal,
  deleteItem,
  editable,
  renderContent,
}: ProfileItemProps) => {
  const extraSections: ContextMenuExtraSection[] = [
    {
      id: "profile-item-actions",
      anchor: "after-clipboard",
      items: [
        {
          kind: "item",
          id: "profile-item-edit",
          label: "Edit Item",
          icon: Edit,
          onSelect: () => openEditModal("item", item),
        },
        {
          kind: "item",
          id: "profile-item-delete",
          label: "Delete Item",
          icon: Trash,
          destructive: true,
          onSelect: () => deleteItem("item", item.id),
        },
      ],
    },
  ];

  return (
    <NonEditableContextMenu
      sourceFeature="assistant-message"
      contextData={{ content: item.content }}
      extraSections={extraSections}
      enableFloatingIcon={false}
    >
        <div className="relative group mb-3">
          <div className="flex items-start gap-3">
            <div className="min-w-4 mt-1 text-muted-foreground">•</div>
            <div className="flex-1 text-sm">{renderContent(item.content)}</div>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mr-2"
                onClick={() => openEditModal("item", item)}
              >
                <Edit className="h-3 w-3" />
                <span className="sr-only">Edit</span>
              </Button>
            )}
          </div>
        </div>
    </NonEditableContextMenu>
  );
};

export default ProfileItem;
