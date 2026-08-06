"use client";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTriggerCore } from "@/components/ui/tabs";
import { useEffect, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMeasure } from "@/hooks/usehooks";
import { AppletListItemConfig } from "@/types/customAppTypes";


// STYLE TASK: Accent color in TabsTriggerCore


const TabTrigger = ({ value, label, active }: { value: string; label: string; active: boolean }) => {
    return (
        <TabsTriggerCore
            value={value}
            className={cn(
                "pb-2 px-0 data-[state=active]:border-b-3 data-[state=active]:border-blue-500 dark:data-[state=active]:border-rose-500 rounded-none whitespace-nowrap bg-transparent data-[state=active]:bg-transparent dark:bg-transparent dark:data-[state=active]:bg-transparent hover:bg-transparent",
                active
                    ? "text-gray-900 hover:text-gray-900 dark:hover:text-gray-100"
                    : "text-gray-800 dark:text-gray-200 hover:text-gray-900 hover:border-b-1 border-blue-700 dark:hover:text-gray-100"
            )}
        >
            {label}
        </TabsTriggerCore>
    );
};

export interface TabListProps {
    activeAppletSlug: string;
    handleAppletChange: (value: string) => void;
    appletList: AppletListItemConfig[];
    preserveTabOrder?: boolean;
}

export const HeaderTabGroup = ({ 
    activeAppletSlug, 
    handleAppletChange, 
    appletList,
    preserveTabOrder = false,
}: TabListProps) => {
    // Use measure hook for container width
    const [containerRef, { width: containerWidth }] = useMeasure();

    // State for visible and overflow tabs
    const [visibleTabs, setVisibleTabs] = useState<AppletListItemConfig[]>(appletList);
    const [overflowTabs, setOverflowTabs] = useState<AppletListItemConfig[]>([]);

    // Constants
    const GAP_SIZE = 32; // 8 in gap-8 class = 32px
    const MORE_BUTTON_WIDTH = 100; // Approximate width for "More" dropdown
    const CHAR_WIDTH = 8; // Character width approximation (in pixels)
    const MIN_TAB_WIDTH = 50; // Minimum width for any applet


    const estimateTabWidth = (label: string) => {
        return Math.max(label.length * CHAR_WIDTH, MIN_TAB_WIDTH);
    };

    // Calculate visible and overflow tabs when container width changes
    useEffect(() => {
        if (!containerWidth) return;

        let availableWidth = containerWidth - MORE_BUTTON_WIDTH;
        let currentWidth = 0;
        const visible: AppletListItemConfig[] = [];
        
        if (preserveTabOrder) {
            // Keep tabs in their original order
            for (const applet of appletList) {
                const tabWidth = estimateTabWidth(applet.label);
                
                // Add gap width between tabs if not the first tab
                if (visible.length > 0) currentWidth += GAP_SIZE;
                
                // If this is the active tab or there's still space, add it to visible
                if (applet.slug === activeAppletSlug || currentWidth + tabWidth <= availableWidth) {
                    currentWidth += tabWidth;
                    visible.push(applet);
                } else {
                    // No more space, and this isn't the active tab
                    break;
                }
            }
        } else {
            // Original behavior: active tab first, then others
            const activeTabConfig = appletList.find((applet) => applet.slug === activeAppletSlug);
            const otherTabs = appletList.filter((applet) => applet.slug !== activeAppletSlug);

            // Add active applet first
            if (activeTabConfig) {
                const activeTabWidth = estimateTabWidth(activeTabConfig.label);
                currentWidth += activeTabWidth;
                visible.push(activeTabConfig);
            }

            // Add other tabs if they fit
            for (const applet of otherTabs) {
                const tabWidth = estimateTabWidth(applet.label);
                // Add gap width between tabs
                if (visible.length > 0) currentWidth += GAP_SIZE;

                if (currentWidth + tabWidth <= availableWidth) {
                    currentWidth += tabWidth;
                    visible.push(applet);
                } else {
                    // We've run out of space, remaining tabs go to overflow
                    break;
                }
            }
        }

        // Set overflow tabs
        const overflow = appletList.filter((applet) => !visible.includes(applet));

        // Don't show the More dropdown if all tabs fit
        if (overflow.length === 0) {
            setVisibleTabs(appletList);
            setOverflowTabs([]);
        } else {
            setVisibleTabs(visible);
            setOverflowTabs(overflow);
        }
    }, [containerWidth, appletList, activeAppletSlug, preserveTabOrder]);

    // Calculate the width of visible tabs for the underline
    const calculateVisibleTabsWidth = () => {
        let totalWidth = 0;
        visibleTabs.forEach((applet, index) => {
            totalWidth += estimateTabWidth(applet.label);
            if (index < visibleTabs.length - 1) totalWidth += GAP_SIZE; // Add gap between tabs
        });
        return totalWidth;
    };

    return (
        <div className="relative w-full" ref={containerRef} >
            <Tabs value={activeAppletSlug} onValueChange={(value) => handleAppletChange(value)} className="w-full">
                <TabsList className="bg-transparent border-b-0 w-full justify-start gap-8 relative z-10">
                    {visibleTabs.map((applet) => (
                        <TabTrigger key={applet.slug} value={applet.slug} label={applet.label} active={activeAppletSlug === applet.slug} />
                    ))}

                    {overflowTabs.length > 0 && (
                        <DropdownMenu>
                            <DropdownMenuTrigger className="flex items-center pb-2 text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 cursor-pointer">
                                <MoreHorizontal size={20} />
                                <span className="ml-1 text-sm">More</span>
                                <ChevronDown size={14} className="ml-1 mt-0.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                {overflowTabs.map((applet) => (
                                    <DropdownMenuItem
                                        key={applet.slug}
                                        onClick={() => handleAppletChange(applet.slug)}
                                        className={cn(
                                            "cursor-pointer",
                                            activeAppletSlug === applet.slug && "font-medium text-rose-500 dark:text-rose-500"
                                        )}
                                    >
                                        {applet.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </TabsList>
            </Tabs>
            {/* Border that spans only the visible tabs */}
            <div 
                className="absolute bottom-0 left-0 h-px bg-gray-200 dark:bg-gray-700 transition-all duration-300"
                style={{ width: `${Math.min(calculateVisibleTabsWidth(), containerWidth || 0)}px` }}
            />
        </div>
    );
};

export default HeaderTabGroup;
