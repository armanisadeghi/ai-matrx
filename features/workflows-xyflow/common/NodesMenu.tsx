"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/styles/themes/utils";
import { useCategoryNodeData } from "@/features/workflows-xyflow/hooks/useCategoryNodeData";
import { WorkflowNode } from "@/lib/redux/workflow-nodes/types";
import { DynamicIcon } from "@/components/official/icons/IconResolver";

// Truncate text to specified length with ellipsis
const truncateText = (text: string, maxLength: number = 30): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
};

// Custom SubTrigger without the right chevron
const CustomSubTrigger = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent",
      inset && "pl-8",
      className,
    )}
    {...props}
  >
    {children}
  </DropdownMenuPrimitive.SubTrigger>
));
CustomSubTrigger.displayName = "CustomSubTrigger";

// Component to handle dynamic chevron direction
const DynamicChevron: React.FC<{ className?: string }> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLeftPositioned, setIsLeftPositioned] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-state"
        ) {
          const target = mutation.target as HTMLElement;
          const isCurrentlyOpen = target.getAttribute("data-state") === "open";
          setIsOpen(isCurrentlyOpen);

          if (isCurrentlyOpen) {
            // Check for submenu positioning
            setTimeout(() => {
              const content = document.querySelector(
                '[data-radix-popper-content-wrapper] [data-side="left"]',
              );
              setIsLeftPositioned(!!content);
            }, 50);
          }
        }
      });
    });

    const trigger = triggerRef.current?.closest(
      "[data-radix-dropdown-menu-sub-trigger]",
    );
    if (trigger) {
      observer.observe(trigger, { attributes: true });
    }

    return () => observer.disconnect();
  }, []);

  const ChevronIcon = isLeftPositioned ? ChevronLeft : ChevronRight;

  return (
    <div ref={triggerRef} className="w-3 h-3 flex items-center justify-center">
      <ChevronIcon
        className={cn(
          "h-3 w-3 text-gray-400 dark:text-gray-500 transition-transform duration-150",
          className,
        )}
      />
    </div>
  );
};

interface NodesMenuProps {
  itemClassName?: string;
  workflowId?: string;
  onNodeCreated?: (nodeData: WorkflowNode) => void;
  onRecipeNodeCreated?: (nodeData: WorkflowNode) => void;
}

export const NodesMenu: React.FC<NodesMenuProps> = ({
  itemClassName = "",
  workflowId,
  onNodeCreated,
  onRecipeNodeCreated,
}) => {
  const {
    categoryRecords,
    registeredNodeRecords,
    nodesByCategory,
    handleNodeAdd,
    isAddingNode,
  } = useCategoryNodeData(workflowId);

  const handleNodeClick = async (nodeId: string) => {
    try {
      const result = await handleNodeAdd(
        nodeId,
        workflowId,
        onRecipeNodeCreated,
      );
      if (result && onNodeCreated) {
        onNodeCreated(result);
      }
    } catch (error) {
      console.error("Failed to add node from menu:", error);
    }
  };

  const categories = Object.values(categoryRecords);

  if (categories.length === 0) {
    return null;
  }

  return (
    <>
      <DropdownMenuSeparator />
      <div className="px-2 py-1">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          Workflow Nodes
        </span>
      </div>

      {categories.map((category) => {
        const categoryNodes = nodesByCategory[category.id] || [];
        const categoryLabel = category.label || category.id;

        // If no nodes in this category, skip it
        if (categoryNodes.length === 0) {
          return null;
        }

        const truncatedCategoryLabel = truncateText(categoryLabel, 25); // Slightly shorter for category

        return (
          <DropdownMenuSub key={category.id}>
            <CustomSubTrigger className="px-2 py-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 group">
              <div className="flex items-center gap-3 w-full">
                <DynamicChevron />
                <div className="w-5 h-5 flex items-center justify-center">
                  <DynamicIcon
                    name={category.icon}
                    color={category.color}
                    size={4}
                  />
                </div>
                <span
                  className="text-sm text-gray-700 dark:text-gray-300 font-medium flex-1"
                  title={categoryLabel}
                >
                  {truncatedCategoryLabel}
                </span>
              </div>
            </CustomSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent
                className="w-80 max-w-sm"
                sideOffset={2}
                alignOffset={-5}
              >
                {categoryNodes.map((node) => {
                  const registeredNode = Object.values(
                    registeredNodeRecords,
                  ).find((rn) => rn.id === node.id);
                  const truncatedNodeName = truncateText(node.name, 30);

                  return (
                    <DropdownMenuItem
                      key={node.id}
                      onClick={() => handleNodeClick(node.id)}
                      disabled={isAddingNode}
                    >
                      <div
                        className={`flex items-center gap-3 w-full px-2 py-2 cursor-pointer ${itemClassName}`}
                      >
                        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                          <DynamicIcon
                            name={registeredNode.icon}
                            color={registeredNode?.color}
                            size={4}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span
                            className="text-sm text-gray-700 dark:text-gray-300 font-medium block"
                            title={node.name}
                          >
                            {truncatedNodeName}
                          </span>
                          {isAddingNode && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Adding...
                            </span>
                          )}
                        </div>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        );
      })}
    </>
  );
};

export default NodesMenu;
