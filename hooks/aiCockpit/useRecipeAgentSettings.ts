import { useCallback } from 'react';
import { EntityData } from '@/types/entityTypes';
import { MatrxRecordId } from '@/types/records';
import { AiAgentDataOptional, AiSettingsProcessed } from '@/types/AutomationSchemaTypes';
import { RelationshipProcessingHook, useRelFetchProcessing } from '@/app/entities/hooks/relationships/useRelationshipsWithProcessing';
import { getStandardRelationship } from '@/app/entities/hooks/relationships/definitionConversionUtil';
import { useAppDispatch } from "@/lib/redux/hooks";
import { processReturnResults } from '@/app/entities/hooks/crud/useDirectRelCreate';
import { v4 as uuidv4 } from 'uuid';

type AiSettingsData = {
    id: string;
    aiEndpoint?: string;
    aiModel?: string;
    aiProvider?: string;
    maxTokens?: number;
    presetName?: string;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stream?: boolean;
    responseFormat?: string;
    size?: string;
    quality?: string;
    count?: number;
    audioVoice?: string;
    audioFormat?: string;
    modalities?: Record<string, unknown>;
    tools?: Record<string, unknown>;
    aiProviderReference?: EntityData<'aiProvider'>[];
    aiEndpointReference?: EntityData<'aiEndpoint'>[];
    aiModelReference?: EntityData<'aiModel'>[];
    aiAgentInverse?: EntityData<'aiAgent'>[];
};

type AiAgentData = {
    id: string;
    name: string;
    recipeId?: string;
    aiSettingsId?: string;
    systemMessageOverride?: string;
    aiSettingsReference?: EntityData<'aiSettings'>[];
    recipeReference?: EntityData<'recipe'>[];
};

export type RecordTabData = {
    tabId: number;
    label: string;
    resultLabel: string;
    isDisables: boolean;
    isRecord: boolean;
    id: string;
    matrxRecordId: MatrxRecordId;
    presetName: string;
};


export function useRecipeAgentSettings(recipeSettingsHook: RelationshipProcessingHook) {
    const dispatch = useAppDispatch();
    const {
        joiningEntity: aiAgents,
        joiningMatrxIds: agentMatrxIds,
        childIds: settingsIds,
        childMatrxIds: settingsMatrxIds,
        unprocessedChildRecords: coreSettings,
        childRecords,
        parentId: recipePkId,
        parentMatrxid: recipeMatrxId,
        deleteChildAndJoin: deleteSettings,
        createRelatedRecords: createRecipeSettingsAgent,
        isLoading: aiSettingsIsLoading,
        loadingState: aiSettingsLoadingState,
        joinTools: aiAgentsTools,
        childTools: aiSettingsTools,
    } = recipeSettingsHook;

    const processedSettings = childRecords as AiSettingsProcessed[];

    const { actions: aiSettingsActions, selectors: aiSettingsSelectors } = aiSettingsTools;
    const { actions: aiAgentActions, selectors: aiAgentSelectors } = aiAgentsTools;


    const recordTab = (record: AiSettingsProcessed, position: number): RecordTabData => {
        return {
            tabId: position,
            label: `Set ${position}`,
            resultLabel: `RESULT ${position}`,
            isDisables: false,
            isRecord: true,
            id: record.id,
            matrxRecordId: record.matrxRecordId,
            presetName: record.presetName,
        };
    };

    const firstPlaceholder = (position: number): RecordTabData => {
        const tempId = uuidv4();
        return {
            tabId: position,
            label: `Add`,
            resultLabel: `RESULT ${position}`,
            isDisables: false,
            isRecord: false,
            id: tempId,
            matrxRecordId: `id:${tempId}`,
            presetName: `New Settings ${position}`,
        };
    };

    const AdditionalPlaceholder = (position: number): RecordTabData => {
        const tempId = uuidv4();
        return {
            tabId: position,
            label: `Add`,
            resultLabel: `RESULT ${position}`,
            isDisables: true,
            isRecord: false,
            id: tempId,
            matrxRecordId: `id:${tempId}`,
            presetName: `New Settings ${position}`,
        };
    };

    const generateTabs = (): RecordTabData[] => {
        const tabs = [];
        const recordCount = processedSettings.length;
        for (let i = 0; i < Math.min(recordCount, 4); i++) {
            tabs.push(recordTab(processedSettings[i], i + 1));
        }
        if (recordCount < 4) {
            tabs.push(firstPlaceholder(recordCount + 1));
            for (let i = recordCount + 2; i <= 4; i++) {
                tabs.push(AdditionalPlaceholder(i));
            }
        }

        return tabs;
    };

    const handleError = useCallback((error: Error) => {
        console.error('Error creating settings and agent:', error);
    }, []);

    const createNewSettingsData = useCallback(
        async (
            settingsData: AiSettingsData,
            agentData: AiAgentDataOptional,
            filter?: boolean
        ): Promise<{
            aiSettingsRecord: AiSettingsData;
            aIAgentRecord: AiAgentData;
            newAiSettingsMatrxId: MatrxRecordId;
            newAiAgentRecordId: MatrxRecordId;
        }> => {
            const data = {
                child: settingsData,
                joining: agentData,
            };

            try {
                const result = await createRecipeSettingsAgent(
                    data,
                    {
                        showIndividualToasts: false,
                        showCombinedToast: false,
                    },
                    filter
                );

                if (!result) {
                    throw new Error('Failed to create related records: No result returned');
                }

                const {
                    childRecord: aiSettingsRecord,
                    joinRecord: aIAgentRecord,
                    childMatrxRecordId: newAiSettingsMatrxId,
                    joinMatrxRecordId: newAiAgentRecordId,
                } = processReturnResults([result]);

                dispatch(aiSettingsActions.addToSelection(newAiSettingsMatrxId));
                dispatch(aiAgentActions.addToSelection(newAiAgentRecordId));

                return {
                    aiSettingsRecord: aiSettingsRecord as AiSettingsData,
                    aIAgentRecord: aIAgentRecord as AiAgentData,
                    newAiSettingsMatrxId,
                    newAiAgentRecordId,
                };
            } catch (error) {
                handleError(error as Error);
                throw error;
            }
        },
        [createRecipeSettingsAgent, dispatch, aiSettingsActions, handleError]
    );

    return {
        aiAgents,
        agentMatrxIds,
        settingsIds,
        settingsMatrxIds,
        coreSettings,
        processedSettings,
        generateTabs,
        recipePkId,
        recipeMatrxId,
        deleteSettings,
        createNewSettingsData,
        aiSettingsIsLoading,
        aiSettingsLoadingState,
        aiSettingsTools,
        aiAgentsTools,
    };
}

export type UseRecipeAgentSettingsHook = ReturnType<typeof useRecipeAgentSettings>;

export function useRelatedAiSettings(recipeMatrxId: MatrxRecordId) {
    const relDef = getStandardRelationship('aiAgent');
    const relationshipHook = useRelFetchProcessing(relDef, recipeMatrxId);
    return useRecipeAgentSettings(relationshipHook);
}
