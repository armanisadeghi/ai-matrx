'use client';

import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';

const Tooltip = ({ children, arrowDirection, offset }) => {
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [arrowPosition, setArrowPosition] = useState('0px');
    const tooltipClass = 'bg-gray-800 text-white text-sm py-1 px-2 rounded shadow-lg';
    const arrowClass = 'absolute w-2 h-2 bg-gray-800 transform rotate-45';

    useEffect(() => {
        if (tooltipRef.current) {
            const tooltipWidth = tooltipRef.current.offsetWidth;
            const tooltipHeight = tooltipRef.current.offsetHeight;
            const arrowSize = 10; // 2rem = 8px

            let position;
            if (arrowDirection === 'top' || arrowDirection === 'bottom') {
                const maxOffset = tooltipWidth - arrowSize;
                position = ((offset + 100) / 200) * maxOffset;
                position = Math.max(0, Math.min(position, maxOffset));

            } else {
                const maxOffset = tooltipHeight - arrowSize;
                position = ((offset + 100) / 200) * maxOffset;
                position = Math.max(0, Math.min(position, maxOffset));
            }

            setArrowPosition(`${position}px`);
        }
    }, [arrowDirection, offset]);

    const getArrowStyle = () => {
        switch (arrowDirection) {
            case 'top':
                return { top: '-3px', left: arrowPosition };
            case 'bottom':
                return { bottom: '-4px', left: arrowPosition };
            case 'left':
                return { left: '-4px', top: arrowPosition };
            case 'right':
                return { right: '-4px', top: arrowPosition };
            default:
                return { top: '-3px', left: arrowPosition };
        }
    };

    return (
        <div className="relative inline-block">
            <motion.div
                ref={tooltipRef}
                className={`${tooltipClass} relative`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
            >
                {children}
                <div className={arrowClass} style={getArrowStyle()} />
            </motion.div>
        </div>
    );
};

export default Tooltip;
