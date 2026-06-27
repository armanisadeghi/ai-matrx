// @ts-nocheck
// hooks/useEditorChips.ts
import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChipData, ChipRequestOptions, EditorState, BrokerMetaData } from '@/types/editor.types';
import { generateChipLabel } from '@/features/rich-text-editor/utils/generateBrokerName';
import { chipSyncManager } from '@/features/rich-text-editor/utils/ChipUpdater';
import { DataBrokerData, DataBrokerRecordWithKey, MessageBrokerData } from '@/types';
import { MatrxRecordId } from '@/types/records';
import { EditorStates } from './Provider';
import { RelationshipCreateResult, useRelationshipDirectCreate } from '@/app/entities/hooks/crud/useDirectRelCreate';
import { useAppDispatch } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useGetorFetchRecords } from '@/app/entities/hooks/records/useGetOrFetch';

export const sanitizeId = (id?: string): string | undefined => {
    if (!id) return id;

    const uuidRegex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
    const match = id.match(uuidRegex);
    return match ? match[0] : id;
};

export const makeBrokerMetadata = (requestOptions: ChipRequestOptions = {}, nextColor: string): BrokerMetaData => {
    const sanitizedId = sanitizeId(requestOptions.id);
    const idToUse = sanitizedId ?? uuidv4();
    const recordKey = requestOptions.matrxRecordId ?? `id:${idToUse}`;
    const name = requestOptions.name ?? generateChipLabel(requestOptions.defaultValue ?? '');
    const defaultValue = requestOptions.defaultValue ?? '';
    const dataType = requestOptions.dataType ?? 'str';
    return {
        id: idToUse,
        name: name,
        defaultValue: defaultValue,
        color: nextColor,
        matrxRecordId: recordKey,
        dataType: dataType,
    };
};

export const brokerFromMetadata = (metadata: BrokerMetaData): DataBrokerData => ({
    id: sanitizeId(metadata.id),
    name: metadata.name || 'New Broker',
    defaultValue: metadata.defaultValue || '',
    color: metadata.color as DataBrokerData['color'],
    dataType: metadata.dataType as DataBrokerData['dataType'],
});

const processReturnResults = (results: RelationshipCreateResult[], nextColor: string) => {
    const brokerRecord = results[0].childRecord as unknown as DataBrokerData;
    const messageBrokerRecord = results[0].joinRecord as unknown as MessageBrokerData;
    const matrxRecordId = results[0].childMatrxRecordId;

    const brokerMetadata = {
        id: brokerRecord.id,
        name: brokerRecord.name,
        defaultValue: brokerRecord.defaultValue || brokerRecord.name,
        color: brokerRecord.color || nextColor,
        matrxRecordId,
        defaultComponent: brokerRecord.inputComponent || '',
        dataType: brokerRecord.dataType || 'str',
        status: 'active',
    };

    return { matrxRecordId, brokerMetadata, messageBrokerRecord };
};

const processBrokerRecordData = (brokerRecord: DataBrokerRecordWithKey, nextColor: string): BrokerMetaData => {
    return {
        id: brokerRecord.id,
        name: brokerRecord.name,
        defaultValue: brokerRecord.defaultValue,
        color: brokerRecord.color || nextColor,
        matrxRecordId: brokerRecord.matrxRecordId,
        defaultComponent: brokerRecord.inputComponent,
        dataType: brokerRecord.dataType,
        status: 'active',
    };
};

export const useProviderChips = (
    editors: EditorStates,
    setEditors: (updater: (prev: EditorStates) => EditorStates) => void,
    getEditorState: (editorId: string) => EditorState,
    updateEditorState: (editorId: string, updates: Partial<EditorState>) => void,
    getNextColor: () => string,
    releaseColor: (color: string) => void
) => {
    const dispatch = useAppDispatch();
    const createRelatedRecords = useRelationshipDirectCreate('messageBroker', 'dataBroker');
    const { actions, selectors } = useEntityTools('dataBroker');
    interface PendingRecord {
        recordId: string;
        editorId: string;
    }
    const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([]);

    const recordIdsToFetch = Array.from(new Set(pendingRecords.map((pr) => pr.recordId)));
    const records = useGetorFetchRecords('dataBroker', recordIdsToFetch, true);

    const addChipDataFromMetadata = useCallback(
        (editorId: string, metadata: BrokerMetaData) => {
            const chipData: ChipData = {
                id: metadata.matrxRecordId,
                label: metadata.name,
                color: metadata.color,
                stringValue: metadata.defaultValue,
                brokerId: metadata.matrxRecordId,
                editorId: editorId,
            };

            setEditors((prev) => {
                const current = prev.get(editorId);
                if (!current) return prev;

                const next = new Map(prev);
                const existingChipIndex = current.chipData.findIndex((c) => c.id === chipData.id);

                if (existingChipIndex !== -1) {
                    // Update existing chip
                    const updatedChipData = [...current.chipData];
                    // If color is changing, release the old one
                    if (updatedChipData[existingChipIndex].color !== chipData.color) {
                        releaseColor(updatedChipData[existingChipIndex].color);
                    }
                    updatedChipData[existingChipIndex] = chipData;
                    next.set(editorId, {
                        ...current,
                        chipData: updatedChipData,
                    });
                } else {
                    // Add new chip
                    next.set(editorId, {
                        ...current,
                        chipData: [...current.chipData, chipData],
                    });
                }
                return next;
            });

            // Remove from pending records
            setPendingRecords((prev) => prev.filter((pr) => !(pr.recordId === metadata.matrxRecordId && pr.editorId === editorId)));
        },
        [setEditors, releaseColor]
    );

    useEffect(() => {
        if (!records) return;

        records.forEach((record: DataBrokerRecordWithKey) => {
            if (!record) return;

            // Find all editors waiting for this record
            const editorsForRecord = pendingRecords.filter((pr) => pr.recordId === record.matrxRecordId).map((pr) => pr.editorId);

            // Process for each editor that requested this record
            editorsForRecord.forEach((editorId) => {
                dispatch(actions.addToSelection(record.matrxRecordId));
                const processedRecord = processBrokerRecordData(record, getNextColor());
                addChipDataFromMetadata(editorId, processedRecord);
            });
        });
    }, [records, dispatch, addChipDataFromMetadata, pendingRecords]);

    const getOrFetchAllBrokers = useCallback(
        (editorId: string, recordIds: MatrxRecordId[]) => {
            const newRecordIds = recordIds.filter((id) => !pendingRecords.some((pr) => pr.recordId === id && pr.editorId === editorId));

            // Add new records to pending set
            setPendingRecords((prev) => [
                ...prev,
                ...newRecordIds.map((recordId) => ({
                    recordId,
                    editorId,
                })),
            ]);
        },
        [pendingRecords]
    );

    const handleError = useCallback((error: Error) => {
        console.error('Failed to create related records:', error);
    }, []);

    const addChipData = useCallback((editorId: string, data: ChipData) => {
        console.log('addChipData With:', editorId, data);
        setEditors((prev) => {
            const current = prev.get(editorId);
            if (!current) return prev;

            const next = new Map(prev);
            next.set(editorId, {
                ...current,
                chipData: [...current.chipData, data],
            });
            return next;
        });
    }, []);

    const updateChipData = useCallback(
        (chipId: string, updates: Partial<ChipData>) => {
            console.log('updateChipData With:', chipId, updates);
            setEditors((prev) => {
                const next = new Map(prev);

                prev.forEach((state, editorId) => {
                    const chip = state.chipData.find((c) => c.id === chipId);
                    if (chip) {
                        // If color is being updated, handle color management
                        if (updates.color && updates.color !== chip.color) {
                            releaseColor(chip.color);
                        }

                        const updatedState = {
                            ...state,
                            chipData: state.chipData.map((c) => (c.id === chipId ? { ...c, ...updates } : c)),
                        };
                        next.set(editorId, updatedState);
                        chipSyncManager.syncStateToDOM(editorId, chipId, updates);
                    }
                });

                return next;
            });
        },
        [releaseColor]
    );

    const updateChipAndBroker = useCallback(
        (matrxRecordId: MatrxRecordId, updates: Partial<ChipData>) => {
            setEditors((prev) => {
                const next = new Map(prev);

                prev.forEach((state, editorId) => {
                    const chip = state.chipData.find((c) => c.id === matrxRecordId);
                    const broker = state.metadata.find((m) => m.matrxRecordId === matrxRecordId);
                    if (chip && broker) {
                        // If color is being updated, handle color management
                        if (updates.color && updates.color !== chip.color) {
                            releaseColor(chip.color);
                        }

                        const updatedState = {
                            ...state,
                            chipData: state.chipData.map((c) => (c.id === matrxRecordId ? { ...c, ...updates } : c)),
                            metadata: state.metadata.map((m) => (m.matrxRecordId === matrxRecordId ? { ...m, ...updates } : m)),
                        };
                        next.set(editorId, updatedState);
                    }
                });

                return next;
            });
        },
        [releaseColor]
    );

    const createNewChipData = useCallback(
        async (
            editorId: string,
            requestOptions: ChipRequestOptions = {}
        ): Promise<{ matrxRecordId: MatrxRecordId; brokerMetadata: BrokerMetaData; messageBrokerRecord: MessageBrokerData }> => {
            const nextColor = getNextColor();

            const initialBrokerMetadata = makeBrokerMetadata(requestOptions, nextColor);
            const brokerData = brokerFromMetadata(initialBrokerMetadata);

            try {
                const result = await createRelatedRecords({
                    parentId: sanitizeId(editorId),
                    child: brokerData,
                    joining: {
                        defaultValue: brokerData.defaultValue,
                        messageId: editorId,
                    },
                });

                if (!result) {
                    throw new Error('Failed to create related records: No result returned');
                }

                const { matrxRecordId, brokerMetadata, messageBrokerRecord } = processReturnResults([result], nextColor);

                dispatch(actions.addToSelection(matrxRecordId));

                addBrokerMetadata(editorId, brokerMetadata);
                addChipDataFromMetadata(editorId, brokerMetadata);
                return { matrxRecordId, brokerMetadata, messageBrokerRecord };
            } catch (error) {
                handleError(error as Error);
                throw error;
            }
        },
        [createRelatedRecords, makeBrokerMetadata, brokerFromMetadata, handleError]
    );

    const generateLabel = useCallback(
        (editorId: string, requestOptions: ChipRequestOptions = {}): string => {
            const content = requestOptions.defaultValue ?? '';
            return generateChipLabel(content);
        },
        [getEditorState]
    );

    const setChipData = useCallback(
        (editorId: string, data: ChipData[]) => {
            console.log('setChipData With:', editorId, data);
            updateEditorState(editorId, { chipData: data });
        },
        [updateEditorState]
    );

    // Used Exclusiely by the Editor to crate a new chip
    const addBrokerMetadata = useCallback((editorId: string, data: BrokerMetaData) => {
        console.log('addBrokerMetadata With:', editorId, data);
        setEditors((prev) => {
            const current = prev.get(editorId);
            if (!current) return prev;

            const next = new Map(prev);
            next.set(editorId, {
                ...current,
                metadata: [...current.metadata, data],
            });
            return next;
        });
    }, []);

    const removeChipData = useCallback(
        (editorId: string, chipId: string) => {
            console.log('removeChipData With:', editorId, chipId);
            setEditors((prev) => {
                const current = prev.get(editorId);
                if (!current) return prev;

                const chip = current.chipData.find((c) => c.id === chipId);
                if (chip) {
                    releaseColor(chip.color);
                }

                const next = new Map(prev);
                next.set(editorId, {
                    ...current,
                    chipData: current.chipData.filter((chip) => chip.id !== chipId),
                });
                return next;
            });

            chipSyncManager.deleteChip(editorId, chipId);
        },
        [releaseColor]
    );

    const syncChipToBroker = useCallback(async (chipId: string, brokerId: MatrxRecordId) => {
        console.log('syncChipToBroker With:', chipId, brokerId);
        return new Promise<void>((resolve) => {
            const observer = new MutationObserver((mutations, obs) => {
                obs.disconnect();
                resolve();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-chip-id', 'data-broker-id'],
            });

            setEditors((prev) => {
                const next = new Map(prev);
                prev.forEach((state, editorId) => {
                    const chipIndex = state.chipData.findIndex((chip) => chip.id === chipId);
                    if (chipIndex !== -1) {
                        const updatedChipData = [...state.chipData];
                        updatedChipData[chipIndex] = {
                            ...updatedChipData[chipIndex],
                            id: brokerId,
                            brokerId: brokerId,
                        };

                        const updatedState = {
                            ...state,
                            chipData: updatedChipData,
                        };
                        next.set(editorId, updatedState);

                        chipSyncManager.syncStateToDOM(editorId, chipId, {
                            id: brokerId,
                            brokerId: brokerId,
                        });
                    }
                });
                return next;
            });

            setTimeout(() => {
                observer.disconnect();
                resolve();
            }, 1000);
        });
    }, []);

    const getAllChipData = useCallback(() => {
        console.log('getAllChipData');
        const allChips: Array<ChipData> = [];
        editors.forEach((state, editorId) => {
            state.chipData.forEach((chip) => {
                allChips.push({ ...chip, editorId });
            });
        });
        return allChips;
    }, [editors]);

    const getChipsForBroker = useCallback(
        (searchId: string) => {
            console.log('getChipsForBroker With:', searchId);
            const normalizedId = searchId.startsWith('id:') ? searchId.slice(3) : searchId;

            const allChips: Array<ChipData> = [];
            editors.forEach((state) => {
                const matchingChips = state.chipData.filter((chip) => chip.brokerId === normalizedId);
                allChips.push(...matchingChips);
            });
            return allChips;
        },
        [editors]
    );

    return {
        getAllChipData,
        getChipsForBroker,
        setChipData,
        createNewChipData,
        generateLabel,
        addChipData,
        removeChipData,
        updateChipData,
        syncChipToBroker,
        getOrFetchAllBrokers,
        updateChipAndBroker,
    };
};

export type ProviderChipsHook = ReturnType<typeof useProviderChips>;
