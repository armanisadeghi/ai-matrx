'use client';

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectableImageCard } from "./SelectableImageCard";
import { ImageSource } from "../context/SelectedImagesProvider";

interface EnhancedImageCardProps {
    photo: {
        id?: string;
        urls?:
            | {
                  regular?: string;
                  thumb?: string;
              }
            | string;
        url?: string; // For backward compatibility and simpler usage
        // Unsplash returns null (not undefined) for a photo with no caption.
        alt_description?: string | null;
        description?: string | null; // Alternative to alt_description
        user?: {
            name?: string;
        };
    };
    onClick: () => void;
    viewMode?: "grid" | "natural";
}

export function DesktopImageCard({ photo, onClick, viewMode = "grid" }: EnhancedImageCardProps) {
    const [isLoading, setIsLoading] = useState(true);
    const [isError, setIsError] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [aspectRatio, setAspectRatio] = useState(1);

    // Get image URL from various possible formats
    const getImageUrl = (): string => {
        if (typeof photo.urls === "string") return photo.urls;
        if (photo.url) return photo.url;
        if (photo.urls?.regular) return photo.urls.regular;
        return "";
    };

    const imageUrl = getImageUrl();

    // Get image description from various possible formats
    const getImageDescription = (): string => {
        return photo.alt_description || photo.description || "Gallery image";
    };

    // Create image source object for selection system
    const imageSource: ImageSource = {
        id: photo.id || `img-${imageUrl}`,
        url: imageUrl,
        type: 'public', // Assuming all gallery images are public
        metadata: {
            description: getImageDescription(),
            userName: photo.user?.name
        }
    };

    // Preload the image to get natural dimensions
    useEffect(() => {
        if (!imageUrl) {
            setIsError(true);
            setIsLoading(false);
            return;
        }

        const img = new Image();
        img.src = imageUrl;

        img.onload = () => {
            setDimensions({ width: img.width, height: img.height });
            setAspectRatio(img.width / img.height);
        };
    }, [imageUrl]);

    const handleLoad = () => {
        setIsLoading(false);
    };

    const handleError = () => {
        setIsLoading(false);
        setIsError(true);
    };

    // Determine image height based on view mode
    const getImageHeight = () => {
        if (viewMode === "grid") {
            return "h-60"; // Fixed height for grid mode
        } else {
            // Natural mode - limit height based on aspect ratio
            if (aspectRatio > 1.5) {
                return "h-40"; // Wide image
            } else if (aspectRatio < 0.7) {
                return "h-72"; // Tall image
            } else {
                return "h-56"; // Standard image
            }
        }
    };

    const cardContent = (
        <Card className="overflow-hidden">
            <CardContent className="p-0 relative">
                {isLoading && <Skeleton className={`w-full ${getImageHeight()}`} />}

                {isError ? (
                    <div className={`w-full ${getImageHeight()} flex items-center justify-center bg-muted`}>
                        <p className="text-muted-foreground">Image not available</p>
                    </div>
                ) : (
                    <img
                        src={imageUrl}
                        alt={getImageDescription()}
                        className={`w-full ${getImageHeight()} ${
                            viewMode === "grid" ? "object-cover" : "object-contain"
                        } transition-opacity duration-300 ${isLoading ? "opacity-0" : "opacity-100"}`}
                        onLoad={handleLoad}
                        onError={handleError}
                    />
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end">
                    <div className="p-4 w-full text-white">
                        <p className="font-medium truncate">{getImageDescription()}</p>
                        {photo.user?.name && <p className="text-sm text-white/80 truncate">By {photo.user.name}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <SelectableImageCard 
            imageData={imageSource} 
            onClick={onClick}
            className="transform transition-transform duration-200 hover:scale-[1.02] group cursor-pointer"
        >
            {cardContent}
        </SelectableImageCard>
    );
}
