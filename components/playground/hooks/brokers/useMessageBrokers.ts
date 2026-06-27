import { useCallback } from 'react';
import { MatrxRecordId } from '@/types/records';
import { DataBrokerData } from '@/types/AutomationSchemaTypes';
import { RelationshipProcessingHook, useRelFetchProcessing } from '@/app/entities/hooks/relationships/useRelationshipsWithProcessing';
import { getStandardRelationship } from '@/app/entities/hooks/relationships/definitionConversionUtil';
import { ChipData } from '@/types/editor.types';

export interface AddBrokerPayload {
    id: string;
    name: string;
    defaultValue: string;
    dataType: DataBrokerData['dataType'];
    color?: string;
}

export function useMessageBrokers(messageBrokerHook: RelationshipProcessingHook) {
    const {
        joinRecords: messageBrokers,
        joiningMatrxIds: messageBrokerMatrxIds,
        childIds: dataBrokerIds,
        childMatrxIds: dataBrokerMatrxIds,
        unprocessedChildRecords: coreDataBrokers,
        childRecords: processedDataBrokers,
        parentId: messagePkId,
        parentMatrxid: messageMatrxId,
        deleteChildAndJoin: deleteDataBroker,
        createRelatedRecords,
        isLoading: messageBrokerIsLoading,
        loadingState: messageBrokerLoadingState,
    } = messageBrokerHook;

    const addBroker = useCallback(
        async (newBrokerId: string, chipData: ChipData) => {
            const newBroker = {
                id: newBrokerId,
                name: chipData.label || 'New Broker',
                defaultValue: chipData.stringValue || '',
                dataType: 'str' as const,
                color: chipData.color || 'blue',
            };

            const defaultValue = newBroker.defaultValue || '';
            
            return createRelatedRecords(
                {
                    child: newBroker,
                    joining: { defaultValue: defaultValue },
                }
            );
        },
        [createRelatedRecords]
    );

    const addDataBroker = useCallback(
        async (newBrokerId: string, Broker: any) => {
            const newBroker = {
                id: newBrokerId,
                name: Broker.name || 'New Broker',
                defaultValue: Broker.defaultValue || '',
                dataType: Broker.dataType || 'str',
                color: Broker.color || 'blue',
            };

            const defaultValue = newBroker.defaultValue || '';
            
            return createRelatedRecords(
                {
                    child: newBroker,
                    joining: { defaultValue: defaultValue },
                }
            );
        },
        [createRelatedRecords]
    );

    return {
        messageBrokers,
        messageBrokerMatrxIds,
        dataBrokerIds,
        dataBrokerMatrxIds,
        coreDataBrokers,
        processedDataBrokers,
        messagePkId,
        messageMatrxId,
        deleteDataBroker,
        addBroker,
        addDataBroker,
        messageBrokerIsLoading,
        messageBrokerLoadingState,
    };
}

export type UseMessageBrokersHook = ReturnType<typeof useMessageBrokers>;

export function useRelatedDataBrokers(messageMatrxId: MatrxRecordId) {
    const relDef = getStandardRelationship('messageBroker');
    const relationshipHook = useRelFetchProcessing(relDef, messageMatrxId);
    return useMessageBrokers(relationshipHook);
}
