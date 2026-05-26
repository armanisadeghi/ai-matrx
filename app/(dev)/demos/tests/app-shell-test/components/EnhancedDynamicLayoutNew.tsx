'use client';

import React, {useState, useEffect} from 'react';
import {motion} from 'motion/react';
import {cn} from "@/lib/utils";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {useMeasure} from "@uidotdev/usehooks";
import {ChildProps, EnhancedDynamicLayoutNewProps } from '../types';
import { layouts } from '../app-data';

const EnhancedDynamicLayoutNew: React.FC<EnhancedDynamicLayoutNewProps> = (
    {
        layoutType,
        children,
        backgroundColor = 'bg-gray-900',
        gap = 'medium',
        padding = 'medium',
        rounded = true,
        animate = true,
        hoverEffect = true,
    }) => {
    const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
    const [selectedSection, setSelectedSection] = useState<{ id: string; content: React.ReactNode } | null>(null);
    const [ref, { width, height }] = useMeasure();

    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getResponsiveLayout = () => {
        if (windowWidth >= 1024) return 'desktop';
        if (windowWidth >= 768) return 'tablet';
        return 'mobile';
    };

    const gapSizes = {
        small: 'gap-2',
        medium: 'gap-4',
        large: 'gap-6',
    };

    const paddingSizes = {
        small: 'p-2',
        medium: 'p-4',
        large: 'p-6',
    };

    const selectedLayout = layouts[layoutType]?.[getResponsiveLayout()] || layouts.complexDashboard[getResponsiveLayout()];

    const childrenMap = React.Children.toArray(children).reduce<Record<string, React.ReactNode>>((acc, child) => {
        if (React.isValidElement<ChildProps>(child) && child.props.id) {
            acc[child.props.id] = child;
        }
        return acc;
    }, {});

    // Calculate the maximum columns used in the current layout
    const maxColumns = selectedLayout.reduce((max, item) => {
        const [, , , endCol] = item.gridArea.split(' ').map(Number);
        return Math.max(max, endCol - 1);
    }, 0);

    // Calculate grid template columns based on maximum columns
    const gridTemplateColumns = `repeat(${maxColumns}, 1fr)`;

    return (
        <div ref={ref} className={cn("w-full h-full", backgroundColor)}>
        <div
            className={cn(
                    "w-full h-full",
                gapSizes[gap],
                paddingSizes[padding],
                rounded && "rounded-lg"
                )}
                style={{
                    display: 'grid',
                    gridTemplateColumns,
                    gridAutoRows: 'min-content',
                }}
            >
                {selectedLayout.map(({ id, gridArea, minHeight }) => {
                    const hasContent = !!childrenMap[id];

                    // Calculate width percentage based on grid area
                    const [startRow, startCol, endRow, endCol] = gridArea.split(' ').map(Number);
                    const colSpan = endCol - startCol;
                    const widthPercentage = (colSpan / maxColumns) * 100;

                    return (
                        <motion.div
                            key={id}
                            className={cn(
                                hasContent && [
                                    "bg-gray-800",
                                    "rounded-md",
                                    "p-4",
                                    "shadow-md",
                                    "cursor-pointer",
                                    "flex items-center justify-center"
                                ]
                            )}
                            style={{
                                gridArea,
                                minHeight: hasContent ? minHeight : 'auto',
                                width: `${widthPercentage}%`,
                                gridColumn: `${startCol} / ${endCol}`,
                                gridRow: `${startRow} / ${endRow}`,
                            }}
                            whileHover={hasContent && hoverEffect ? {
                                scale: 1.02,
                                backgroundColor: 'rgb(55, 65, 81)'
                            } : undefined}
                            transition={{ duration: 0.2 }}
                            initial={animate ? { opacity: 0, scale: 0.9 } : false}
                            animate={animate ? { opacity: 1, scale: 1 } : false}
                            onClick={() => hasContent && setSelectedSection({ id, content: childrenMap[id] })}
                        >
                            {childrenMap[id]}
                        </motion.div>
                    );
                })}
            </div>

            <Dialog open={!!selectedSection} onOpenChange={() => setSelectedSection(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-semibold">
                            {selectedSection?.id}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-4 space-y-4">
                        <div className="bg-gray-50 p-4 rounded-md">
                            {selectedSection?.content}
                        </div>
                        <div className="text-sm text-gray-500">
                            Grid Position: {selectedLayout.find(item => item.id === selectedSection?.id)?.gridArea}
                        </div>
                        {width && (
                            <div className="text-sm text-gray-500">
                                Container Width: {width}px
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default EnhancedDynamicLayoutNew;
