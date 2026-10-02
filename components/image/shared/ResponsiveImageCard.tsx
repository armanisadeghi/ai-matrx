'use client';

import React from "react";
import { DesktopImageCard } from "./DesktopImageCard";
import { MobileImageCard } from "./MobileImageCard";
import { useIsMobile } from "@ai-matrx/kit/media-query";

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

export function ResponsiveImageCard(props: EnhancedImageCardProps) {
    const isMobile = useIsMobile();

    return isMobile ? <MobileImageCard {...props} /> : <DesktopImageCard {...props} />;
} 