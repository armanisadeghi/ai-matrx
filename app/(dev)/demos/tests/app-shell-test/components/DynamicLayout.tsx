import React from 'react';
import { motion } from 'motion/react';

const layouts = {
    fourEqualTop: [
        { gridColumn: 'span 3', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 3', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 3', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 3', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 6', gridRow: 'span 2', minHeight: '200px' },
        { gridColumn: 'span 6', gridRow: 'span 2', minHeight: '200px' },
        { gridColumn: 'span 4', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 4', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 4', gridRow: 'span 1', minHeight: '100px' },
    ],
    twoColumnsVaried: [
        { gridColumn: 'span 6', gridRow: 'span 2', minHeight: '200px' },
        { gridColumn: 'span 6', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 6', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 6', gridRow: 'span 3', minHeight: '300px' },
        { gridColumn: 'span 6', gridRow: 'span 1', minHeight: '100px' },
        { gridColumn: 'span 6', gridRow: 'span 1', minHeight: '100px' },
    ],
    // Add more layout configurations as needed
};

const DynamicLayout = ({ layoutType, children }) => {
    const selectedLayout = layouts[layoutType] || layouts.fourEqualTop;

    return (
        <div className="grid grid-cols-12 gap-4 p-4 bg-gray-900 min-h-screen">
            {React.Children.map(children, (child, index) => {
                if (index >= selectedLayout.length) return null;
                const { gridColumn, gridRow, minHeight } = selectedLayout[index];
                return (
                    <motion.div
                        className={`${gridColumn} ${gridRow} bg-gray-800 rounded-lg p-4 shadow-lg`}
                        style={{ minHeight }}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="w-full h-full flex items-center justify-center text-white font-semibold">
                            {child}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default DynamicLayout;