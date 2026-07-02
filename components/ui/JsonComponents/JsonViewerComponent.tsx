'use client';

import React, {useState, useCallback, useMemo} from 'react';
import {Card} from '@/components/ui/card';
import { Button } from "@/components/ui/button";
import {cn} from '@/lib/utils';
import {Copy, ChevronDown, ChevronUp, Minimize2, Expand} from 'lucide-react';
import JsonViewerItem from './JsonViewerItem';
import {stabilizeData} from './utils';
import type {JsonValue} from '@/types/json';

interface JsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
    data: object | string;
    className?: string;
    initialExpanded?: boolean;
    maxHeight?: string;
    disabled?: boolean;
    hideControls?: boolean;
}

export const JsonViewer: React.FC<JsonViewerProps> = (
    {
        data,
        className,
        initialExpanded = false,
        maxHeight = '400px',
        disabled = false,
        hideControls = false,
        ...props
    }) => {
    const [isCopied, setIsCopied] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

    const parsedData = useMemo((): JsonValue | null => {
        let initialData: JsonValue | null;
        if (typeof data === 'string') {
            try {
                initialData = JSON.parse(data) as JsonValue;
            } catch {
                return null;
            }
        } else {
            initialData = typeof data === 'object' && data !== null ? (data as JsonValue) : null;
        }
        return initialData === null ? null : stabilizeData(initialData);
    }, [data]);

    const copyToClipboard = useCallback(() => {
        if (disabled) return;
        navigator.clipboard.writeText(JSON.stringify(parsedData, null, 2));
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    }, [parsedData, disabled]);

    const toggleExpand = useCallback(
        (key: string) => {
            if (disabled) return;
            setExpandedKeys((prev) => {
                const newSet = new Set(prev);
                if (newSet.has(key)) {
                    newSet.delete(key);
                } else {
                    newSet.add(key);
                }
                return newSet;
            });
        },
        [disabled]
    );

    const isKeyExpanded = useCallback(
        (key: string) => expandedKeys.has(key),
        [expandedKeys]
    );

    const hasExpandableItems = useCallback((obj: JsonValue | null): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;
        return Object.values(obj).some(value =>
            typeof value === 'object' && value !== null && Object.keys(value).length > 0
        );
    }, []);

    const expandAll = useCallback(() => {
        if (disabled || !parsedData) return;
        const allKeys = getAllKeys(parsedData);
        setExpandedKeys(new Set(allKeys));
    }, [parsedData, disabled]);

    const collapseAll = useCallback(() => {
        if (disabled) return;
        setExpandedKeys(new Set());
    }, [disabled]);

    const getAllKeys = useCallback((obj: JsonValue | null, currentPath = ''): string[] => {
        if (typeof obj !== 'object' || obj === null) return [];
        let keys: string[] = [];
        for (const key in obj) {
            const child = (obj as Record<string, JsonValue | undefined>)[key];
            const fullPath = currentPath ? `${currentPath}.${key}` : key;
            if (typeof child === 'object' && child !== null && Object.keys(child).length > 0) {
                keys.push(fullPath);
                keys = keys.concat(getAllKeys(child, fullPath));
            }
        }
        return keys;
    }, []);

    const isEmpty = !parsedData || (typeof parsedData === 'object' && Object.keys(parsedData).length === 0);
    const showControls = !hideControls && !isEmpty && (hasExpandableItems(parsedData) || parsedData);

    if (isEmpty) {
        return (
            <div
                className={cn(
                    "bg-background text-muted-foreground p-2 text-sm rounded-md border border-border/30 transition-all duration-300 ease-in-out",
                    className
                )}
            >
                {!parsedData ? 'Invalid JSON' : '{Empty JSON}'}
            </div>
        );
    }

    return (
        <div
            className={cn(
                "relative bg-background text-foreground rounded-md overflow-auto border border-border/30 transition-all duration-300 ease-in-out",
                disabled && "opacity-70 pointer-events-none",
                className
            )}
            style={{maxHeight}}
            {...props}
        >
            {showControls && (
                <div className="absolute right-2 top-2 flex flex-col gap-2 z-10">
                    {hasExpandableItems(parsedData) && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={expandedKeys.size ? collapseAll : expandAll}
                            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 transition-colors duration-200"
                            disabled={disabled}
                        >
                            {expandedKeys.size ? (
                                <ChevronUp className="h-3 w-3 "/>
                            ) : (
                                <ChevronDown className="h-3 w-3 "/>
                            )}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-200"
                        disabled={disabled}
                    >
                        <Copy className="h-3 w-3"/>
                    </Button>
                </div>
            )}
            <div className="pl-1 pt-1 pb-2 pr-10">
                {parsedData && typeof parsedData === 'object' && Object.entries(parsedData).map(([key, value], index, arr) => (
                    <JsonViewerItem
                        key={key}
                        path={key}
                        keyName={key}
                        value={(value as JsonValue) ?? null}
                        isExpanded={isKeyExpanded(key)}
                        onToggle={toggleExpand}
                        isKeyExpanded={isKeyExpanded}
                        disabled={disabled}
                        isLastItem={index === arr.length - 1}
                    />
                ))}
            </div>
        </div>
    );
};

export interface FullJsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
    data: object | string;
    title?: string;
    initialExpanded?: boolean;
    maxHeight?: string;
    className?: string;
    disabled?: boolean;
    hideControls?: boolean;
    hideTitle?: boolean;
}

export const FullJsonViewer: React.FC<FullJsonViewerProps> = (
    {
        data,
        title = "JSON Data",
        className,
        disabled = false,
        hideControls = false,
        hideTitle = false,
        ...props
    }) => {
    return (
        <Card
            className={cn(
                "p-1 bg-card transition-all duration-300 ease-in-out",
                disabled && "opacity-70",
                className
            )}
        >
            {!hideTitle && (
                <h3 className={cn(
                    "text-xs font-semibold mb-1 transition-colors duration-200",
                    disabled ? "text-muted-foreground" : "text-foreground"
                )}>
                    {title}
                </h3>
            )}
            <JsonViewer
                data={data}
                disabled={disabled}
                hideControls={hideControls}
                {...props}
            />
        </Card>
    );
};

export interface EnhancedJsonViewerProps extends React.HTMLAttributes<HTMLDivElement> {
    data: object | string;
    title?: string;
    initialExpanded?: boolean;
    maxHeight?: string;
    className?: string;
    allowMinimize?: boolean;
    isMinimized?: boolean;
    onMinimizeChange?: (isMinimized: boolean) => void;
    id?: string;
    hideHeader?: boolean;
    disabled?: boolean;
    hideControls?: boolean;
}

export const EnhancedJsonViewer: React.FC<EnhancedJsonViewerProps> = ({
    data,
    title = "JSON Data",
    className,
    allowMinimize = false,
    isMinimized: controlledIsMinimized,
    onMinimizeChange,
    id,
    hideHeader = false,
    disabled = false,
    hideControls = false,
    ...props
}) => {
    const [localIsMinimized, setLocalIsMinimized] = useState(false);
    const isMinimized = controlledIsMinimized ?? localIsMinimized;

    const handleMinimizeToggle = () => {
        if (disabled) return;
        const newValue = !isMinimized;
        setLocalIsMinimized(newValue);
        onMinimizeChange?.(newValue);
    };

    const renderViewerContent = () => (
        <JsonViewer
            data={data}
            title={hideHeader ? title : undefined}
            disabled={disabled}
            hideControls={hideControls}
            {...props}
        />
    );

    if (disabled && isMinimized) {
        return (
            <Card className={cn("bg-card opacity-70 transition-all duration-300 ease-in-out", className)}>
                {!hideHeader && (
                    <div className="flex justify-between items-center mb-1 p-1">
                        <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
                    </div>
                )}
                <div className={cn(!hideHeader && "px-1 pb-1")}>
                    {renderViewerContent()}
                </div>
            </Card>
        );
    }

    return (
        <div className={cn(
            "relative",
            disabled && "opacity-70 pointer-events-none",
            "transition-all duration-300 ease-in-out",
            className
        )}>
            <div className="transition-all duration-300 ease-in-out">
                {isMinimized ? (
                    <div
                        className={cn(
                            "flex items-center gap-3 bg-secondary rounded-full px-4 py-1 shadow-xl border",
                            !disabled && "cursor-pointer hover:bg-primary/90 text-foreground transition-colors duration-200",
                            "transform-gpu transition-all duration-300 ease-in-out"
                        )}
                        onClick={handleMinimizeToggle}
                    >
                        <span className={cn(
                            "text-md font-medium truncate max-w-[200px] transition-colors duration-200",
                            disabled && "text-muted-foreground"
                        )}>
                            {title}
                        </span>
                        <Expand className={cn(
                            "h-4 w-4 transition-colors duration-200",
                            disabled
                                ? "text-muted-foreground"
                                : "text-primary group-hover:text-foreground"
                        )}/>
                    </div>
                ) : (
                    <div className="transform-gpu transition-all duration-300 ease-in-out">
                        <Card className={cn("bg-card", !hideHeader && "p-2")}>
                            {!hideHeader && (
                                <div className="flex justify-between items-center mb-1">
                                    <h3 className={cn(
                                        "text-sm font-semibold transition-colors duration-200",
                                        disabled ? "text-muted-foreground" : "text-foreground"
                                    )}>
                                        {title}
                                    </h3>
                                    {allowMinimize && !disabled && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleMinimizeToggle}
                                            className="h-6 w-6 p-0 hover:bg-secondary/80 transition-colors duration-200"
                                        >
                                            <Minimize2 className="h-4 w-4"/>
                                        </Button>
                                    )}
                                </div>
                            )}
                            <div className={cn(!hideHeader && "mt-0")}>
                                {renderViewerContent()}
                            </div>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

interface EnhancedJsonViewerGroupProps {
    viewers?: Array<{
        id?: string;
        data: object | string;
        title: string;
        allowMinimize?: boolean;
        disabled?: boolean;
        hideControls?: boolean;
        hideHeader?: boolean;
        maxHeight?: string;
        className?: string;
    }>;
    layout?: 'grid' | 'rows' | 'columns' | 'autoGrid';
    minimizedPosition?: 'top' | 'bottom' | 'left' | 'right';
    className?: string;
    gridMinWidth?: string;
    disabled?: boolean;
}

export const EnhancedJsonViewerGroup: React.FC<EnhancedJsonViewerGroupProps> = ({
    viewers = [],
    layout = 'autoGrid',
    minimizedPosition = 'top',
    className,
    gridMinWidth = '350px',
    disabled: groupDisabled = false,
}) => {
    const viewersWithUniqueIds = useMemo(() => {
        if (!Array.isArray(viewers) || viewers.length === 0) {
            return [];
        }

        const idTracker = new Set<string>();
        return viewers.map((viewer, index) => {
            let uniqueId = viewer.id || `viewer-${index}-new`;
            while (idTracker.has(uniqueId)) {
                uniqueId = `${uniqueId}-${Math.random().toString(36).substr(2, 5)}`;
            }
            idTracker.add(uniqueId);
            return {...viewer, id: uniqueId};
        });
    }, [viewers]);

    const [minimizedStates, setMinimizedStates] = useState<Record<string, boolean>>({});

    const handleMinimizeChange = useCallback((id: string, isMinimized: boolean) => {
        if (groupDisabled) return;
        setMinimizedStates(prev => ({...prev, [id]: isMinimized}));
    }, [groupDisabled]);

    const {minimizedViewers, expandedViewers} = useMemo(() => {
        return viewersWithUniqueIds.reduce(
        (acc, viewer) => {
            if (minimizedStates[viewer.id] && !groupDisabled && !viewer.disabled) {
                acc.minimizedViewers.push(viewer);
            } else {
                acc.expandedViewers.push(viewer);
            }
            return acc;
        },
        {minimizedViewers: [], expandedViewers: []} as {
            minimizedViewers: typeof viewersWithUniqueIds;
            expandedViewers: typeof viewersWithUniqueIds;
        }
    );
    }, [viewersWithUniqueIds, minimizedStates, groupDisabled]);

    const layoutClasses = {
        grid: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1',
        autoGrid: 'grid gap-1',
        rows: 'flex flex-col gap-1',
        columns: 'flex flex-row gap-1 flex-wrap',
    };

    const minimizedAreaClasses = {
        top: 'flex flex-wrap gap-4 mb-2',
        bottom: 'flex flex-wrap gap-4 mt-2',
        left: 'flex flex-col gap-4 mr-4 w-60',
        right: 'flex flex-col gap-4 ml-2 w-60',
    };

    const getLayoutStyle = () => {
        if (layout === 'autoGrid') {
            return {
                gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth}, 1fr))`,
            };
        }
        return {};
    };

    const isHorizontalMinimized = minimizedPosition === 'top' || minimizedPosition === 'bottom';

    const renderViewerComponent = useCallback((
        viewer: typeof viewersWithUniqueIds[0],
        isMinimized: boolean
    ) => {
        const uniqueKey = `${viewer.id}-${isMinimized ? 'min' : 'exp'}`;

        return (
            <div
                key={uniqueKey}
                className="transform-gpu transition-all duration-300 ease-in-out"
            >
                <EnhancedJsonViewer
                    {...viewer}
                    disabled={groupDisabled || viewer.disabled}
                    isMinimized={isMinimized}
                    onMinimizeChange={(minimized) =>
                        handleMinimizeChange(viewer.id, minimized)
                    }
                    className={cn(
                        viewer.className,
                        groupDisabled && 'opacity-70',
                        'transition-all duration-300'
                    )}
                />
            </div>
        );
    }, [groupDisabled, handleMinimizeChange]);

    if (!Array.isArray(viewers) || viewers.length === 0) {
        return null;
    }

    return (
        <div
            className={cn(
                'flex',
                isHorizontalMinimized ? 'flex-col' : 'flex-row',
                groupDisabled && 'opacity-70',
                'transition-all duration-300 ease-in-out',
                className
            )}
        >
            {(minimizedPosition === 'top' || minimizedPosition === 'left') &&
                minimizedViewers.length > 0 &&
                !groupDisabled && (
                    <div className={cn(
                        minimizedAreaClasses[minimizedPosition],
                        'transition-all duration-300 ease-in-out'
                    )}>
                        {minimizedViewers.map((viewer) =>
                            renderViewerComponent(viewer, true)
                        )}
                    </div>
                )}

            <div
                className={cn(
                    'flex-1',
                    layoutClasses[layout],
                    'transition-all duration-300 ease-in-out'
                )}
                style={getLayoutStyle()}
            >
                {expandedViewers.map((viewer) =>
                    renderViewerComponent(viewer, false)
                )}
            </div>

            {(minimizedPosition === 'bottom' || minimizedPosition === 'right') &&
                minimizedViewers.length > 0 &&
                !groupDisabled && (
                    <div className={cn(
                        minimizedAreaClasses[minimizedPosition],
                        'transition-all duration-300 ease-in-out'
                    )}>
                        {minimizedViewers.map((viewer) =>
                            renderViewerComponent(viewer, true)
                        )}
                    </div>
                )}
        </div>
    );
};

export default EnhancedJsonViewerGroup;
