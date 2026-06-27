'use client';

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { UnifiedLayoutProps } from '@/components/matrx/Entity/prewired-components/layouts/types';
import { EntityKeys } from '@/types/entityTypes';
import { MatrxRecordId } from '@/types/records';
import { MessageBrokerDataOptional } from '@/types/AutomationSchemaTypes';
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useEditorContext } from '@/providers/rich-text-editor/Provider';
import { ChipData } from '@/types/editor.types';
import BrokerDisplayCard from './BrokerDisplayCard';
import { useEnhancedFetch } from '@/app/entities/hooks/useEntityFetch';
import { useDeleteRecord } from '@/app/entities/hooks/crud/useDeleteRecord';
import { toPkValue } from '@/lib/redux/entity/utils/entityPrimaryKeys';
import ChipDisplay from './ChipDisplay';
import _ from 'lodash';
import BrokerLoadingState from './BrokerLoadingState';

export type DataBrokerData = {
    id: string;
    name: string;
    dataType?: string;
    defaultValue?: string;
    defaultComponent?: string;
    color?: string;
    messageBrokerInverse?: MessageBrokerDataOptional[];
};

export interface EnhancedBrokerRecord {
    needsFetch: boolean;
    recordKey: string;
    data?: DataBrokerData;
}

const BrokerRecordsSimple = ({ unifiedLayoutProps }: { unifiedLayoutProps: UnifiedLayoutProps }) => {
    const dispatch = useAppDispatch();
    const [canProcess, setCanProcess] = useState(false);
    const entityName = 'dataBroker' as EntityKeys;
    const { selectors, actions } = useEntityTools(entityName);
    const selectedBrokers = useAppSelector(selectors.selectSelectedEnhancedRecords);
    const context = useEditorContext();
    const messagesLoading = context.messagesLoading;
    const { quickReferences, isLoading: quickRefLoading, getOrFetchRecord, enhancedRecords } = useEnhancedFetch(entityName);
    const isLoading = quickRefLoading || messagesLoading;
    const { deleteRecord: removeRelationship } = useDeleteRecord('messageBroker');


    useEffect(() => {
        if (isLoading) {
            setCanProcess(false);
            return;
        }

        const timer = setTimeout(() => {
            setCanProcess(true);
        }, 400);

        return () => clearTimeout(timer);
    }, [isLoading]);

    // Deduplicate selected brokers based on recordKey
    const uniqueSelectedBrokers = useMemo(() => {
        const brokerMap = new Map();
        selectedBrokers.forEach(broker => {
            if (!brokerMap.has(broker.recordKey)) {
                brokerMap.set(broker.recordKey, broker);
            }
        });
        return Array.from(brokerMap.values());
    }, [selectedBrokers]);

    // Create a Set of selected broker IDs for O(1) lookup
    const selectedBrokerIds = useMemo(() => {
        return new Set(uniqueSelectedBrokers.map(broker => broker.recordKey));
    }, [uniqueSelectedBrokers]);

    // Get unmatched chips with deduplication
    const unmatchedChips = useMemo(() => {
        const allChips = context.getAllChips();
        const chipMap = new Map();

        allChips.forEach(chip => {
            const shouldInclude = !chip.brokerId || (!selectedBrokerIds.has(chip.brokerId) &&
                !enhancedRecords.some(record => record.recordKey === chip.brokerId && !record.needsFetch));

            if (shouldInclude && !chipMap.has(chip.id)) {
                chipMap.set(chip.id, chip);
                
                // Trigger fetch for unknown broker IDs
                if (chip.brokerId && !enhancedRecords.some(record => record.recordKey === chip.brokerId)) {
                    getOrFetchRecord(chip.brokerId);
                }
            }
        });

        return Array.from(chipMap.values());
    }, [context, selectedBrokerIds, enhancedRecords, getOrFetchRecord]);

    const handleRemove = useCallback(
        (recordId: MatrxRecordId) => {
            dispatch(actions.removeFromSelection(recordId));
            const broker = enhancedRecords[recordId];
            const messageBrokerId = broker?.data?.messageBrokerInverse?.[0]?.id;
            if (messageBrokerId) {
                removeRelationship(toPkValue(messageBrokerId));
            }
        },
        [enhancedRecords, removeRelationship]
    );

    const handleChipUpdate = useCallback(
        (chipId: string, updates: Partial<ChipData>) => {
            context.chips.updateChipData(chipId, updates);
        },
        [context]
    );

    if (isLoading || !canProcess) {
        return <BrokerLoadingState />;
    }

    return (
        <div className='w-full'>
            {uniqueSelectedBrokers.map(({ recordKey, data }) => (
                <BrokerDisplayCard
                    key={recordKey}
                    recordId={recordKey}
                    record={data}
                    chips={unmatchedChips}
                    unifiedLayoutProps={unifiedLayoutProps}
                    onDelete={handleRemove}
                />
            ))}

            {unmatchedChips.map((chip) => (
                <ChipDisplay
                    key={chip.id}
                    chip={chip}
                    brokers={quickReferences || []}
                    onUpdate={handleChipUpdate}
                />
            ))}
        </div>
    );
};

export default BrokerRecordsSimple;