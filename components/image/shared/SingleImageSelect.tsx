"use client";
import React, { useState, useEffect } from "react";
import { ImageManager } from "@/components/image/ImageManager";
import { useSelectedImages } from "@/components/image/context/SelectedImagesProvider";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

export interface SingleImageSelectProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Aspect ratio for the image container
     */
    aspectRatio?: "square" | "video" | "portrait" | "landscape" | "auto";

    /**
     * Size of the component
     */
    size?: "sm" | "md" | "lg" | "xl";

    /**
     * Placeholder text when no image is selected
     */
    placeholder?: string;

    /**
     * Optional custom placeholder element
     */
    customPlaceholder?: React.ReactNode;

    /**
     * Border radius variant
     */
    radius?: "none" | "sm" | "md" | "lg" | "full";

    /**
     * Initial tab to open in the ImageManager
     */
    initialTab?: string;

    /**
     * Initial search term for public image search
     */
    initialSearchTerm?: string;

    /**
     * Props to pass to the ImageManager component
     */
    imageManagerProps?: Partial<Parameters<typeof ImageManager>[0]>;

    /**
     * Callback when an image is selected. Receives the URL string and, when
     * the selection came from a cloud file / fresh upload, the durable
     * cld_files `file_id` (empty string for external / library URLs that
     * carry no file id). Persist the file_id when truthy and prefer it for
     * rendering; the URL remains the fallback.
     */
    onImageSelected?: (imageUrl: string, fileId?: string) => void;

    /**
     * Callback when the image is removed
     */
    onImageRemoved?: () => void;

    /**
     * Preselected image URL
     */
    preselectedImageUrl?: string;

    /**
     * Unique ID for this instance to avoid cross-contamination
     */
    instanceId?: string;

    /**
     * Where to save uploaded images: "public" or "private"
     * This is a convenience prop that will use the standard user asset buckets
     */
    saveTo?: "public" | "private";

    /**
     * Custom storage bucket to use for uploads
     * If specified along with saveTo, this takes precedence
     */
    bucket?: string;

    /**
     * Custom path within the bucket for uploads
     * If specified along with saveTo, this takes precedence
     */
    path?: string;
}

// Size variants - with flexibility for full width
const sizeVariants = {
    sm: "h-16", // Much smaller height for compact inline use
    md: "h-24", // Medium height for form fields
    lg: "h-40", // Larger height for feature displays
    xl: "h-56", // Extra large height for prominent displays
};

// Aspect ratio variants
const aspectRatioVariants = {
    square: "aspect-square",
    video: "aspect-video",
    portrait: "aspect-[3/4]",
    landscape: "aspect-[16/9]",
    auto: "",
};

// Border radius variants
const radiusVariants = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
};

// Define sizes for each size variant
const imageSizes = {
    sm: "(max-width: 640px) 64px, 64px", // h-16 = 64px
    md: "(max-width: 640px) 96px, 96px", // h-24 = 96px
    lg: "(max-width: 640px) 160px, 160px", // h-40 = 160px
    xl: "(max-width: 640px) 224px, 224px", // h-56 = 224px
};

export function SingleImageSelect({
    aspectRatio = "square",
    size = "md",
    placeholder = "Select Image",
    customPlaceholder,
    radius = "md",
    initialTab = "public-search",
    initialSearchTerm,
    imageManagerProps,
    onImageSelected,
    onImageRemoved,
    preselectedImageUrl,
    instanceId = "default",
    saveTo = "public",
    bucket,
    path,
    className,
    ...props
}: SingleImageSelectProps) {
    // Local component state - completely separate from context
    const [isOpen, setIsOpen] = useState(false);
    const [localImage, setLocalImage] = useState(preselectedImageUrl);

    // Get access to the context, but only for the ImageManager's usage
    const { setImages, clearImages, selectedImages } = useSelectedImages();

    // Update local state if preselected image changes externally
    useEffect(() => {
        if (preselectedImageUrl !== localImage) {
            setLocalImage(preselectedImageUrl);
        }
    }, [preselectedImageUrl, localImage]);

    // Open the image manager with current selection preloaded
    const openImageManager = () => {
        // Reset the context state specifically for this manager session
        // This prevents cross-contamination with other components
        clearImages();

        // If we have a local image, initialize the manager with it
        if (localImage) {
            setImages([
                {
                    type: "public",
                    url: localImage,
                    id: instanceId + "-" + localImage,
                },
            ]);
        }

        setIsOpen(true);
    };

    // Handle closing the manager without selection
    const handleClose = () => {
        setIsOpen(false);
    };

    // Handle saving the selection
    const handleSave = () => {
        // Capture the current selection before closing
        const newSelectedImages = [...selectedImages];
        setIsOpen(false);

        // Process the selection after the manager is closed
        if (newSelectedImages.length > 0) {
            const newImageUrl = newSelectedImages[0].url;
            // Durable cld_files id when the source was a cloud file / upload.
            const newImageFileId = newSelectedImages[0].metadata?.fileId ?? "";

            // Only update if changed
            if (newImageUrl !== localImage) {
                setLocalImage(newImageUrl);

                // Notify parent if needed
                if (onImageSelected) {
                    onImageSelected(newImageUrl, newImageFileId);
                }
            }
        } else if (localImage && onImageRemoved) {
            // Selection was cleared
            setLocalImage(undefined);
            onImageRemoved();
        }

        // Always clean up after closing to prevent state leak
        clearImages();
    };

    // Determine which size class to use
    const sizeClass = sizeVariants[size];
    const aspectRatioClass = aspectRatioVariants[aspectRatio];
    const radiusClass = radiusVariants[radius];
    const imageSize = imageSizes[size];

    return (
        <>
            <div
                className={cn(
                    "relative overflow-hidden cursor-pointer transition-all duration-200",
                    "border-border hover:border-blue-400 dark:hover:border-blue-600",
                    "bg-gray-50 dark:bg-gray-900",
                    sizeClass,
                    aspectRatioClass,
                    radiusClass,
                    className
                )}
                onClick={openImageManager}
                {...props}
            >
                {localImage ? (
                    // Show selected image
                    <div className="h-full w-full relative">
                        <Image src={localImage} alt="Selected image" fill sizes={imageSize} className="object-cover" />
                        <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100">
                            <div className="px-3 py-1.5 bg-textured text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium">
                                Change Image
                            </div>
                        </div>
                    </div>
                ) : (
                    // Show placeholder
                    <div className="h-full w-full flex flex-col items-center justify-center p-4">
                        {customPlaceholder || (
                            <>
                                <ImageIcon className="h-8 w-8 text-gray-400 dark:text-gray-600 mb-2" />
                                <p className="text-sm text-center text-gray-500 dark:text-gray-400">{placeholder}</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            <ImageManager
                isOpen={isOpen}
                onClose={handleClose}
                onSave={handleSave}
                initialSelectionMode="single"
                enforceSelectionMode={true}
                initialTab={initialTab}
                initialSearchTerm={initialSearchTerm}
                saveTo={saveTo}
                bucket={bucket}
                path={path}
                {...imageManagerProps}
            />
        </>
    );
}
