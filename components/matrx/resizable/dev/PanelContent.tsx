import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Maximize2, Minimize2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type PanelPosition = 'left' | 'right' | 'top' | 'bottom';

const PanelContent = ({
                          position,
                          header,
                          headerProps,
                          children
                      }: {
    position?: PanelPosition;
    header?: React.ReactNode;
    headerProps?: object;
    children?: React.ReactNode;
}) => {
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Choose the appropriate chevron based on position
    const getChevron = () => {
        if (isCollapsed) {
            switch (position) {
                case 'left': return <ChevronRight className="h-3 w-3" />;
                case 'right': return <ChevronLeft className="h-3 w-3" />;
                case 'top': return <ChevronDown className="h-3 w-3" />;
                case 'bottom': return <ChevronUp className="h-3 w-3" />;
                default: return <ChevronRight className="h-3 w-3" />;
            }
        }
        switch (position) {
            case 'left': return <ChevronLeft className="h-3 w-3" />;
            case 'right': return <ChevronRight className="h-3 w-3" />;
            case 'top': return <ChevronUp className="h-3 w-3" />;
            case 'bottom': return <ChevronDown className="h-3 w-3" />;
            default: return <ChevronLeft className="h-3 w-3" />;
        }
    };

    return (
        <Card className={cn(
            "h-full shadow-lg",
            isFullScreen && "fixed inset-0 z-50"
        )}>
            <div className="border-b p-3 flex items-center bg-background sticky top-0 z-10">
                <div className="flex-1 min-w-[200px]">
                    {header}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsFullScreen(!isFullScreen)}
                        className="h-6 px-2"
                    >
                        {isFullScreen ? (
                            <Minimize2 className="h-3 w-3" />
                        ) : (
                             <Maximize2 className="h-3 w-3" />
                         )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className="h-6 px-2"
                    >
                        {getChevron()}
                    </Button>
                </div>
            </div>
            {!isCollapsed && (
                <div className="overflow-auto h-full">
                    {children}
                </div>
            )}
        </Card>
    );
};

export default PanelContent;
