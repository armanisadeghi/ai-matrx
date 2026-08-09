import React, { ReactNode } from 'react';
import { motion } from 'motion/react';

interface MatrixHoverTooltipProps {
    children: ReactNode;
    content: ReactNode;
    className?: string;
}

export const MatrixHoverTooltip: React.FC<MatrixHoverTooltipProps> = ({ children, content, className = '' }) => {
    return (
        <div className={`relative ${className}`}>
            <div className="hover-target">
                {children}
            </div>
            <motion.div
                className="absolute left-full top-0 ml-2 bg-popover text-popover-foreground border border-border shadow-lg p-2 rounded text-sm z-10"
                initial={{ opacity: 0, y: -10 }}
                whileHover={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
            >
                {content}
            </motion.div>
        </div>
    );
};
