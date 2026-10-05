import React from 'react';
import {Button} from '@/components/ui/button';
import {ArrowLeft} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface MatrxPanelHeaderProps {
    position: 'left' | 'right' | 'top' | 'bottom';
    title?: React.ReactNode;
    description?: React.ReactNode;
    onBack?: () => void;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    className?: string;
}

const MatrxPanelHeader: React.FC<MatrxPanelHeaderProps> = (
    {
        position,
        title,
        description,
        onBack,
        leading,
        trailing,
        className,
    }) => {
    const isVertical = position === 'top' || position === 'bottom';

    const containerStyles = {
        top: "flex-col items-start w-full border-b",
        bottom: "flex-col items-start w-full border-t",
        left: "flex-row items-center h-full border-r",
        right: "flex-row items-center h-full border-l"
    }[position];

    const buttonStyles = {
        top: "absolute left-2 top-2",
        bottom: "absolute left-2 bottom-2",
        left: "absolute left-2 top-2",
        right: "absolute right-2 top-2"
    }[position];

    const contentStyles = {
        top: "w-full px-4 py-2",
        bottom: "w-full px-4 py-2",
        left: "h-full px-2 py-4",
        right: "h-full px-2 py-4"
    }[position];

    return (
        <div className={cn(
            "relative flex",
            containerStyles,
            className
        )}>
            {/* Back button with fixed positioning */}
            {onBack && (
                <Button
                    variant="quiet"
                    onClick={onBack}
                    className={cn("flex-shrink-0", buttonStyles)}
                >
                    <ArrowLeft className="h-4 w-4"/>
                </Button>
            )}

            {/* Main content container */}
            <div className={cn(
                "flex min-w-0",
                isVertical ? "flex-row items-center" : "flex-col items-start",
                contentStyles
            )}>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {leading}
                    <div className="truncate">
                        {typeof title === 'string' ? (
                            <h2 className="text-base font-semibold truncate">
                                {title}
                            </h2>
                        ) : title}
                        {description && (
                            <div className="text-xs text-muted-foreground truncate">
                                {description}
                            </div>
                        )}
                    </div>
                </div>

                {trailing && (
                    <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                        {trailing}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MatrxPanelHeader;
