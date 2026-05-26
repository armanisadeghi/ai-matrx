'use client';

import React, {useState, useEffect} from 'react';
import {motion} from 'motion/react';
import {cn} from "@/lib/utils";
import {useMeasure} from "@uidotdev/usehooks";
import SectionInfoModal from './SectionInfoModal';
import {ChildProps, EnhancedDynamicLayoutProps, Layouts } from '../types';
import { layouts } from '../app-data';


const EnhancedDynamicLayout: React.FC<EnhancedDynamicLayoutProps> = (
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
    const [selectedSection, setSelectedSection] = useState<{ id: string; content: React.ReactNode; gridArea?: string } | null>(null);
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

    const handleSectionClick = (id: string, content: React.ReactNode) => {
        const gridArea = selectedLayout.find(item => item.id === id)?.gridArea;
        setSelectedSection({ id, content, gridArea });
    };

    return (
        <div
            ref={ref}
            className={cn(
                "w-full h-full flex-1",
                backgroundColor
            )}
        >
            <div className={cn(
                "grid grid-cols-12 w-full",
                gapSizes[gap],
                paddingSizes[padding],
                rounded && "rounded-lg"
            )}>
                {selectedLayout.map(({ id, gridArea, minHeight }) => {
                    const hasContent = !!childrenMap[id];

                    return (
                        <motion.div
                            key={id}
                            className={cn(
                                "w-full",
                                hasContent && [
                                    "bg-card",
                                    "rounded-md",
                                    "p-4",
                                    "shadow-md",
                                    "cursor-pointer",
                                    "flex items-center justify-center",
                                    "hover:bg-accent"
                                ]
                            )}
                            style={{
                                gridArea,
                                minHeight: hasContent ? minHeight : 'auto',
                                width: '100%',
                                height: '100%',
                            }}
                            whileHover={hasContent && hoverEffect ? {
                                scale: 1.02
                            } : undefined}
                            transition={{ duration: 0.2 }}
                            initial={animate ? { opacity: 0, scale: 0.9 } : false}
                            animate={animate ? { opacity: 1, scale: 1 } : false}
                            onClick={() => hasContent && handleSectionClick(id, childrenMap[id])}
                        >
                            {childrenMap[id]}
                        </motion.div>
                    );
                })}
            </div>

            <SectionInfoModal
                isOpen={!!selectedSection}
                onClose={() => setSelectedSection(null)}
                section={selectedSection}
                containerSize={width && height ? { width, height } : undefined}
            />
        </div>
    );
};

export default EnhancedDynamicLayout;
