'use client';

import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent } from '@/components/ui/card';
import { UnifiedLayoutProps } from '@/components/matrx/Entity/prewired-components/layouts/types';
import { EntityKeys } from '@/types/entityTypes';
import { MatrxRecordId } from '@/types/records';
import { EntityFormMinimalAnyRecord } from '@/app/entities/forms/EntityFormMinimalAnyRecord';
import BrokerCardHeader from '../BrokerCardHeader';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';
import { ChipData } from '@/types/editor.types';
import { TailwindColor } from '@/constants/rich-text-constants';
import { useFetchQuickRef } from '@/app/entities/hooks/useFetchQuickRef';
import { List } from 'lucide-react';
import MultiSelect from '@/components/ui/loaders/multi-select';

interface BrokerRecord {
    name?: string;
    defaultValue?: string;
    defaultComponent?: string;
    isConnected?: boolean;
}

interface BrokerDisplayCardProps {
    recordId: MatrxRecordId;
    record: BrokerRecord;
    unifiedLayoutProps: UnifiedLayoutProps;
    onDelete?: (recordId: MatrxRecordId) => void;
}

interface ChipValueLabel {
    value: string;
    label: string;
}

const BrokerDisplayCard = <TEntity extends EntityKeys>({ recordId, record, unifiedLayoutProps, onDelete }: BrokerDisplayCardProps) => {
    const [isOpen, setIsOpen] = useState(true);
    const [color, setColor] = useState<TailwindColor>('teal');
    const context = useEditorContext();
    const [selectedChipIds, setSelectedChipIds] = useState<string[]>([]);

    const toggleOpen = () => setIsOpen(!isOpen);

    // Get all chips that match this broker
    const getMatchingChips = useCallback(() => {
        const allChips = context.chips.getAllChipData();
        return allChips.filter((chip) => `id:${chip.brokerId}` === recordId || chip.brokerId === recordId);
    }, [context, recordId]);

    // Get all available chips
    const getAllAvailableChips = useCallback(() => {
        const allChips = context.chips.getAllChipData();
        return allChips.filter((chip) => !chip.brokerId || chip.brokerId === recordId);
    }, [context, recordId]);

    // Transform chips to select options
    const allChipsValueLabels = useMemo(() => {
        const availableChips = getAllAvailableChips();
        return availableChips.map(chip => ({
            value: chip.id,
            label: chip.label || chip.stringValue || 'Unnamed Chip'
        }));
    }, [getAllAvailableChips]);


    
    // Memoized selected values
    const connectedChipIds = useMemo(() => {
        const matchingChips = getMatchingChips();
        return matchingChips.map((chip) => chip.id);
    }, [getMatchingChips]);

    const matchingChips = getMatchingChips();
    const isConnected = matchingChips.length > 0;

    // Update handler that updates all matching chips
    const updateAllMatchingChips = useCallback(
        (updates: Partial<ChipData>) => {
            const chips = getMatchingChips();
            chips.forEach((chip) => {
                context.chips.updateChipData(chip.id, updates);
            });
        },
        [context, getMatchingChips]
    );

    // Handle chip connection/disconnection
    const handleConnectToChip = useCallback(
        (selectedIds: string[]) => {
            const allChips = context.chips.getAllChipData();
            // Disconnect chips that were unselected
            allChips.forEach((chip) => {
                if (chip.brokerId === recordId && !selectedIds.includes(chip.id)) {
                    context.chips.updateChipData(chip.id, { brokerId: undefined });
                }
            });

            // Connect newly selected chips
            selectedIds.forEach((chipId) => {
                const chip = allChips.find((c) => c.id === chipId);
                if (chip) {
                    context.chips.updateChipData(chipId, {
                        brokerId: recordId,
                        color: color,
                    });
                }
            });

            setSelectedChipIds(selectedIds);
        },
        [context, recordId, color]
    );

    // Field-specific update handlers
    const handleFieldUpdate = useCallback(
        (field: string, value: any) => {
            switch (field) {
                case 'name':
                    updateAllMatchingChips({
                        label: value,
                    });
                    break;

                case 'defaultValue':
                    updateAllMatchingChips({
                        stringValue: value,
                    });
                    break;

                case 'defaultComponent':
                    break;

                case 'color':
                    // Update state and all chips
                    setColor(value as TailwindColor);
                    updateAllMatchingChips({
                        color: value as TailwindColor,
                    });
                    break;

                default:
                    console.warn(`Unhandled field update: ${field}`);
            }
        },
        [updateAllMatchingChips]
    );

    // Initialize selected chips on mount
    useEffect(() => {
        const initialMatchingChips = getMatchingChips();
        console.log('useEffect Initial matching chips:', initialMatchingChips);
        setSelectedChipIds(initialMatchingChips.map((chip) => chip.id));
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className='my-4 last:mb-0'
        >
            <Card className='bg-elevation2 border border-elevation3 rounded-lg'>
                <BrokerCardHeader
                    recordId={recordId}
                    record={record}
                    color={color}
                    chips={matchingChips}
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
                            className='overflow-hidden'
                        >
                            <CardContent className='p-2 bg-background space-y-2 border-t'>
                                <EntityFormMinimalAnyRecord<TEntity>
                                    recordId={recordId}
                                    unifiedLayoutProps={unifiedLayoutProps}
                                    onFieldChange={handleFieldUpdate}
                                />
                            </CardContent>
                        </motion.div>
                    )}
                </AnimatePresence>
            </Card>
        </motion.div>
    );
};

export default BrokerDisplayCard;
