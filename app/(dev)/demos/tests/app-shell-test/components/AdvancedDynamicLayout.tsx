'use client';

import React from 'react';
import { motion } from 'motion/react';
import {ChildProps } from '../types';
import { layouts } from '../app-data';

const AdvancedDynamicLayout = ({ layoutType, children }) => {
    const [windowWidth, setWindowWidth] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 0);

    React.useEffect(() => {
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

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridTemplateRows: 'auto',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#1a202c',
        borderRadius: '0.5rem',
        minHeight: '100vh',
    };

    const childrenMap = React.Children.toArray(children).reduce<Record<string, React.ReactNode>>((acc, child) => {
        if (React.isValidElement<ChildProps>(child) && child.props.id) {
            acc[child.props.id] = child;
        }
        return acc;
    }, {});

    return (
        <div style={gridStyle}>
            {selectedLayout.map(({ id, gridArea, minHeight }) => (
                <motion.div
                    key={id}
                    style={{
                        gridArea,
                        minHeight,
                        backgroundColor: childrenMap[id] ? '#2d3748' : '#4a5568',
                        borderRadius: '0.375rem',
                        padding: '1rem',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    {childrenMap[id] || <div className="text-gray-500">Empty Block</div>}
                </motion.div>
            ))}
        </div>
    );
};

export default AdvancedDynamicLayout;