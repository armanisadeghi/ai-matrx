'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useMeasure } from "@uidotdev/usehooks";
import {ChildProps, EnhancedDynamicLayoutNewProps} from '../types';
import { layouts } from '../app-data';


const AdvancedDynamicLayoutNew: React.FC<EnhancedDynamicLayoutNewProps> = ({ layoutType, children }) => {
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

    const selectedLayout = layouts[layoutType]?.[getResponsiveLayout()] || layouts.complexDashboard[getResponsiveLayout()];

    const containerStyle = {
        maxWidth: '100vw',
        margin: '0 auto',
        width: '100%',
    };

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridAutoRows: 'minmax(50px, auto)',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#1a202c',
        borderRadius: '0.5rem',
        minHeight: '100vh',
        width: '100%',
    };

    const childrenMap = React.Children.toArray(children).reduce<Record<string, React.ReactNode>>((acc, child) => {
        if (React.isValidElement<ChildProps>(child) && child.props.id) {
            acc[child.props.id] = child;
        }
        return acc;
    }, {});

    return (
        <div style={containerStyle}>
            <div style={gridStyle}>
                {selectedLayout.map(({ id, gridArea, minHeight }) => (
                    <motion.div
                        key={id}
                        style={{
                            gridArea,
                            minHeight,
                            backgroundColor: childrenMap[id] ? '#2d3748' : 'transparent',
                            borderRadius: '0.375rem',
                            padding: childrenMap[id] ? '1rem' : '0',
                            boxShadow: childrenMap[id] ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: childrenMap[id] ? 'pointer' : 'default',
                        }}
                        whileHover={childrenMap[id] ? { scale: 1.02, backgroundColor: '#3d4a5f' } : {}}
                        transition={{ duration: 0.2 }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => childrenMap[id] && setSelectedSection({ id, content: childrenMap[id] })}
                    >
                        {childrenMap[id]}
                    </motion.div>
                ))}
            </div>

            <Dialog open={!!selectedSection} onOpenChange={() => setSelectedSection(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Section: {selectedSection?.id}</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                        <p>Content: {selectedSection?.content}</p>
                        <p className="mt-2 text-sm text-gray-500">
                            Grid Area: {selectedLayout.find(item => item.id === selectedSection?.id)?.gridArea}
                        </p>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdvancedDynamicLayoutNew;
