"use client";

import { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileOverlayWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    description?: string;
    className?: string;
    maxHeight?: "sm" | "md" | "lg" | "xl";
}

/**
 * MobileOverlayWrapper
 * 
 * A reusable wrapper for mobile overlays that ensures content never goes
 * behind browser UI elements (top/bottom safe areas).
 * 
 * Key Features:
 * - Respects safe area insets (top and bottom)
 * - Limits max height to prevent overflow
 * - Close button always accessible
 * - Scrollable content area
 * - Glass-morphism design
 */
export function MobileOverlayWrapper({
    isOpen,
    onClose,
    children,
    title,
    description,
    className,
    maxHeight = "lg",
}: MobileOverlayWrapperProps) {
    if (!isOpen) return null;

    const maxHeightClass = {
        sm: "max-h-[50dvh]",
        md: "max-h-[65dvh]",
        lg: "max-h-[80dvh]",
        xl: "max-h-[90dvh]",
    }[maxHeight];

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-background/80 backdrop-blur-md z-50"
                onClick={onClose}
            />

            {/* Modal Container - Positioned safely */}
            <div className="fixed inset-x-0 bottom-0 z-50 pb-safe">
                <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                    {/* Modal Content with Safe Height */}
                    <div className={cn(
                        "bg-background/95 backdrop-blur-xl rounded-t-3xl border border-b-0 border-border/50 shadow-2xl",
                        "flex flex-col",
                        maxHeightClass,
                        className
                    )}>
                        {/* Header - Fixed at top */}
                        <div className="flex-shrink-0 px-5 py-3.5 border-b border-border/50">
                            <div className="flex items-center justify-between">
                                {title && (
                                    <div className="flex-1 min-w-0 mr-2">
                                        <h2 className="text-lg font-bold text-foreground truncate">
                                            {title}
                                        </h2>
                                        {description && (
                                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                                                {description}
                                            </p>
                                        )}
                                    </div>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={onClose}
                                    className="h-8 w-8 flex-shrink-0"
                                >
                                    <X className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>

                        {/* Content - Scrollable */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

