import React from 'react';
import {Button} from '@/components/ui/button';
import {ChevronRight, ChevronLeft, ChevronUp, ChevronDown} from 'lucide-react';
import {cn} from '@/lib/utils';

interface ExpandButtonProps {
    position: 'left' | 'right' | 'top' | 'bottom';
    label: string;
    onClick: () => void;
    className?: string;
}

const ExpandButton: React.FC<ExpandButtonProps> = (
    {
        position,
        label,
        onClick,
        className
    }) => {
    // Define position-specific styles
    const buttonPositionStyles = {
        left: "fixed top-4 left-4",
        right: "fixed top-4 right-4",
        top: "fixed top-4 left-4",
        bottom: "fixed bottom-4 right-4"
    }[position];

    // Define the appropriate chevron icon based on position
    const ChevronIcon = {
        left: ChevronRight,
        right: ChevronLeft,
        top: ChevronDown,
        bottom: ChevronUp
    }[position];

    return (
        <div className={cn(
            buttonPositionStyles,
            "z-[9998]",
            className
        )}>
            <Button
                icon={<ChevronIcon/>}
                variant="outline"
                onClick={onClick}
            >
                {label}
            </Button>
        </div>
    );
};

export default ExpandButton;
