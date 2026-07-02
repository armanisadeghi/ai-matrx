// ExperienceItem.jsx
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator } from "@/components/ui/context-menu/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Edit, Trash, Plus } from "lucide-react";
import { ExperienceItemType, ProfileItemType, ProfileSectionType } from "../parseMarkdownProfile";

// Props interface
type ExperienceItemProps = {
  experience: ExperienceItemType;
  sectionId: string;
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

const ExperienceItem = ({
  experience,
  sectionId,
  openEditModal,
  deleteItem,
  editable,
  renderContent,
}: ExperienceItemProps) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="space-y-4 mb-8 pl-1 w-full">
          {/* Experience Header */}
          <div className="flex items-center justify-between group w-full">
            <div className="flex-grow">
              <h4 className="font-medium text-base">
                <span className="font-semibold">{experience.company}</span>
                {experience.title && <span className="ml-1">– {experience.title}</span>}
              </h4>
            </div>
            
            {editable && (
              <div className="flex-shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => openEditModal("experience", experience)}>
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteItem("experience", experience.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        const newItem: ProfileItemType = {
                          id: "temp-new",
                          content: "",
                        };
                        openEditModal("item", newItem, "add", experience.id);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" /> Add Detail
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Experience bullet points */}
          {experience.details.length > 0 && (
            <ul className="space-y-4 list-disc list-outside text-sm ml-5 mt-2">
              {experience.details.map((detail) => (
                <ContextMenu key={detail.id}>
                  <ContextMenuTrigger>
                    <li className="group w-full">
                      <div className="flex items-start w-full">
                        <div className="flex-grow mr-2">
                          {renderContent(detail.content)}
                        </div>
                        
                        {editable && (
                          <div className="flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal("item", detail);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                              <span className="sr-only">Edit</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem onClick={() => openEditModal("item", detail)}>
                      <Edit className="h-4 w-4 mr-2" /> Edit Item
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => deleteItem("item", detail.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash className="h-4 w-4 mr-2" /> Delete Item
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </ul>
          )}
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => openEditModal("experience", experience)}>
          <Edit className="h-4 w-4 mr-2" /> Edit Experience
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => deleteItem("experience", experience.id)}
          className="text-destructive focus:text-destructive"
        >
          <Trash className="h-4 w-4 mr-2" /> Delete Experience
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => {
            const newItem: ProfileItemType = {
              id: "temp-new",
              content: "",
            };
            openEditModal("item", newItem, "add", experience.id);
          }}
        >
          <Plus className="h-4 w-4 mr-2" /> Add Detail
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default ExperienceItem;