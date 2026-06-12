import React from 'react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/matrx/resizable";
import {Button} from '@/components/ui/button';
import {ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Maximize2, Minimize2} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {cn} from '@/lib/utils';
import {type GroupImperativeHandle, type Layout} from 'react-resizable-panels';
import type {CSSProperties} from 'react';

type PanelPosition = 'left' | 'right' | 'top' | 'bottom';

interface MatrxPanelProps {
    position?: PanelPosition;
    className?: string;
    defaultExpanded?: boolean;
    isExpanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
    header?: React.ReactNode;
    children: React.ReactNode;
    expandButtonProps?: {
        label?: string;
        className?: string;
    };
}

const MatrxPanel: React.FC<MatrxPanelProps> = (
    {
        position = 'left',
        className = '',
        defaultExpanded = false,
        isExpanded: controlledExpanded,
        onExpandedChange,
        defaultSize = 20,
        minSize = 1,
        maxSize = 100,
        header,
        children,
        expandButtonProps = {
            label: 'Expand Panel',
            className: undefined
        }
    }) => {
    const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded);
    const [isFullScreen, setIsFullScreen] = React.useState(false);
    const [lastSize, setLastSize] = React.useState(defaultSize);
    const [preFullScreenSize, setPreFullScreenSize] = React.useState<number | null>(defaultSize);
    const [panelKey, setPanelKey] = React.useState(0);
    const isExpanded = controlledExpanded ?? localExpanded;

    const panelGroupRef = React.useRef<GroupImperativeHandle | null>(null);

    const isVertical = position === 'top' || position === 'bottom';
    const isStartPosition = position === 'left' || position === 'top';

    React.useEffect(() => {
        if (!isFullScreen && preFullScreenSize !== null) {
            setPanelKey(prev => prev + 1);
        }
    }, [isFullScreen, preFullScreenSize]);

    const handleToggle = () => {
        const newValue = !isExpanded;
        setLocalExpanded(newValue);
        onExpandedChange?.(newValue);
    };

    const handleFullScreenToggle = () => {
        setIsFullScreen(prev => {
            if (!prev) {
                setPreFullScreenSize(lastSize);
                return true;
            }
            return false;
        });
    };

    const handlePanelResize = (layout: Layout) => {
        const contentSize = layout["panel-content"];
        if (contentSize != null && contentSize >= minSize && contentSize <= maxSize) {
            setLastSize(contentSize);
        }
    };

    const getPanelSizes = () => {
        // v4: numeric values = pixels, strings = percentages
        if (isFullScreen) {
            return {
                contentPanel: {
                    defaultSize: "100%",
                    minSize: "100%",
                    maxSize: "100%",
                },
                spacerPanel: {
                    defaultSize: "0%",
                    minSize: "0%",
                    maxSize: "0%",
                }
            };
        }

        const currentSize = preFullScreenSize ?? lastSize;

        return {
            contentPanel: {
                defaultSize: `${currentSize}%`,
                minSize: `${minSize}%`,
                maxSize: `${maxSize}%`,
            },
            spacerPanel: {
                defaultSize: `${100 - currentSize}%`,
                minSize: `${100 - maxSize}%`,
                maxSize: `${100 - minSize}%`,
            }
        };
    };

    const handleStyles = (isVertical: boolean, isFullScreen: boolean): CSSProperties => ({
        visibility: isFullScreen ? 'hidden' as const : 'visible' as const,
        ...(isVertical ? {
            margin: '0 auto',
            width: '100%',
            maxWidth: '64px',
        } : {})
    });

    const getPositionStyles = () => {
        const positionMap = {
            left: {
                container: 'fixed inset-y-0 left-0',
                dimensions: {width: '100vw'},
                button: 'left-4 top-4',
                panel: 'left-0',
                border: 'border-r',
                chevron: {
                    collapsed: ChevronRight,
                    expanded: ChevronLeft
                }
            },
            right: {
                container: 'fixed inset-y-0 right-0',
                dimensions: {width: '100vw'},
                button: 'right-4 top-4',
                panel: 'right-0',
                border: 'border-l',
                chevron: {
                    collapsed: ChevronLeft,
                    expanded: ChevronRight
                }
            },
            top: {
                container: 'fixed inset-x-0 top-0',
                dimensions: {height: '100dvh'},
                button: 'top-4 left-4',
                panel: 'top-0',
                border: 'border-b',
                chevron: {
                    collapsed: ChevronDown,
                    expanded: ChevronUp
                }
            },
            bottom: {
                container: 'fixed inset-x-0 bottom-0',
                dimensions: {height: '100dvh'},
                button: 'bottom-4 right-4',
                panel: 'bottom-0',
                border: 'border-t',
                chevron: {
                    collapsed: ChevronUp,
                    expanded: ChevronDown
                }
            }
        };

        return positionMap[position];
    };

    if (!isExpanded) {
        const styles = getPositionStyles();
        const ChevronIcon = styles.chevron.collapsed;

        return (
            <div className={cn(`fixed ${styles.button} z-50`, expandButtonProps.className)}>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggle}
                    className="bg-background border shadow-md h-6 px-2 py-1 text-xs"
                >
                    <ChevronIcon className="h-3 w-3 mr-1"/>
                    {expandButtonProps.label}
                </Button>
            </div>
        );
    }

    const panelSizes = getPanelSizes();
    const styles = getPositionStyles();
    const ChevronIcon = styles.chevron.expanded;

    const panels = [
        <ResizablePanel
            key="spacer"
            id="panel-spacer"
            {...panelSizes.spacerPanel}
            style={{visibility: isFullScreen ? 'hidden' : 'visible'}}
        >
            <div className="h-full"/>
        </ResizablePanel>,

        <ResizableHandle
            key="handle"
            withHandle
            size="lg"
            style={handleStyles(isVertical, isFullScreen)}
            className={cn(
                isVertical
                ? "hover:cursor-row-resize active:cursor-row-resize"
                : "hover:cursor-col-resize active:cursor-col-resize"
            )}
        />,

        <ResizablePanel
            key="content"
            id="panel-content"
            {...panelSizes.contentPanel}
        >
            <Card
                className={cn("h-full shadow-lg", styles.border)}
                style={{
                    touchAction: 'pan-y',
                    transform: 'translate3d(0,0,0)',
                }}
            >
                <div
                    className={cn(
                        "border-b p-3 flex items-center bg-background sticky top-0",
                        isVertical ? "justify-between" : "flex-wrap gap-2"
                    )}
                    style={{zIndex: 10}}
                >
                    <div className={isVertical ? "flex-1" : "flex-1 min-w-[200px]"}>
                        {header}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleFullScreenToggle}
                            className="h-6 px-2"
                        >
                            {isFullScreen ?
                             <Minimize2 className="h-3 w-3"/> :
                             <Maximize2 className="h-3 w-3"/>
                            }
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleToggle}
                            className="h-6 px-2"
                        >
                            <ChevronIcon className="h-3 w-3"/>
                        </Button>
                    </div>
                </div>
                <div
                    className="overflow-auto"
                    style={{
                        height: 'calc(100% - 48px)',
                        touchAction: 'pan-y',
                    }}
                >
                    {children}
                </div>
            </Card>
        </ResizablePanel>
    ];

    return (
        <div
            className={cn(styles.container, "z-[100]", className)}
            style={{
                ...styles.dimensions,
                willChange: 'transform',
                isolation: 'isolate',
            }}
        >
            <ResizablePanelGroup
                key={panelKey}
                groupRef={panelGroupRef}
                orientation={isVertical ? 'vertical' : 'horizontal'}
                className="h-full"
                onLayoutChanged={handlePanelResize}
                style={{
                    touchAction: 'none',
                    userSelect: 'none',
                }}
            >
                {isStartPosition ? panels.reverse() : panels}
            </ResizablePanelGroup>
        </div>
    );
};

export default MatrxPanel;
