import { useAppSelector } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useMemo } from 'react';
import { MatrxRecordId } from '@/types/records';
import { AiAgentDataRequired, AiSettingsDataRequired } from '@/types/AutomationSchemaTypes';
import { useAiAgents } from './useAiAgents';
import { useSynchronizedAiAgents } from './useSynchronizedAiAgents';

export function useAiSettings() {
    const entities = {
        aiAgent: useEntityTools('aiAgent'),
        aiSettings: useEntityTools('aiSettings'),
        aiProvider: useEntityTools('aiProvider'),
        aiModel: useEntityTools('aiModel'),
        aiEndpoint: useEntityTools('aiEndpoint'),
    };
    useSynchronizedAiAgents();

    const { 
        aiAgentRecords = [], 
        AiSettingsRecords = [], 
        settingsMatrxIds 
    } = useAiAgents();


    const activeAiAgent = useAppSelector(entities.aiAgent.selectors.selectActiveRecord) as AiAgentDataRequired | null;
    const activeAiAgentId = activeAiAgent?.id;

    const settingsId = useMemo(
        () => aiAgentRecords.find(agent => agent.id === activeAiAgentId)?.aiSettingsId ?? '',
        [aiAgentRecords, activeAiAgentId]
    );

    const settingsRecord = useMemo(
        () => AiSettingsRecords.find(settings => settings.id === settingsId) ?? {} as AiSettingsDataRequired,
        [AiSettingsRecords, settingsId]
    );

    const settingsMatrxId = useAppSelector((state) =>
        entities.aiSettings.selectors.selectMatrxRecordIdBySimpleKey(state, settingsId)
    ) as MatrxRecordId;

    const aiProviderRecordid = useAppSelector((state) =>
        entities.aiProvider.selectors.selectMatrxRecordIdBySimpleKey(state, settingsRecord.aiProvider)
    ) as MatrxRecordId;

    const aiModelRecordid = useAppSelector((state) =>
        entities.aiModel.selectors.selectMatrxRecordIdBySimpleKey(state, settingsRecord.aiModel)
    ) as MatrxRecordId;

    const aiEndpointRecordid = useAppSelector((state) =>
        entities.aiEndpoint.selectors.selectMatrxRecordIdBySimpleKey(state, settingsRecord.aiEndpoint)
    ) as MatrxRecordId;

    return {
        aiAgentRecords,
        AiSettingsRecords,
        settingsMatrxIds,
        settingsId,
        settingsMatrxId,
        settingsRecord,
        aiProviderRecordid,
        aiModelRecordid,
        aiEndpointRecordid,
    };
}