"use client";

import React, { useState } from "react";
import { ImageManager, ImageManagerProps } from "@/components/image/ImageManager";
import { useSelectedImages, type ImageSource } from "@/components/image/context/SelectedImagesProvider";
import { Image, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImageManagerIconProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Whether this is for single or multiple image selection
   */
  mode?: "single" | "multiple";
  
  /**
   * Size of the icon
   */
  size?: "sm" | "md" | "lg";
  
  /**
   * Text to display when hovering over the icon with no selection
   */
  emptyTooltip?: string;
  
  /**
   * Text to display when hovering over the icon with selection
   */
  selectedTooltip?: string;
  
  /**
   * Whether to show the count badge for multiple selection
   */
  showCount?: boolean;
  
  /**
   * ImageManager props to pass through
   */
  imageManagerProps?: Partial<ImageManagerProps>;
  
  /**
   * Callback when selected images change
   */
  onChange?: (images: ImageSource[]) => void;
  
  /**
   * Callback when the manager is opened
   */
  onManagerOpen?: () => void;
  
  /**
   * Callback when the manager is closed
   */
  onManagerClose?: () => void;
}

// Icon size map
const sizeMap = {
  sm: {
    container: "w-8 h-8",
    icon: "h-4 w-4",
    badge: "w-4 h-4 text-[10px]"
  },
  md: {
    container: "w-10 h-10",
    icon: "h-5 w-5",
    badge: "w-5 h-5 text-xs"
  },
  lg: {
    container: "w-12 h-12",
    icon: "h-6 w-6",
    badge: "w-6 h-6 text-xs"
  }
};

export function ImageManagerIcon({
  mode = "single",
  size = "md",
  emptyTooltip = "Select image",
  selectedTooltip = "Change image",
  showCount = true,
  imageManagerProps,
  onChange,
  onManagerOpen,
  onManagerClose,
  className,
  ...props
}: ImageManagerIconProps) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  // Track selected images and notify parent when they change
  React.useEffect(() => {
    if (onChange) {
      onChange(selectedImages);
    }
  }, [selectedImages, onChange]);
  
  const handleOpenManager = () => {
    setIsManagerOpen(true);
    if (onManagerOpen) {
      onManagerOpen();
    }
  };
  
  const handleCloseManager = () => {
    setIsManagerOpen(false);
    if (onManagerClose) {
      onManagerClose();
    }
  };
  
  const handleSave = () => {
    setIsManagerOpen(false);
    if (imageManagerProps?.onSave) {
      imageManagerProps.onSave();
    }
    if (onManagerClose) {
      onManagerClose();
    }
  };
  
  const hasSelection = selectedImages.length > 0;
  const selectionCount = selectedImages.length;
  const tooltip = hasSelection ? selectedTooltip : emptyTooltip;
  
  return (
    <>
      <div
        className={cn(
          "relative flex items-center justify-center rounded-md border cursor-pointer transition-colors",
          hasSelection 
            ? "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-500 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900" 
            : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800",
          sizeMap[size].container,
          className
        )}
        onClick={handleOpenManager}
        title={tooltip}
        {...props}
      >
        {/* Base icon */}
        {hasSelection ? (
          <Image className={sizeMap[size].icon} />
        ) : (
          <div className="flex items-center justify-center">
            <Image className={sizeMap[size].icon} />
            <Plus className="absolute h-2.5 w-2.5 bottom-1.5 right-1.5 text-gray-400 dark:text-gray-500" />
          </div>
        )}
        
        {/* Selection indicators */}
        {hasSelection && (
          <>
            {/* For single selection mode, show checkmark */}
            {mode === "single" && (
              <div className="absolute -top-1.5 -right-1.5 bg-green-500 rounded-full p-0.5">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            )}
            
            {/* For multiple selection mode, show count badge */}
            {mode === "multiple" && showCount && (
              <div className={cn(
                "absolute -top-1.5 -right-1.5 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium",
                sizeMap[size].badge
              )}>
                {selectionCount}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Image Manager component */}
      <ImageManager
        isOpen={isManagerOpen}
        onClose={handleCloseManager}
        onSave={handleSave}
        initialSelectionMode={mode}
        enforceSelectionMode={true}
        initialTab="public-search"
        {...imageManagerProps}
      />
    </>
  );
} 