"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { motion } from "motion/react";
import { X } from "lucide-react";

interface FilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    sortBy: string;
    onSortChange: (value: string) => void;
    onClearFilters?: () => void;
}

export function FilterModal({
    isOpen,
    onClose,
    sortBy,
    onSortChange,
    onClearFilters,
}: FilterModalProps) {
    const isMobile = useIsMobile();
    const [localSortBy, setLocalSortBy] = useState(sortBy);

    useEffect(() => {
        setLocalSortBy(sortBy);
    }, [sortBy]);

    const handleApply = () => {
        onSortChange(localSortBy);
        onClose();
    };

    const handleClear = () => {
        setLocalSortBy("name-asc");
        onSortChange("name-asc");
        if (onClearFilters) {
            onClearFilters();
        }
    };

    const content = (
        <div className="p-6 space-y-6">
            {/* Sort Options */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">Sort By</h3>
                <RadioGroup value={localSortBy} onValueChange={setLocalSortBy}>
                    <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <RadioGroupItem value="name-asc" id="name-asc" />
                        <Label htmlFor="name-asc" className="flex-1 cursor-pointer">
                            Name (A-Z)
                        </Label>
                    </div>
                    <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                        <RadioGroupItem value="name-desc" id="name-desc" />
                        <Label htmlFor="name-desc" className="flex-1 cursor-pointer">
                            Name (Z-A)
                        </Label>
                    </div>
                </RadioGroup>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t">
                <Button
                    variant="outline"
                    onClick={handleClear}
                    className="flex-1"
                >
                    Clear Filters
                </Button>
                <Button
                    variant="primary"
                    onClick={handleApply}
                    className="flex-1"
                >
                    Apply
                </Button>
            </div>
        </div>
    );

    if (isMobile) {
        return (
            <MobileOverlayWrapper
                isOpen={isOpen}
                onClose={onClose}
                title="Filter Voices"
                description="Sort and filter voice options"
                maxHeight="md"
            >
                {content}
            </MobileOverlayWrapper>
        );
    }

    // Desktop Modal
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-background/80 backdrop-blur-md z-50"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl w-full max-w-md overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Filter Voices</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Sort and filter voice options
                            </p>
                        </div>
                        <SurfaceButton
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8"
                        >
                            <X className="h-5 w-5" />
                        </SurfaceButton>
                    </div>

                    {/* Content */}
                    {content}
                </motion.div>
            </div>
        </>
    );
}

