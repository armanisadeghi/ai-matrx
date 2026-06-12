'use client';

import * as React from 'react';
import {cn} from '@/lib/utils';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/ButtonMine';
import {Plus, CheckSquare, Grid2X2} from 'lucide-react';
import {EntityKeys} from '@/types/entityTypes';
import {useQuickReference} from '@/lib/redux/entity/hooks/useQuickReference';
import {motion, AnimatePresence} from 'motion/react';
import {AnimationPreset, ComponentDensity} from "@/types/componentConfigTypes";

interface EntityQuickReferenceCardsProps<TEntity extends EntityKeys> {
    entityKey: TEntity;
    onSelectionChange?: (recordId: string | string[]) => void;
    onCreateEntityClick?: () => void;
    showCreateNewButton?: boolean;
    showMultiSelectButton?: boolean;
    className?: string;
    customLabel?: string;
    density?: ComponentDensity;
    animationPreset?: AnimationPreset;
}

function EntityQuickReferenceCardsEnhanced<TEntity extends EntityKeys>(
    {
        entityKey,
        onCreateEntityClick,
        showCreateNewButton = false,
        showMultiSelectButton = true,
        className = '',
        customLabel,
        density = 'normal',
        animationPreset = 'smooth',
    }: EntityQuickReferenceCardsProps<TEntity>) {

    const {
        quickReferenceRecords,
        selectionMode,
        isSelected,
        handleRecordSelect,
        toggleSelectionMode,
        fetchMode,
        entityDisplayName,
        setFetchMode,
    } = useQuickReference(entityKey);

    React.useEffect(() => {
        setFetchMode('fkIfk');
    }, [entityKey]);

    // Density-based styling configurations
    const densityConfig = React.useMemo(() => {
        const baseSize = 180;
        const configs = {
            compact: {
                padding: 'p-1',
                containerPadding: 'px-1 py-1',
                gap: 'gap-1',
                cardPadding: 'p-2',
                fontSize: 'text-xs',
                headerSize: 'text-xs',
                iconSize: 'h-3 w-3',
                buttonSize: 'h-7 px-2 text-xs',
                maxHeight: 'max-h-[50dvh]',
                minWidth: baseSize * 0.8,
                lineHeight: 'leading-tight',
            },
            normal: {
                padding: 'p-2 sm:p-4',
                containerPadding: 'px-2 sm:px-3 py-1.5',
                gap: 'gap-2 sm:gap-3',
                cardPadding: 'p-2 sm:p-3',
                fontSize: 'text-sm',
                headerSize: 'text-sm',
                iconSize: 'h-4 w-4',
                buttonSize: 'h-8 px-3',
                maxHeight: 'max-h-[60dvh]',
                minWidth: baseSize,
                lineHeight: 'leading-normal',
            },
            comfortable: {
                padding: 'p-3 sm:p-6',
                containerPadding: 'px-3 sm:px-4 py-2',
                gap: 'gap-3 sm:gap-4',
                cardPadding: 'p-3 sm:p-4',
                fontSize: 'text-base',
                headerSize: 'text-base',
                iconSize: 'h-5 w-5',
                buttonSize: 'h-9 px-4',
                maxHeight: 'max-h-[70dvh]',
                minWidth: baseSize * 1.2,
                lineHeight: 'leading-relaxed',
            },
        };
        return configs[density];
    }, [density]);

    // Animation configurations
    const animationConfig = React.useMemo(() => {
        const configs = {
            none: {
                initial: { opacity: 1 },
                animate: { opacity: 1 },
                hover: {},
                cardHover: {},
                gradient: false,
                blur: false,
            },
            subtle: {
                initial: { opacity: 0, y: 5 },
                animate: { opacity: 1, y: 0 },
                hover: { scale: 1.01 },
                cardHover: { y: -1 },
                gradient: false,
                blur: false,
            },
            smooth: {
                initial: { opacity: 0, y: 10 },
                animate: { opacity: 1, y: 0 },
                hover: { scale: 1.02 },
                cardHover: { y: -2 },
                gradient: true,
                blur: true,
            },
            energetic: {
                initial: { opacity: 0, y: 15, scale: 0.95 },
                animate: { opacity: 1, y: 0, scale: 1 },
                hover: { scale: 1.03, y: -3 },
                cardHover: { y: -4 },
                gradient: true,
                blur: true,
            },
            playful: {
                initial: { opacity: 0, y: 20, rotate: -2 },
                animate: { opacity: 1, y: 0, rotate: 0 },
                hover: { scale: 1.05, rotate: 1 },
                cardHover: { y: -5, rotate: -1 },
                gradient: true,
                blur: true,
            },
        };
        return configs[animationPreset];
    }, [animationPreset]);

    const getTransitionWithDelay = (index: number) => {
        const delayMultiplier = {
            none: 0,
            subtle: 0.01,
            smooth: 0.02,
            energetic: 0.03,
            playful: 0.04,
        }[animationPreset];

        return {
            duration: 0.3,
            delay: index * delayMultiplier,
            // @ts-ignore - COMPLEX: type should be AnimationGeneratorType but string is used, may need refactor
            type: (animationPreset === 'playful' ? 'spring' : 'easeOut') as any,
        };
    };

    const getCardClassName = React.useCallback(
        (recordKey: string) => {
            const baseClasses = cn(
                'group relative cursor-pointer',
                animationPreset !== 'none' && 'transition-all duration-300'
            );
            return cn(
                baseClasses,
                isSelected(recordKey)
                ? 'ring-2 ring-primary bg-accent shadow-lg'
                : animationPreset !== 'none' && 'hover:bg-accent/50 dark:hover:bg-accent/30'
            );
        },
        [isSelected, animationPreset]
    );

    const displayLabel = React.useMemo(() => {
        if (customLabel !== undefined) return customLabel;
        if (!entityDisplayName) return '';
        return selectionMode === 'multiple'
               ? `Select Multiple ${entityDisplayName}s`
               : `Select ${entityDisplayName}`;
    }, [customLabel, entityDisplayName, selectionMode]);

    return (
        <div className={cn('flex flex-col w-full bg-background min-w-0', className)}>
            <div className={cn("border-b backdrop-blur-sm bg-background/80 sticky top-0 z-10", densityConfig.containerPadding)}>
                <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                    {displayLabel && (
                        <h3 className={cn("font-medium text-foreground truncate", densityConfig.headerSize)}>
                            {displayLabel}
                        </h3>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        {showMultiSelectButton && selectionMode !== 'none' && (
                            <Button
                                onClick={toggleSelectionMode}
                                size={density === 'compact' ? 'xs' : 'sm'}
                                variant={selectionMode === 'multiple' ? 'secondary' : 'default'}
                                className={cn("transition-all", densityConfig.buttonSize)}
                            >
                                <CheckSquare className={cn("mr-1.5", densityConfig.iconSize)}/>
                                {selectionMode === 'multiple' ? 'Cancel Multi' : 'Multi Select'}
                            </Button>
                        )}
                        {onCreateEntityClick && showCreateNewButton && (
                            <Button
                                onClick={onCreateEntityClick}
                                size={density === 'compact' ? 'xs' : 'sm'}
                                className={cn("transition-all",
                                    densityConfig.buttonSize,
                                    animationPreset !== 'none' && "hover:shadow-lg"
                                )}
                            >
                                <Plus className={cn("mr-1.5", densityConfig.iconSize)}/>
                                New
                            </Button>
                        )}
                    </div>
                </div>
            </div>
            <div
                className={cn(
                    "grid auto-rows-fr overflow-y-auto",
                    densityConfig.padding,
                    densityConfig.gap,
                    densityConfig.maxHeight
                )}
                style={{
                    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${densityConfig.minWidth}px), 1fr))`
                }}
            >
                <AnimatePresence>
                    {quickReferenceRecords.slice(0, 20).map((ref, index) => (
                        <motion.div
                            initial={animationConfig.initial}
                            animate={animationConfig.animate}
                            transition={getTransitionWithDelay(index)}
                            key={ref.recordKey}
                            className="min-w-0"
                        >
                            <Card
                                className={getCardClassName(ref.recordKey)}
                                onClick={() => handleRecordSelect(ref.recordKey)}
                            >
                                <CardContent className={cn(
                                    "relative overflow-hidden",
                                    densityConfig.cardPadding
                                )}>
                                    <motion.div
                                        className={cn(
                                            "flex items-center gap-2 relative z-10 min-w-0",
                                            densityConfig.lineHeight
                                        )}
                                        whileHover={animationConfig.hover}
                                    >
                                        <Grid2X2
                                            className={cn(
                                                "flex-shrink-0 text-muted-foreground",
                                                densityConfig.iconSize,
                                                animationPreset !== 'none' && "group-hover:text-primary transition-colors duration-300"
                                            )}
                                        />
                                        <div
                                            className={cn(
                                                "font-medium text-foreground line-clamp-2",
                                                densityConfig.fontSize,
                                                animationPreset !== 'none' && "group-hover:text-primary transition-colors duration-300"
                                            )}
                                        >
                                            {ref.displayValue}
                                        </div>
                                    </motion.div>
                                    {animationConfig.blur && (
                                        <motion.div
                                            className="absolute inset-0 bg-primary/5"
                                            initial={{opacity: 0}}
                                            whileHover={{
                                                opacity: 1,
                                                backdropFilter: "blur(2px)",
                                            }}
                                            transition={{duration: 0.2}}
                                        />
                                    )}
                                    {animationConfig.gradient && (
                                        <motion.div
                                            className="absolute -inset-1 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0"
                                            initial={{x: "-100%"}}
                                            whileHover={{x: "100%"}}
                                            transition={{duration: 0.6, ease: "easeInOut"}}
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default EntityQuickReferenceCardsEnhanced;
