"use client";

import { useState, useEffect } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@ai-matrx/kit/media-query";

interface FloatingActionBarProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    onFilterClick: () => void;
    showFilterBadge?: boolean;
}

export function FloatingActionBar({
    searchValue,
    onSearchChange,
    onFilterClick,
    showFilterBadge = false,
}: FloatingActionBarProps) {
    const isMobile = useIsMobile();
    const [isSearchActive, setIsSearchActive] = useState(false);
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);

    useEffect(() => {
        setLocalSearchValue(searchValue);
    }, [searchValue]);

    // Only show on mobile
    if (!isMobile) {
        return null;
    }

    const handleSearchActivate = () => {
        setIsSearchActive(true);
    };

    const handleSearchCancel = () => {
        setIsSearchActive(false);
        setLocalSearchValue("");
        onSearchChange("");
    };

    const handleSearchChange = (value: string) => {
        setLocalSearchValue(value);
        onSearchChange(value);
    };

    // Search active state - expanded search input
    if (isSearchActive) {
        return (
            <>
                {/* Backdrop */}
                <div 
                    className="fixed inset-0 bg-background/60 backdrop-blur-sm z-30"
                    onClick={handleSearchCancel}
                />

                {/* Expanded Search Bar */}
                <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
                    <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                        <div className="flex items-center gap-2 p-2 rounded-full bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl">
                            <Search className="h-5 w-5 text-muted-foreground ml-3" />
                            <input
                                type="text"
                                value={localSearchValue}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Search voices..."
                                className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground"
                                autoFocus
                            />
                            {localSearchValue && (
                                <button
                                    onClick={() => handleSearchChange("")}
                                    className="p-2 hover:bg-muted/50 rounded-full transition-colors"
                                >
                                    <X className="h-4 w-4 text-muted-foreground" />
                                </button>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleSearchCancel}
                                className="mr-1"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // Default state - compact bar
    return (
        <div className="fixed bottom-0 left-0 right-0 pb-safe z-40">
            <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 max-w-[1800px] pb-4">
                <div className="flex items-center gap-2 p-2 rounded-full bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg">
                    {/* Filter Button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onFilterClick}
                        className="h-10 w-10 flex-shrink-0 rounded-full relative"
                    >
                        <SlidersHorizontal className="h-5 w-5" />
                        {showFilterBadge && (
                            <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
                        )}
                    </Button>

                    {/* Compact Search Bar */}
                    <button
                        onClick={handleSearchActivate}
                        className="flex-1 flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 hover:bg-muted transition-colors text-left"
                    >
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground truncate">
                            {localSearchValue || "Search voices..."}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}

