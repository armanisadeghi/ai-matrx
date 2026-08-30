// File Location: @/components/generic-table/GenericTableHeader.tsx

"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Search, Plus, RefreshCcw } from "lucide-react";

interface GenericTableHeaderProps {
  searchTerm: string;
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCreateItem?: () => void;
  entityName: string;
  searchPlaceholder?: string;
  createButtonText?: string;
  createButtonIcon?: React.ReactNode;
  showCreateButton?: boolean;
  headerClassName?: string;
  searchClassName?: string;
  buttonClassName?: string;
  inputSize?: "sm" | "default" | "lg";
  buttonSize?: "sm" | "default" | "lg";
  additionalContent?: React.ReactNode;
  rightAlignedContent?: React.ReactNode;
  containerClassName?: string;
  onRefresh?: () => void;
}

function GenericTableHeader({
  searchTerm,
  onSearchChange,
  onCreateItem,
  entityName,
  searchPlaceholder,
  createButtonText,
  createButtonIcon = <Plus className="h-3.5 w-3.5 mr-1.5" />,
  showCreateButton = true,
  headerClassName = "",
  searchClassName = "",
  buttonClassName = "",
  inputSize = "sm",
  buttonSize = "sm",
  additionalContent,
  rightAlignedContent,
  containerClassName = "",
  onRefresh,
}: GenericTableHeaderProps) {
  const getInputSizeClass = () => {
    switch (inputSize) {
      case "sm":
        return "h-8 text-sm py-1";
      case "lg":
        return "h-12 text-base py-3";
      default:
        return "h-10 text-sm py-2";
    }
  };

  return (
    <div
      className={`flex items-center justify-between w-full ${containerClassName}`}
    >
      <div className={`flex items-center space-x-2 ${headerClassName}`}>
        <div className={`relative rounded-lg ${searchClassName}`}>
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <Input
            placeholder={
              searchPlaceholder || `Search ${entityName.toLowerCase()}s...`
            }
            className={`pl-8 ${getInputSizeClass()}`}
            value={searchTerm}
            onChange={onSearchChange}
          />
        </div>
        {onRefresh && (
          <Button
            onClick={onRefresh}
            className={`bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 h-8 text-xs py-0 ${buttonClassName}`}
            size={buttonSize}
          >
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        )}
        {showCreateButton && onCreateItem && (
          <Button
            onClick={onCreateItem}
            className={`bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800 h-8 text-xs py-0 ${buttonClassName}`}
            size={buttonSize}
          >
            {createButtonIcon}
            {createButtonText || `New`}
          </Button>
        )}

        {additionalContent}
      </div>

      {rightAlignedContent && <div>{rightAlignedContent}</div>}
    </div>
  );
}

export { GenericTableHeader };
export default GenericTableHeader;
