'use client';

import React from 'react';
import { motion } from 'motion/react';

const layouts = {
    complexDashboard: [
        { gridArea: '1 / 1 / 3 / 4', minHeight: '250px' },
        { gridArea: '1 / 4 / 2 / 7', minHeight: '120px' },
        { gridArea: '2 / 4 / 3 / 7', minHeight: '120px' },
        { gridArea: '1 / 7 / 3 / 9', minHeight: '250px' },
        { gridArea: '3 / 1 / 5 / 3', minHeight: '200px' },
        { gridArea: '3 / 3 / 4 / 5', minHeight: '100px' },
        { gridArea: '4 / 3 / 5 / 5', minHeight: '100px' },
        { gridArea: '3 / 5 / 5 / 7', minHeight: '200px' },
        { gridArea: '3 / 7 / 4 / 9', minHeight: '100px' },
        { gridArea: '4 / 7 / 5 / 9', minHeight: '100px' },
        { gridArea: '5 / 1 / 6 / 5', minHeight: '150px' },
        { gridArea: '5 / 5 / 6 / 9', minHeight: '150px' },
    ],
    newsLayout: [
        { gridArea: '1 / 1 / 3 / 5', minHeight: '300px' },
        { gridArea: '1 / 5 / 2 / 7', minHeight: '150px' },
        { gridArea: '2 / 5 / 3 / 7', minHeight: '150px' },
        { gridArea: '1 / 7 / 3 / 9', minHeight: '300px' },
        { gridArea: '3 / 1 / 4 / 3', minHeight: '120px' },
        { gridArea: '3 / 3 / 4 / 5', minHeight: '120px' },
        { gridArea: '3 / 5 / 4 / 7', minHeight: '120px' },
        { gridArea: '3 / 7 / 4 / 9', minHeight: '120px' },
        { gridArea: '4 / 1 / 6 / 4', minHeight: '250px' },
        { gridArea: '4 / 4 / 5 / 6', minHeight: '125px' },
        { gridArea: '5 / 4 / 6 / 6', minHeight: '125px' },
        { gridArea: '4 / 6 / 6 / 9', minHeight: '250px' },
    ],
    // Add more layout configurations here
};

const AdvancedLayout = ({ layoutType, children }) => {
    const selectedLayout = layouts[layoutType] || layouts.complexDashboard;

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'auto',
        gap: '1rem',
        padding: '1rem',
        backgroundColor: '#1a202c',
        borderRadius: '0.5rem',
        minHeight: '100vh',
    };

    return (
        <div style={gridStyle}>
            {React.Children.map(children, (child, index) => {
                if (index >= selectedLayout.length) return null;
                const { gridArea, minHeight } = selectedLayout[index];
                return (
                    <motion.div
                        style={{
                            gridArea,
                            minHeight,
                            backgroundColor: '#2d3748',
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
                        {child}
                    </motion.div>
                );
            })}
        </div>
    );
};

export default AdvancedLayout;