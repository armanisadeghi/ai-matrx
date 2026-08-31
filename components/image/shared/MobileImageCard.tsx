'use client';

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@ai-matrx/design-system";
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
        alt_description?: string;
        description?: string; // Alternative to alt_description
        user?: {
            name?: string;
        };
    };
    onClick: () => void;
    viewMode?: "grid" | "natural";
}

export function MobileImageCard({ photo, onClick, viewMode = "grid" }: EnhancedImageCardProps) {
    // Get image URL from various possible formats
    const getImageUrl = (): string => {
        if (typeof photo.urls === "string") return photo.urls;
        if (photo.url) return photo.url;
        if (photo.urls?.regular) return photo.urls.regular;
        return "";
    };

    const imageUrl = getImageUrl();
    const [loadState, setLoadState] = useState<{
        url: string;
        status: "loading" | "loaded" | "error";
        aspectRatio: number;
    }>({ url: imageUrl, status: imageUrl ? "loading" : "error", aspectRatio: 1 });
    const imageStatus = !imageUrl
        ? "error"
        : loadState.url === imageUrl
          ? loadState.status
          : "loading";
    const aspectRatio = loadState.url === imageUrl ? loadState.aspectRatio : 1;

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

    const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        setLoadState({
            url: imageUrl,
            status: "loaded",
            aspectRatio: image.naturalWidth / image.naturalHeight,
        });
    };

    const handleError = () => {
        setLoadState({ url: imageUrl, status: "error", aspectRatio: 1 });
    };

    // Calculate height based on aspect ratio
    const getHeight = () => {
        if (aspectRatio > 1.5) {
            return 'h-28'; // Wide image
        } else if (aspectRatio < 0.7) {
            return 'h-52'; // Tall image
        } else {
            return 'h-40'; // Standard image
        }
    };

    const cardContent = (
        <div className="rounded-md overflow-hidden">
            <div className="relative">
                {imageStatus === "loading" && (
                    <Skeleton className={`w-full ${getHeight()}`} />
                )}
                
                {imageStatus === "error" ? (
                    <div className={`w-full ${getHeight()} flex items-center justify-center bg-muted`}>
                        <p className="text-xs text-muted-foreground">Not available</p>
                    </div>
                ) : (
                    <img
                        src={imageUrl}
                        alt={getImageDescription()}
                        className={`w-full ${getHeight()} object-cover transition-opacity duration-300 ${imageStatus === "loading" ? "opacity-0" : "opacity-100"}`}
                        onLoad={handleLoad}
                        onError={handleError}
                    />
                )}
                
                {/* Mobile-optimized overlay with smaller text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity duration-200 flex items-end">
                    <div className="p-2 w-full">
                        <p className="text-white text-xs font-medium truncate">{getImageDescription()}</p>
                        {photo.user?.name && <p className="text-white/80 text-xs truncate">By {photo.user.name}</p>}
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <SelectableImageCard 
            imageData={imageSource} 
            onClick={onClick}
            className="transform transition-transform duration-200 active:scale-[0.98] group cursor-pointer"
        >
            {cardContent}
        </SelectableImageCard>
    );
}
