// @ts-nocheck
import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UnifiedLayoutProps } from '@/components/matrx/Entity/prewired-components/layouts/types';
import { EntityKeys } from '@/types/index';
import { MatrxRecordId } from '@/types/records';
import { EntityFormMinimalAnyRecord } from '@/app/entities/forms/EntityFormMinimalAnyRecord';
import BrokerCardHeader from '../BrokerCardHeader';
import { ChipData } from '@/types/editor.types';
import { TailwindColor } from '@/constants/rich-text-constants';
import { useFetchQuickRef } from '@/app/entities/hooks/useFetchQuickRef';
import { List, AlertCircle } from 'lucide-react';
import MultiSelect from '@/components/ui/loaders/multi-select';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';

interface BrokerRecord {
    name?: string;
    defaultValue?: string;
    defaultComponent?: string;
    isConnected?: boolean;
}

interface SingleBrokerRecordDisplayProps<TEntity extends EntityKeys> {
    recordId: MatrxRecordId;
    record: BrokerRecord;
    unifiedLayoutProps: UnifiedLayoutProps;
    onDelete?: (recordId: MatrxRecordId) => void;
}

interface ChipValueLabel {
    value: string;
    label: string;
}

interface OrphanChip extends ChipData {
    lastSeen: number;
}

const BrokerDisplayWithOrphans = <TEntity extends EntityKeys>({ 
    recordId, 
    record, 
    unifiedLayoutProps, 
    onDelete 
}: SingleBrokerRecordDisplayProps<TEntity>) => {
    const [isOpen, setIsOpen] = useState(true);
    const [color, setColor] = useState<TailwindColor>('teal');
    const context = useEditorContext();
    const { quickReferenceRecords } = useFetchQuickRef('dataBroker');
    const [selectedChipIds, setSelectedChipIds] = useState<string[]>([]);
    const [orphanChips, setOrphanChips] = useState<Map<string, OrphanChip>>(new Map());
    const seenChipsRef = useRef<Set<string>>(new Set());

    const toggleOpen = () => setIsOpen(!isOpen);

    // Track all chips, including orphans
    const trackChips = useCallback(() => {
        const allChips = context.getAllChipData();
        const currentTime = Date.now();
        
        // Update seen chips
        allChips.forEach(chip => {
            if (!seenChipsRef.current.has(chip.id)) {
                seenChipsRef.current.add(chip.id);
            }
        });

        // Update orphan chips
        setOrphanChips(prevOrphans => {
            const newOrphans = new Map(prevOrphans);
            
            allChips.forEach(chip => {
                if (!chip.brokerId) {
                    newOrphans.set(chip.id, {
                        ...chip,
                        lastSeen: currentTime
                    });
                } else {
                    newOrphans.delete(chip.id);
                }
            });

            // Remove orphans that no longer exist in allChips
            [...newOrphans.keys()].forEach(id => {
                if (!allChips.some(chip => chip.id === id)) {
                    newOrphans.delete(id);
                }
            });

            return newOrphans;
        });
    }, [context]);

    // Get matching chips (non-orphans)
    const getMatchingChips = useCallback(() => {
        const allChips = context.getAllChipData();
        return allChips.filter((chip) => 
            (`id:${chip.brokerId}` === recordId || chip.brokerId === recordId) &&
            seenChipsRef.current.has(chip.id)
        );
    }, [context, recordId]);

    // Get available chips for selection
    const getAllAvailableChips = useCallback(() => {
        const allChips = context.getAllChipData();
        return allChips.filter((chip) => 
            (!chip.brokerId || chip.brokerId === recordId) &&
            seenChipsRef.current.has(chip.id)
        );
    }, [context, recordId]);

    const allChipsValueLabels = useMemo(() => {
        const availableChips = getAllAvailableChips();
        return availableChips.map(chip => ({
            value: chip.id,
            label: chip.label || chip.stringValue || 'Unnamed Chip'
        }));
    }, [getAllAvailableChips]);

    const connectedChipIds = useMemo(() => {
        const matchingChips = getMatchingChips();
        return matchingChips.map((chip) => chip.id);
    }, [getMatchingChips]);

    const matchingChips = getMatchingChips();
    const isConnected = matchingChips.length > 0;

    const updateAllMatchingChips = useCallback(
        (updates: Partial<ChipData>) => {
            const chips = getMatchingChips();
            chips.forEach((chip) => {
                context.updateChipData(chip.id, updates);
            });
        },
        [context, getMatchingChips]
    );

    const handleConnectToChip = useCallback(
        (selectedIds: string[]) => {
            const allChips = context.getAllChipData();
            
            // Disconnect chips that were unselected
            allChips.forEach((chip) => {
                if (chip.brokerId === recordId && !selectedIds.includes(chip.id)) {
                    context.updateChipData(chip.id, { brokerId: undefined });
                }
            });

            // Connect newly selected chips
            selectedIds.forEach((chipId) => {
                const chip = allChips.find((c) => c.id === chipId);
                if (chip) {
                    context.updateChipData(chipId, {
                        brokerId: recordId,
                        color: color,
                    });
                }
            });

            setSelectedChipIds(selectedIds);
            trackChips(); // Update tracking after connections change
        },
        [context, recordId, color, trackChips]
    );

    const handleFieldUpdate = useCallback(
        (field: string, value: any) => {
            switch (field) {
                case 'name':
                    updateAllMatchingChips({ label: value });
                    break;
                case 'defaultValue':
                    updateAllMatchingChips({ stringValue: value });
                    break;
                case 'color':
                    setColor(value as TailwindColor);
                    updateAllMatchingChips({ color: value as TailwindColor });
                    break;
            }
        },
        [updateAllMatchingChips]
    );

    // Render orphan chips
    const OrphanChipsDisplay = () => (
        <div className="flex flex-wrap gap-1 mt-2">
            {Array.from(orphanChips.values()).map((chip) => (
                <Button
                    key={chip.id}
                    size="sm"
                    variant="outline"
                    className={`bg-${chip.color || 'gray'}-100 hover:bg-${chip.color || 'gray'}-200 flex items-center gap-1 px-2 py-1 text-xs`}
                    onClick={() => handleConnectToChip([...selectedChipIds, chip.id])}
                >
                    <AlertCircle className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">
                        {chip.label || chip.stringValue || chip.id}
                    </span>
                </Button>
            ))}
        </div>
    );

    useEffect(() => {
        const initialMatchingChips = getMatchingChips();
        setSelectedChipIds(initialMatchingChips.map((chip) => chip.id));
        trackChips();

        // Set up interval to track chips
        const interval = setInterval(trackChips, 1000);
        return () => clearInterval(interval);
    }, [getMatchingChips, trackChips]);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="my-4 last:mb-0"
        >
            <Card className="bg-elevation2 border border-elevation3 rounded-lg">
                <BrokerCardHeader
                    recordId={recordId}
                    record={record}
                    chips={[]}
                    color={color}
                    isConnected={isConnected}
                    isOpen={isOpen}
                    onToggle={toggleOpen}
                    onDelete={onDelete ? () => onDelete(recordId) : undefined}
                />

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <CardContent className="p-2 bg-background space-y-2 border-t">
                                <EntityFormMinimalAnyRecord<TEntity>
                                    recordId={recordId}
                                    unifiedLayoutProps={unifiedLayoutProps}
                                    onFieldChange={handleFieldUpdate}
                                />
                                <MultiSelect
                                    options={allChipsValueLabels}
                                    value={connectedChipIds}
                                    onChange={handleConnectToChip}
                                    size="icon"
                                    variant="primary"
                                    icon={List}
                                />
                                <OrphanChipsDisplay />
                            </CardContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </motion.div>
    );
};

export default BrokerDisplayWithOrphans;