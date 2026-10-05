"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@ai-matrx/design-system";

interface DesktopSearchBarProps {
    searchValue: string;
    onSearchChange: (value: string) => void;
    onFilterClick: () => void;
    showFilterBadge?: boolean;
}

export function DesktopSearchBar({
    searchValue,
    onSearchChange,
    onFilterClick,
    showFilterBadge = false,
}: DesktopSearchBarProps) {
    const [localSearchValue, setLocalSearchValue] = useState(searchValue);

    const handleSearchChange = (value: string) => {
        setLocalSearchValue(value);
        onSearchChange(value);
    };

    return (
        <div className="mb-8">
            {/* Main Search and Action Bar */}
            <div className="flex items-center gap-3">
                {/* Search Container - Prominent and Beautiful */}
                <div className="flex-1 relative">
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-background/80 backdrop-blur-xl border border-border/50 shadow-lg hover:shadow-xl transition-shadow">
                        <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <input
                            type="text"
                            value={localSearchValue}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            placeholder="Search voices..."
                            className="flex-1 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground"
                        />
                        {localSearchValue && (
                            <button
                                onClick={() => handleSearchChange("")}
                                className="p-1.5 hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0"
                            >
                                <X className="h-4 w-4 text-muted-foreground" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Button */}
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onFilterClick}
                    className="h-[52px] px-5 rounded-2xl border-border/50 shadow-lg hover:shadow-xl backdrop-blur-xl bg-background/80 relative"
                >
                    <SlidersHorizontal className="h-5 w-5 mr-2" />
                    Filter
                    {showFilterBadge && (
                        <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full" />
                    )}
                </Button>
            </div>
        </div>
    );
}

