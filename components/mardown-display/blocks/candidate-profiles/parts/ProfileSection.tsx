// ProfileSection.jsx
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Briefcase, MapPin, DollarSign, Calendar, MoreHorizontal, Edit, Trash, Plus, Trophy, ChevronUp, ChevronDown } from "lucide-react";
import ExperienceItem from "./ExperienceItem";
import ProfileItem from "./ProfileItem";
import { ProfileSectionType, ExperienceItemType, ProfileItemType } from "../parseMarkdownProfile";

// Props interface
type ProfileSectionProps = {
  section: ProfileSectionType;
  expandedSections: Record<string, boolean>;
  toggleSection: (sectionId: string) => void;
  openEditModal: (
    type: "section" | "experience" | "item",
    item: ProfileSectionType | ExperienceItemType | ProfileItemType,
    action?: "edit" | "add",
    parentId?: string
  ) => void;
  deleteItem: (type: "section" | "experience" | "item", itemId: string) => void;
  editable: boolean;
};

const ProfileSection = ({
  section,
  expandedSections,
  toggleSection,
  openEditModal,
  deleteItem,
  editable,
}: ProfileSectionProps) => {
  // Helper function to render content with highlighting
  const renderContent = (content: string) => {
    if (!content) return null;
    return (
      <span
        dangerouslySetInnerHTML={{
          __html: content.replace(/<b>(.*?)<\/b>/g, '<span class="font-semibold text-primary">$1</span>'),
        }}
      />
    );
  };

  const getSectionIcon = (type: string) => {
    const sectionTitle = type.toLowerCase();
    
    if (sectionTitle === "additional accomplishments") {
      return <Trophy className="h-5 w-5" />;
    }
    
    switch (sectionTitle) {
      case "experience":
      case "key experience":
        return <Briefcase className="h-5 w-5" />;
      case "location":
        return <MapPin className="h-5 w-5" />;
      case "compensation":
      case "compensation expectation":
        return <DollarSign className="h-5 w-5" />;
      case "availability":
      case "availability for interview":
        return <Calendar className="h-5 w-5" />;
      default:
        return null;
    }
  };

  const handleSectionClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on the dropdown menu
    if ((e.target as HTMLElement).closest('.dropdown-trigger')) {
      return;
    }
    toggleSection(section.id);
  };

  const sectionMenuItems: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "profile-section-edit",
      label: "Edit Section",
      icon: Edit,
      onSelect: () => openEditModal("section", section),
    },
    {
      kind: "item",
      id: "profile-section-delete",
      label: "Delete Section",
      icon: Trash,
      destructive: true,
      onSelect: () => deleteItem("section", section.id),
    },
    { kind: "separator", id: "profile-section-sep-add" },
  ];
  if (section.type === "experience") {
    sectionMenuItems.push({
      kind: "item",
      id: "profile-section-add-experience",
      label: "Add Experience",
      icon: Plus,
      onSelect: () => {
        const newExp: ExperienceItemType = {
          id: "temp-new",
          title: "",
          company: "",
          details: [],
        };
        openEditModal("experience", newExp, "add", section.id);
      },
    });
  }
  sectionMenuItems.push({
    kind: "item",
    id: "profile-section-add-item",
    label: "Add Item",
    icon: Plus,
    onSelect: () => {
      const newItem: ProfileItemType = {
        id: "temp-new",
        content: "",
      };
      openEditModal("item", newItem, "add", section.id);
    },
  });
  const extraSections: ContextMenuExtraSection[] = [
    { id: "profile-section-actions", anchor: "after-clipboard", items: sectionMenuItems },
  ];

  return (
    <NonEditableContextMenu
      sourceFeature="assistant-message"
      contextData={{ content: section.title }}
      extraSections={extraSections}
      enableFloatingIcon={false}
    >
        <div className="space-y-5 mb-6">
          <div 
            className="flex items-center justify-between border-b pb-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-md group cursor-pointer"
            onClick={handleSectionClick}
          >
            <div className="flex items-center space-x-3 py-1 px-2 w-full">
              <div className="text-primary">
                {getSectionIcon(section.title)}
              </div>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              <div className="ml-1">
                {expandedSections[section.id] ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground opacity-100 group-hover:opacity-100" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground opacity-70 group-hover:opacity-100" />
                )}
              </div>
            </div>
            
            {editable && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 ml-2 dropdown-trigger"
                    onClick={(e) => e.stopPropagation()} // Prevent section toggle
                  >
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => openEditModal("section", section)}>
                    <Edit className="h-4 w-4 mr-2" /> Edit Section
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => deleteItem("section", section.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash className="h-4 w-4 mr-2" /> Delete Section
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {section.type === "experience" && (
                    <DropdownMenuItem
                      onClick={() => {
                        const newExp: ExperienceItemType = {
                          id: "temp-new",
                          title: "",
                          company: "",
                          details: [],
                        };
                        openEditModal("experience", newExp, "add", section.id);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Experience
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      const newItem: ProfileItemType = {
                        id: "temp-new",
                        content: "",
                      };
                      openEditModal("item", newItem, "add", section.id);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          {expandedSections[section.id] && (
            <div className="pl-2 space-y-5">
              {/* Section content */}
              {section.content && (
                <p className="text-sm text-muted-foreground mb-4">{renderContent(section.content)}</p>
              )}
              {/* Experience type sections with companies and roles */}
              {section.type === "experience" &&
                section.experiences &&
                section.experiences.length > 0 &&
                section.experiences.map((exp) => (
                  <ExperienceItem
                    key={exp.id}
                    experience={exp}
                    sectionId={section.id}
                    openEditModal={openEditModal}
                    deleteItem={deleteItem}
                    editable={editable}
                    renderContent={renderContent}
                  />
                ))}
              {/* Regular items for other section types */}
              {section.type !== "experience" &&
                section.items &&
                section.items.map((item) => (
                  <ProfileItem
                    key={item.id}
                    item={item}
                    openEditModal={openEditModal}
                    deleteItem={deleteItem}
                    editable={editable}
                    renderContent={renderContent}
                  />
                ))}
            </div>
          )}
        </div>
    </NonEditableContextMenu>
  );
};

export default ProfileSection;