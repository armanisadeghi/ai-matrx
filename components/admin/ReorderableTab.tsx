import React, { useState } from 'react';
import { Reorder, useDragControls } from 'motion/react';
import { cn } from "@/lib/utils";

interface ReorderableTabsProps {
    tabs: string[];
    activeTab: string;
    onReorder: (newOrder: string[]) => void;
    onTabChange: (tab: string) => void;
}

interface ReorderableTabProps {
    value: string;
    isActive: boolean;
    onClick: () => void;
}

const ReorderableTab = ({ value, isActive, onClick }: ReorderableTabProps) => {
    const controls = useDragControls();

    return (
        <Reorder.Item
            value={value}
            dragListener={false}
            dragControls={controls}
            className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 relative select-none touch-none cursor-grab active:cursor-grabbing",
                isActive && "text-foreground",
                !isActive && "text-muted-foreground hover:text-foreground"
            )}
            onPointerDown={(e) => {
                controls.start(e);
            }}
        >
            <span onClick={onClick}>{value}</span>
        </Reorder.Item>
    );
};

const ReorderableTabs: React.FC<ReorderableTabsProps> = ({
                                                             tabs,
                                                             activeTab,
                                                             onReorder,
                                                             onTabChange,
                                                         }) => {
    return (
        <Reorder.Group
            axis="x"
            values={tabs}
            onReorder={onReorder}
            className="flex items-center gap-1 border-b px-3"
        >
            {tabs.map((tab) => (
                <ReorderableTab
                    key={tab}
                    value={tab}
                    isActive={activeTab === tab}
                    onClick={() => onTabChange(tab)}
                />
            ))}
        </Reorder.Group>
    );
};

export default ReorderableTabs;
