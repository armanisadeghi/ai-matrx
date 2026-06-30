'use client';

import React, {useState, useCallback, useMemo, useEffect} from 'react';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/ButtonMine';
import {cn} from '@/lib/utils';
import {motion, AnimatePresence} from 'motion/react';
import {
    Copy,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Maximize2,
    Minimize2,
    BracketsIcon,
    Expand,
    Check
} from 'lucide-react';
import {MatrxFullJsonViewerProps, MatrxJsonItemProps, MatrxJsonViewerProps} from '@/types/componentConfigTypes';
import {densityConfig, getComponentStyles, jsonViewerConfig, useComponentAnimation} from '@/config/ui/FlexConfig';

const MatrxJsonItem: React.FC<MatrxJsonItemProps> = (
    {
        keyName,
        value,
        isExpanded,
        onToggle,
        isKeyExpanded,
        path,
        isLastItem,
        // Base props
        size = 'md',
        density = 'normal',
        variant = 'default',
        disabled = false,
        className,
        animation = 'subtle',
        disableAnimation = false,
        error,
        state = disabled ? 'disabled' : error ? 'error' : 'idle',
        ...props
    }) => {
    const [showFullItem, setShowFullItem] = useState<{ [key: string]: boolean }>({});
    const densityStyles = densityConfig[density];
    const config = jsonViewerConfig[density];
    const animationProps = useComponentAnimation(animation, disableAnimation);

    const isObject = typeof value === 'object' && value !== null;
    const isArray = Array.isArray(value);
    const hasContent = isObject && Object.keys(value).length > 0;

    const toggleShowFullItem = (itemPath: string) => {
        setShowFullItem(prev => ({
            ...prev,
            [itemPath]: !prev[itemPath]
        }));
    };

    const isSmallArray = isArray &&
        value.length <= config.arrayThreshold &&
        value.every(item =>
            typeof item !== 'object' ||
            (item === null) ||
            (typeof item === 'object' && Object.keys(item).length === 0)
        );

    const renderArrayItem = (item: any, itemPath: string, index: number, isLastItem: boolean) => {
        if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item);
            const shouldTruncate = entries.length > 4;
            const displayEntries = showFullItem[itemPath] ? entries : entries.slice(0, 4);

            return (
                <div className={cn(
                    "pl-4 py-1",
                    !isLastItem && "border-b border-border/30"
                )}>
                    {displayEntries.map(([k, v], idx, arr) => (
                        <MatrxJsonItem
                            key={`${itemPath}.${k}`}
                            path={`${itemPath}.${k}`}
                            keyName={k}
                            value={v}
                            isExpanded={isKeyExpanded ? isKeyExpanded(`${itemPath}.${k}`) : false}
                            onToggle={onToggle}
                            isKeyExpanded={isKeyExpanded}
                            disabled={disabled}
                            isLastItem={idx === arr.length - 1}
                            size={size}
                            density={density}
                            variant={variant}
                            animation={animation}
                            state={state}
                            className={className}
                        />
                    ))}
                    {shouldTruncate && (
                        <div
                            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer pl-2 mt-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleShowFullItem(itemPath);
                            }}
                        >
                            {showFullItem[itemPath] ?
                             "Show less..." :
                             `Show ${entries.length - 4} more items...`}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div className={cn(
                "pl-4 py-1",
                !isLastItem && "border-b border-border/30"
            )}>
                <span
                    className={cn(
                        "text-md",
                        disabled && "text-muted-foreground",
                        !disabled && {
                            "text-green-500": typeof item === 'string',
                            "text-blue-500": typeof item === 'number',
                            "text-yellow-500": typeof item === 'boolean',
                            "text-red-500": item === null,
                        }
                    )}
                >
                    {item === null ? 'null' : JSON.stringify(item)}
                </span>
            </div>
        );
    };

    const renderInlineArray = (arr: any[]) => {
        return (
            <span className="text-blue-500">
                [
                {arr.map((item, index) => (
                    <React.Fragment key={index}>
                        <span className={cn(
                            disabled && "text-muted-foreground",
                            !disabled && {
                                "text-green-500": typeof item === 'string',
                                "text-blue-500": typeof item === 'number',
                                "text-yellow-500": typeof item === 'boolean',
                                "text-red-500": item === null,
                            }
                        )}>
                            {item === null ? 'null' : JSON.stringify(item)}
                        </span>
                        {index < arr.length - 1 && ", "}
                    </React.Fragment>
                ))}
                ]
            </span>
        );
    };

    return (
        <div
            className={cn(
                "relative",
                !isLastItem && "border-l border-border/30",
                className
            )}
            {...props}
        >
            <div
                className={cn(
                "grid grid-cols-[auto,1fr] items-start",
                config.spacing,
                hasContent && !isSmallArray && "cursor-pointer hover:bg-muted/50",
                disabled && "cursor-not-allowed",
                variant === 'primary' && 'hover:bg-primary/10',
                variant === 'secondary' && 'hover:bg-secondary/10',
                variant === 'destructive' && 'hover:bg-destructive/10'
                )}
                onClick={hasContent && !isSmallArray && !disabled && onToggle && path ? () => onToggle(path) : undefined}
            >
            {/* Icon Column */}
            <div className={cn("flex items-center justify-center", config.itemPadding)}>
                {hasContent && !isSmallArray ? (
                    <ChevronDown
                        className={cn(
                            config.iconSize[size],
                            "transition-transform shrink-0",
                            !isExpanded && "rotate-[-90deg]",
                            disabled ? "text-muted-foreground" : cn(
                                variant === 'primary' && 'text-primary',
                                variant === 'secondary' && 'text-secondary',
                                variant === 'destructive' && 'text-destructive',
                                'text-foreground'
                            )
                        )}
                    />
                ) : (
                    <div className={config.iconSize[size]} />
                 )}
            </div>

            {/* Content Column */}
            <div className={cn(
                "flex items-center flex-wrap min-w-0",
                config.itemPadding
            )}>
                    <span className={cn(
                    "font-medium shrink-0",
                    config.fontSize[size],
                    disabled ? "text-muted-foreground" : cn(
                        variant === 'primary' && 'text-primary',
                        variant === 'secondary' && 'text-secondary',
                        variant === 'destructive' && 'text-destructive',
                        'text-foreground'
                    )
                    )}>
                        {keyName}
                    </span>
                    {isArray && (
                    <BracketsIcon className={cn(
                        "ml-1 shrink-0",
                        config.iconSize[size],
                        "text-blue-500"
                    )} />
                    )}

                <span className="mx-1 shrink-0">:</span>

                    {!isObject && (
                        <span
                            className={cn(
                        config.fontSize[size],
                        "break-all",
                        disabled ? "text-muted-foreground" : {
                                    "text-green-500": typeof value === 'string',
                                    "text-blue-500": typeof value === 'number',
                                    "text-yellow-500": typeof value === 'boolean',
                                    "text-red-500": value === null,
                                }
                            )}
                        >
                            {value === null ? 'null' : JSON.stringify(value)}
                        </span>
                    )}
                    {isObject && !hasContent && (
                    <span className={cn(
                        config.fontSize[size],
                        "text-muted-foreground italic"
                    )}>
                            {isArray ? '[]' : '{}'}
                        </span>
                    )}
                    {isSmallArray && hasContent && renderInlineArray(value)}
                    {isArray && !isSmallArray && hasContent && !isExpanded && (
                        <span className="text-muted-foreground ml-1">
                            [{value.length} items]
                        </span>
                    )}
                </div>
            </div>

            {hasContent && !isSmallArray && isExpanded && (
                <AnimatePresence>
                    <motion.div
                        initial={{opacity: 0, height: 0}}
                        animate={{opacity: 1, height: 'auto'}}
                        exit={{opacity: 0, height: 0}}
                        transition={{duration: 0.2}}
                    className={config.indentSize}
                    >
                        {isArray ? (
                            <div className="flex flex-col border-l border-border/30">
                                {value.map((item, index) =>
                                    renderArrayItem(
                                        item,
                                        `${path}.${index}`,
                                        index,
                                        index === value.length - 1
                                    )
                                )}
                            </div>
                        ) : (
                             Object.entries(value).map(([k, v], index, arr) => (
                                 <MatrxJsonItem
                                     key={`${path}.${k}`}
                                     path={`${path}.${k}`}
                                     keyName={k}
                                     value={v}
                                     isExpanded={isKeyExpanded ? isKeyExpanded(`${path}.${k}`) : false}
                                     onToggle={onToggle}
                                     isKeyExpanded={isKeyExpanded}
                                     disabled={disabled}
                                     isLastItem={index === arr.length - 1}
                                     size={size}
                                     density={density}
                                     variant={variant}
                                     animation={animation}
                                     state={state}
                                     className={className}
                                 />
                             ))
                         )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};


export const MatrxJsonViewer: React.FC<MatrxJsonViewerProps> = (
    {
        // Base props
        className,
        size = 'md',
        density = 'normal',
        variant = 'default',
        disabled = false,
        animation = 'subtle',
        disableAnimation = false,
        error,
        state = disabled ? 'disabled' : error ? 'error'
                                              : 'idle',
        // Component-specific props
        data,
        initialExpanded = false,
        maxHeight = '400px',
        hideControls = false,
        onCopy,
        onExpandChange,
        ...props
    }) => {
    const [isCopied, setIsCopied] = useState(false);

    const parsedData = useMemo(() => {
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch {
                return null;
            }
        }
        return typeof data === 'object' && data !== null ? data : null;
    }, [data]);

    // getAllKeys definition moved up
    const getAllKeys = useCallback((obj: any, currentPath = ''): string[] => {
        let keys: string[] = [];
        if (!obj || typeof obj !== 'object') return keys;

        for (const key in obj) {
            const fullPath = currentPath ? `${currentPath}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && Object.keys(obj[key]).length > 0) {
                keys.push(fullPath);
                keys = keys.concat(getAllKeys(obj[key], fullPath));
            }
        }
        return keys;
    }, []);

    // Initialize expandedKeys after parsedData and getAllKeys are defined
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
        if (initialExpanded && parsedData) {
            const keys = getAllKeys(parsedData);
            return new Set(keys);
        }
        return new Set();
    });

    // Update expanded keys when initialExpanded changes
    useEffect(() => {
        if (initialExpanded && parsedData) {
            const keys = getAllKeys(parsedData);
            setExpandedKeys(new Set(keys));
        } else if (!initialExpanded) {
            setExpandedKeys(new Set());
        }
    }, [initialExpanded, parsedData, getAllKeys]);

    const densityStyles = densityConfig[density];
    const animationProps = useComponentAnimation(animation, disableAnimation);

    // Rest of the functions...
    const expandAll = useCallback(() => {
        if (disabled || !parsedData) return;
        const allKeys = getAllKeys(parsedData);
        setExpandedKeys(new Set(allKeys));
    }, [parsedData, disabled, getAllKeys]);

    const collapseAll = useCallback(() => {
        if (disabled) return;
        setExpandedKeys(new Set());
    }, [disabled]);

    const toggleExpand = useCallback((key: string) => {
        if (disabled) return;
        console.log('Toggling:', key); // Add this for debugging
        setExpandedKeys((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    }, [disabled]);

    const isKeyExpanded = useCallback((key: string) => {
        return expandedKeys.has(key);
    }, [expandedKeys]);


    const copyToClipboard = useCallback(() => {
        if (disabled) return;
        const stringData = JSON.stringify(parsedData, null, 2);
        navigator.clipboard.writeText(stringData);
        onCopy?.(stringData);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    }, [parsedData, disabled, onCopy]);


    const handleExpandChange = useCallback((expanded: boolean) => {
        if (disabled) return;
        if (expanded) {
            expandAll();
        } else {
            collapseAll();
        }
        onExpandChange?.(expanded);
    }, [disabled, expandAll, collapseAll, onExpandChange]);


    const hasExpandableItems = useCallback((obj: any): boolean => {
        if (typeof obj !== 'object' || obj === null) return false;
        return Object.values(obj).some(value =>
            typeof value === 'object' && value !== null && Object.keys(value).length > 0
        );
    }, []);


    const isEmpty = !parsedData || (typeof parsedData === 'object' && Object.keys(parsedData).length === 0);
    const showControls = !hideControls && !isEmpty && (hasExpandableItems(parsedData) || parsedData);


    if (isEmpty) {
        return (
            <motion.div
                className={cn(
                    getComponentStyles({size, density, variant, state}),
                    "p-2 rounded-md border",
                    className
                )}
                {...animationProps}
            >
                {!parsedData ? 'Invalid JSON' : '{Empty JSON}'}
            </motion.div>
        );
    }

    return (
        <motion.div
            className={cn(
            "relative rounded-md overflow-hidden border",
            "bg-background",
                className
            )}
            style={{maxHeight}}
            {...animationProps}
            {...props}
        >
            {showControls && (
                <div className={cn(
                "absolute right-2 top-2 flex flex-col gap-2 z-10",
                    densityStyles.spacing
                )}>
                    {hasExpandableItems(parsedData) && (
                        <Button
                            variant={variant}
                            size={size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : 'default'}
                            onClick={() => handleExpandChange(!expandedKeys.size)}
                            className="bg-secondary text-secondary-foreground hover:bg-secondary/90"
                            disabled={disabled}
                        >
                            {expandedKeys.size ? (
                                <ChevronUp className={cn(
                                    size === 'xs' ? 'h-3 w-3' : 'h-4 w-4',
                                    'transition-transform'
                                )}/>
                            ) : (
                                 <ChevronDown className={cn(
                                     size === 'xs' ? 'h-3 w-3' : 'h-4 w-4',
                                     'transition-transform'
                                 )}/>
                             )}
                        </Button>
                    )}
                    <Button
                        variant={variant}
                        size={size === 'xs' ? 'xs' : size === 'sm' ? 'sm' : 'default'}
                        onClick={copyToClipboard}
                        className={cn(
                            "relative",
                            isCopied ? "bg-success" : "bg-primary",
                            "text-primary-foreground hover:bg-primary/90"
                        )}
                        disabled={disabled}
                    >
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={isCopied ? 'check' : 'copy'}
                                initial={{opacity: 0, scale: 0.8}}
                                animate={{opacity: 1, scale: 1}}
                                exit={{opacity: 0, scale: 0.8}}
                                transition={{duration: 0.15}}
                            >
                                {isCopied ? (
                                    <Check className={size === 'xs' ? 'h-3 w-3' : 'h-4 w-4'}/>
                                ) : (
                                     <Copy className={size === 'xs' ? 'h-3 w-3' : 'h-4 w-4'}/>
                                 )}
                            </motion.div>
                        </AnimatePresence>
                    </Button>
                </div>
            )}
            <div className={cn(
            "clear-both",
                densityStyles.padding[size],
                "pr-10"
            )}>
                {Object.entries(parsedData).map(([key, value], index, arr) => (
                    <MatrxJsonItem
                        key={key}
                        path={key}
                        keyName={key}
                        value={value}
                        isExpanded={isKeyExpanded(key)}
                        onToggle={toggleExpand}
                        isKeyExpanded={isKeyExpanded}
                        disabled={disabled}
                        isLastItem={index === arr.length - 1}
                        size={size}
                        density={density}
                        variant={variant}
                        animation={animation}
                        state={state}
                    />
                ))}
            </div>
        </motion.div>
    );
};

// components/MatrxFullJsonViewer.tsx
export const MatrxFullJsonViewer: React.FC<MatrxFullJsonViewerProps> = (
    {
        // Base props passed to both Card and JsonViewer
        className,
        size = 'md',
        density = 'normal',
        variant = 'default',
        disabled = false,
        animation = 'subtle',
        // Component-specific props
        title = "JSON Data",
        hideTitle = false,
        cardProps = {},
        ...props
    }) => {
    const densityStyles = densityConfig[density];

    return (
        <Card
            className={cn(
                densityStyles.padding[size],
                "bg-card",
                disabled && "opacity-70",
                className
            )}
            {...cardProps}
        >
            {!hideTitle && (
                <motion.h3
                    className={cn(
                        densityStyles.fontSize,
                        "font-semibold",
                        densityStyles.spacing,
                        disabled ? "text-muted-foreground" : "text-foreground"
                    )}
                    layout
                >
                    {title}
                </motion.h3>
            )}
            <MatrxJsonViewer
                size={size}
                density={density}
                variant={variant}
                disabled={disabled}
                animation={animation}
                {...props}
            />
        </Card>
    );
};
