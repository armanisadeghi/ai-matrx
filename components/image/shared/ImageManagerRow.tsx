"use client";

import React, { useState } from "react";
import { ImagePreviewRow } from "./ImagePreviewRow";
import { ImageManager, ImageManagerProps } from "@/components/image/ImageManager";
import { useSelectedImages, type ImageSource } from "@/components/image/context/SelectedImagesProvider";
import { PlusCircle, Images } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ImageManagerRowProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /**
   * Size of the image previews
   */
  size?: "xs" | "s" | "m" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  
  /**
   * Whether to show the remove button on each image
   */
  showRemoveButton?: boolean;
  
  /**
   * Whether to show the image count
   */
  showCount?: boolean;
  
  /**
   * Whether to show the "add/manage" button at the end of the row 
   */
  showManageButton?: boolean;
  
  /**
   * Text to display when no images are selected
   */
  emptyText?: string;
  
  /**
   * Text to display on the manage button
   */
  manageButtonText?: string;
  
  /**
   * Text to display when clicking the empty row
   */
  clickToAddText?: string;
  
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

export function ImageManagerRow({
  size = "m",
  showRemoveButton = true,
  showCount = false,
  showManageButton = true,
  emptyText = "No images selected",
  manageButtonText = "Manage",
  clickToAddText = "Click to add images",
  imageManagerProps,
  onChange,
  onManagerOpen,
  onManagerClose,
  className,
  ...props
}: ImageManagerRowProps) {
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const { selectedImages } = useSelectedImages();
  
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
  
  return (
    <>
      <div
        className={cn(
          "relative w-full",
          selectedImages.length === 0 && "cursor-pointer",
          className
        )}
        {...props}
      >
        {/* Empty state with dashed border - entire area clickable */}
        {selectedImages.length === 0 ? (
          <div 
            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center bg-gray-50 dark:bg-gray-800 flex items-center justify-center min-h-[80px] hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
            onClick={handleOpenManager}
          >
            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-gray-400 dark:text-gray-600" />
              <span>{clickToAddText}</span>
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Display the selected images - not clickable */}
            <ImagePreviewRow 
              size={size}
              showRemoveButton={showRemoveButton}
              showCount={showCount}
              className="w-full"
            />
            
            {/* Only the manage button opens the manager when images are present */}
            {showManageButton && (
              <div className="absolute right-1 top-1 z-20">
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 border-border rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                  onClick={handleOpenManager}
                >
                  <Images className="h-3 w-3" />
                  <span>{manageButtonText}</span>
                </button>
              </div>
            )}
            
            {/* No overlay div when images are present - allow normal interaction with carousel */}
          </div>
        )}
      </div>
      
      {/* Image Manager component */}
      <ImageManager
        isOpen={isManagerOpen}
        onClose={handleCloseManager}
        onSave={handleSave}
        initialSelectionMode="multiple"
        initialTab="public-search"
        {...imageManagerProps}
      />
    </>
  );
} 