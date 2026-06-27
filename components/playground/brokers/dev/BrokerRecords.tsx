'use client';

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { UnifiedLayoutProps } from '@/components/matrx/Entity/prewired-components/layouts/types';
import { EntityKeys } from '@/types/entityTypes';
import { MatrxRecordId } from '@/types/records';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useEnhancedFetch, useEntityFetch } from '@/app/entities/hooks/useEntityFetch';
import BrokerDisplayCard from '../BrokerDisplayCard';
import { EnhancedRecord } from '@/lib/redux/entity/types/stateTypes';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';

interface ChipData {
    id: string;
    label: string;
    color?: string;
    stringValue?: string;
    brokerId?: MatrxRecordId;
    editorId?: MatrxRecordId;
}
interface DisplayCard {
    id: string;
    brokerId?: MatrxRecordId;
    brokerRecord?: any;
    chips: ChipData[];
}

interface EnhancedBrokerRecord extends EnhancedRecord {
    chips?: ChipData[];
}

interface currentChips {
    withBrokerId: ChipData[];
    withoutBrokerId: ChipData[];
}

const BrokerRecords = ({ unifiedLayoutProps }: { unifiedLayoutProps: UnifiedLayoutProps }) => {
    const dispatch = useAppDispatch();
    const entityName = 'dataBroker' as EntityKeys;
    const { selectors, actions } = useEntityTools(entityName);

    const [loadingHold, setLoadingHold] = useState(true);
    const [currentChips, setCurrentChips] = useState<currentChips>({ withBrokerId: [], withoutBrokerId: [] });
    const [chipsNeedProcessing, setChipsNeedProcessing] = useState(false);

    const [currentBroker, setCurrentBroker] = useState<EnhancedBrokerRecord[]>(null);
    const selectedRecords = useAppSelector(selectors.selectSelectedEnhancedRecords);
    const context = useEditorContext();
    const messagesLoading = context.messagesLoading;
    const { quickReferences, isLoading: quickRefLoading, getOrFetchRecord, enhancedRecords } = useEnhancedFetch(entityName);
    const isLoading = quickRefLoading || messagesLoading;

    useEffect(() => {
        dispatch(actions.setSelectionMode('multiple'));
    }, [dispatch, actions]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setLoadingHold(isLoading);
        }, 200);

        return () => clearTimeout(timeout);
    }, [isLoading]);

    const availableChips = context.chips.getAllChipData();

    const processChips = useCallback(() => {
        if (!chipsNeedProcessing) return;
        const chipsWithBrokerId = availableChips.filter((chip) => chip.brokerId && chip.brokerId !== 'disconnected');
        const chipsWithoutBrokerId = availableChips.filter((chip) => !chip.brokerId || chip.brokerId === 'disconnected');

        setCurrentChips({
            withBrokerId: chipsWithBrokerId,
            withoutBrokerId: chipsWithoutBrokerId,
        });
        setChipsNeedProcessing(false);
        processEnhancedRecords();
    }, [availableChips]);

    useEffect(() => {
        if (!isLoading && !loadingHold) {
            setLoadingHold(true);
            setChipsNeedProcessing(true);
            processChips();
        }
    }, [isLoading, availableChips]);

    const processEnhancedRecords = useCallback(() => {
        const updatedBrokers: EnhancedBrokerRecord[] = [...(currentBroker || [])]; // Start with the existing brokers

        // Process chips with brokerId
        currentChips.withBrokerId.forEach((chip) => {
            const matchingRecord = enhancedRecords.find((record) => record.recordKey === chip.brokerId);

            if (matchingRecord) {
                if (matchingRecord.needsFetch) {
                    // Fetch the record if required
                    getOrFetchRecord(matchingRecord.recordKey);
                } else {
                    // Check if the broker already exists in the updated list
                    const existingBroker = updatedBrokers.find((broker) => broker.recordKey === matchingRecord.recordKey);

                    if (existingBroker) {
                        // Append the chip to the existing broker's chips
                        existingBroker.chips = [...(existingBroker.chips || []), chip];
                    } else {
                        // Add a new broker with the chip
                        updatedBrokers.push({
                            ...matchingRecord,
                            chips: [chip],
                        });
                    }
                }
            }
        });

        // Process selectedRecords to add any missing brokers without chips
        selectedRecords.forEach((record) => {
            const existingBroker = updatedBrokers.find((broker) => broker.recordKey === record.recordKey);

            if (!existingBroker) {
                // Add the record without any chips
                updatedBrokers.push({
                    ...record,
                    chips: [], // No chips for selectedRecords
                });
            }
        });

        // Update the state with the new broker list
        setCurrentBroker(updatedBrokers);
        setLoadingHold(false);
    }, [currentChips.withBrokerId, enhancedRecords, selectedRecords, currentBroker, getOrFetchRecord]);

    const handleRemove = useCallback(
        (recordId: MatrxRecordId) => {
            dispatch(actions.removeFromSelection(recordId));
        },
        [dispatch, actions]
    );

    const handleChipUpdate = useCallback(
        (chipId: string, updates: Partial<ChipData>) => {
            console.log('-------------Updating chip:', chipId, updates);
            context.chips.updateChipData(chipId, updates);
        },
        [context]
    );

    return (
        <div className='w-full space-y-2'>
            {currentBroker && currentBroker.length > 0 ? (
                currentBroker.map((card) => (
                    <BrokerDisplayCard
                        key={card.recordKey}
                        recordId={card.recordKey}
                        record={card.data}
                        chips={card.chips || []} // Ensure chips is an array
                        unifiedLayoutProps={unifiedLayoutProps}
                        onDelete={handleRemove}
                        onChipUpdate={handleChipUpdate}
                        brokerOptions={quickReferences || []}
                    />
                ))
            ) : (
                <p className='text-gray-500'>No brokers available.</p>
            )}
        </div>
    );
};

export default BrokerRecords;
