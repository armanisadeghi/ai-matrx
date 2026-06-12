'use client';

import * as React from 'react';
import {cn} from '@/lib/utils';
import {Card, CardContent} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Plus, CheckSquare, Grid2X2} from 'lucide-react';
import {EntityKeys} from '@/types/entityTypes';
import {useQuickReference} from '@/lib/redux/entity/hooks/useQuickReference';
import {motion, AnimatePresence} from 'motion/react';
import {AnimationPreset, ComponentDensity} from "@/types/componentConfigTypes";
import SmartCrudWrapper
    from "@/components/matrx/Entity/prewired-components/layouts/smart-layouts/smart-actions/SmartCrudWrapper";

interface EntityQuickReferenceCardsProps<TEntity extends EntityKeys> {
    entityKey: TEntity;
    onSelectionChange?: (recordId: string | string[]) => void;
    onCreateEntityClick?: () => void;
    showCreateNewButton?: boolean;
    className?: string;
    density?: ComponentDensity;
    animationPreset?: AnimationPreset;
}

function EntityQuickReferenceCards<TEntity extends EntityKeys>(
    {
        entityKey,
        onCreateEntityClick,
        showCreateNewButton = false,
        className = '',
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
        const baseSize = 180; // Base card width
        const configs = {
            compact: {
                padding: 'px-0 py-0',
                contentPadding: 'p-1',
                gap: 'gap-0',
                fontSize: 'text-xs',
                iconSize: 'h-3 w-3',
                buttonSize: 'h-7',
                maxHeight: 'max-h-[50dvh]',
                minWidth: baseSize * 0.8,
                headerPadding: 'px-2 py-2',
            },
            normal: {
                padding: 'px-1 py-1',
                contentPadding: 'p-2',
                gap: 'gap-1',
                fontSize: 'text-sm',
                iconSize: 'h-4 w-4',
                buttonSize: 'h-8',
                maxHeight: 'max-h-[60dvh]',
                minWidth: baseSize,
                headerPadding: 'px-4 py-3',
            },
            comfortable: {
                padding: 'px-3 py-3',
                contentPadding: 'p-4',
                gap: 'gap-2',
                fontSize: 'text-base',
                iconSize: 'h-5 w-5',
                buttonSize: 'h-9',
                maxHeight: 'max-h-[70dvh]',
                minWidth: baseSize * 1.2,
                headerPadding: 'px-6 py-4',
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
                delayMultiplier: 0,
                duration: 0,
            },
            subtle: {
                initial: { opacity: 0, y: 5 },
                animate: { opacity: 1, y: 0 },
                hover: { scale: 1.01 },
                cardHover: { opacity: 0.3 },
                delayMultiplier: 0.02,
                duration: 0.2,
            },
            smooth: {
                initial: { opacity: 0, y: 20 },
                animate: { opacity: 1, y: 0 },
                hover: { scale: 1.02 },
                cardHover: { opacity: 0.5 },
                delayMultiplier: 0.05,
                duration: 0.3,
            },
            energetic: {
                initial: { opacity: 0, y: 30, scale: 0.95 },
                animate: { opacity: 1, y: 0, scale: 1 },
                hover: { scale: 1.03, y: -5 },
                cardHover: { opacity: 0.7 },
                delayMultiplier: 0.07,
                duration: 0.4,
            },
            playful: {
                initial: { opacity: 0, y: 40, rotate: -5, scale: 0.9 },
                animate: { opacity: 1, y: 0, rotate: 0, scale: 1 },
                hover: { scale: 1.05, rotate: 2, y: -10 },
                cardHover: { opacity: 0.9 },
                delayMultiplier: 0.1,
                duration: 0.5,
            },
        };
        return configs[animationPreset];
    }, [animationPreset]);

    const getCardClassName = React.useCallback(
        (recordKey: string) => {
            const baseClasses = cn(
                'group relative cursor-pointer',
                animationPreset !== 'none' && 'transition-all duration-300'
            );
            return cn(
                baseClasses,
                isSelected(recordKey)
                ? 'ring-2 ring-primary bg-accent'
                : 'hover:bg-accent/50 dark:hover:bg-accent/30'
            );
        },
        [isSelected, animationPreset]
    );

    const getTransitionWithDelay = (index: number) => ({
        duration: animationConfig.duration,
        delay: index * animationConfig.delayMultiplier,
    });

    return (
        <div className={cn('flex flex-col w-full bg-background min-w-0', className)}>
            <SmartCrudWrapper
                entityKey={entityKey}
                options={{
                    allowCreate: true,
                    allowEdit: true,
                    allowDelete: true,
                    showConfirmation: true,
                }}
                layout={{
                    buttonLayout: 'row',
                    buttonSize: 'icon',
                    buttonSpacing: 'compact',
                }}

            />
            <div
                className={cn(
                    "border-b flex justify-between items-center backdrop-blur-sm bg-background/80 sticky top-0 z-10",
                    densityConfig.headerPadding
                )}
            >
                <div className="flex gap-2">
                    {selectionMode !== 'none' && (
                        <Button
                            onClick={toggleSelectionMode}
                            size={density === 'comfortable' ? 'default' : 'sm'}
                            variant={selectionMode === 'multiple' ? 'secondary' : 'outline'}
                            className={cn(
                                "transition-all",
                                animationPreset !== 'none' && "duration-300",
                                densityConfig.buttonSize
                            )}
                        >
                            <CheckSquare className={cn("mr-2", densityConfig.iconSize)}/>
                            {selectionMode === 'multiple' ? 'Cancel Multi' : 'Multi'}
                        </Button>
                    )}
                </div>
                {onCreateEntityClick && showCreateNewButton && (
                    <Button
                        onClick={onCreateEntityClick}
                        size={density === 'comfortable' ? 'default' : 'sm'}
                        className={cn(
                            "transition-all",
                            animationPreset !== 'none' && "duration-300 hover:shadow-lg",
                            densityConfig.buttonSize
                        )}
                    >
                        <Plus className={cn("mr-2", densityConfig.iconSize)}/>
                        New
                    </Button>
                )}
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
                            whileHover={animationPreset !== 'none' ? animationConfig.hover : undefined}
                            key={ref.recordKey}
                            className="min-w-0"
                        >
                            <Card
                                className={getCardClassName(ref.recordKey)}
                                onClick={() => handleRecordSelect(ref.recordKey)}
                            >
                                <CardContent className={densityConfig.contentPadding}>
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Grid2X2
                                            className={cn(
                                                "flex-shrink-0 text-muted-foreground",
                                                densityConfig.iconSize,
                                                animationPreset !== 'none' && "group-hover:text-primary transition-colors duration-300"
                                            )}
                                        />
                                        <div
                                            className={cn(
                                                "font-medium text-foreground truncate",
                                                densityConfig.fontSize,
                                                animationPreset !== 'none' && "group-hover:text-primary transition-colors duration-300"
                                            )}
                                        >
                                            {ref.displayValue}
                                        </div>
                                    </div>
                                </CardContent>
                                {animationPreset !== 'none' && (
                                    <motion.div
                                        className="absolute inset-0 bg-primary/5 rounded-lg"
                                        initial={{ opacity: 0 }}
                                        whileHover={animationConfig.cardHover}
                                        transition={{ duration: animationConfig.duration }}
                                    />
                                )}
                            </Card>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default EntityQuickReferenceCards;
