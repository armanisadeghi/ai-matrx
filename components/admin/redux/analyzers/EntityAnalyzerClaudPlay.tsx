// components/EntityAnalyzer.tsx
import {useState, useEffect, useMemo} from 'react';
import {Button} from '@/components/ui/button';
import {Card} from '@/components/ui/card';
import { FullJsonViewer } from "@/components/ui/JsonComponents/JsonViewerComponent";
import {Maximize2, Minimize2, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {useAppSelector} from '@/lib/redux/hooks';
import {EntityKeys} from '@/types/entityTypes';
import {selectFormattedEntityOptions} from '@/lib/redux/schema/globalCacheSelectors';
import {createEntitySelectors} from '@/lib/redux/entity/selectors';

type Position = 'bottom' | 'top' | 'left' | 'right' | 'center';
type DisplayState = 'minimized' | 'expanded' | 'fullPage';

interface EntityAnalyzerProps {
    position?: Position;
    initialState?: DisplayState;
    className?: string;
}

const EntityAnalyzerClaudPlay = (
    {
        position = 'bottom',
        initialState = 'expanded',
        className,
    }: EntityAnalyzerProps) => {
    const [selectedEntity, setSelectedEntity] = useState<EntityKeys | null>(null);
    const [displayState, setDisplayState] = useState<DisplayState>(initialState);

    // Initialize selectors for all entities
    const entityOptions = useAppSelector(selectFormattedEntityOptions);

    // Create memoized selectors for all entities
    const entitySelectors = useMemo(() => {
        return entityOptions.reduce((acc, {value}) => {
            acc[value] = createEntitySelectors(value);
            return acc;
        }, {} as Record<EntityKeys, ReturnType<typeof createEntitySelectors>>);
    }, []);

    // Get current entity state if selected
    const currentEntityState = useAppSelector((state) => {
        if (!selectedEntity || !entitySelectors[selectedEntity]) return null;
        return {
            entityMetadata: entitySelectors[selectedEntity]?.selectEntity(state)?.entityMetadata,
            records: entitySelectors[selectedEntity]?.selectAllRecords(state),
            quickReference: entitySelectors[selectedEntity]?.selectEntity(state)?.quickReference,
            selection: entitySelectors[selectedEntity]?.selectEntity(state)?.selection,
            pagination: entitySelectors[selectedEntity]?.selectEntity(state)?.pagination,
            loading: entitySelectors[selectedEntity]?.selectEntity(state)?.loading,
            cache: entitySelectors[selectedEntity]?.selectEntity(state)?.cache,
            history: entitySelectors[selectedEntity]?.selectEntity(state)?.history,
            filters: entitySelectors[selectedEntity]?.selectEntity(state)?.filters,
            subscription: entitySelectors[selectedEntity]?.selectEntity(state)?.subscription,
            flags: entitySelectors[selectedEntity]?.selectEntity(state)?.flags,
            metrics: entitySelectors[selectedEntity]?.selectEntity(state)?.metrics,
        };
    });

    const positionStyles: Record<Position, string> = {
        bottom: 'bottom-0 left-0 right-0',
        top: 'top-0 left-0 right-0',
        left: 'left-0 top-0 bottom-0',
        right: 'right-0 top-0 bottom-0',
        center: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    };

    const containerStyles = cn(
        'fixed transition-all duration-200 z-50',
        positionStyles[position],
        {
            'h-[50dvh]': displayState === 'expanded',
            'h-dvh': displayState === 'fullPage',
            'h-12': displayState === 'minimized',
        },
        className
    );

    const contentStyles = cn(
        'bg-background border rounded-t-lg shadow-lg',
        'flex flex-col h-full overflow-hidden',
        {
            'w-full': position === 'top' || position === 'bottom',
            'w-96': position === 'left' || position === 'right',
            'w-3/4': position === 'center',
        }
    );

    return (
        <div className={containerStyles}>
            <Card className={contentStyles}>
                {/* Header */}
                <div className="sticky top-0 flex items-center justify-between p-2 border-b bg-background">
                    <div className="flex gap-2">
                        {entityOptions.map(({value, label}) => (
                            <Button
                                key={value}
                                variant={selectedEntity === value ? "default" : "outline"}
                                size="sm"
                                onClick={() => setSelectedEntity(value)}
                            >
                                {label}
                            </Button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDisplayState(s =>
                                s === 'minimized' ? 'expanded' : 'minimized'
                            )}
                        >
                            {displayState === 'minimized' ? <Maximize2 size={16}/> : <Minimize2 size={16}/>}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDisplayState(s =>
                                s === 'fullPage' ? 'expanded' : 'fullPage'
                            )}
                        >
                            <Maximize2 size={16}/>
                        </Button>
                    </div>
                </div>

                {/* Content */}
                {displayState !== 'minimized' && selectedEntity && currentEntityState && (
                    <div className="flex-1 overflow-auto p-2 space-y-2">
                        <FullJsonViewer
                            title="Entity Metadata"
                            data={currentEntityState.entityMetadata}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Records"
                            data={currentEntityState.records}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Quick Reference"
                            data={currentEntityState.quickReference}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Selection"
                            data={currentEntityState.selection}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Pagination"
                            data={currentEntityState.pagination}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Loading State"
                            data={currentEntityState.loading}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Cache"
                            data={currentEntityState.cache}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="History"
                            data={currentEntityState.history}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Filters"
                            data={currentEntityState.filters}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Subscription"
                            data={currentEntityState.subscription}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Flags"
                            data={currentEntityState.flags}
                            initialExpanded={true}
                        />
                        <FullJsonViewer
                            title="Metrics"
                            data={currentEntityState.metrics}
                            initialExpanded={true}
                        />
                    </div>
                )}
            </Card>
        </div>
    );
};

export default EntityAnalyzerClaudPlay;
