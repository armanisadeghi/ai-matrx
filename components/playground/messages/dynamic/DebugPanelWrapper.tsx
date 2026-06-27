import React, { useCallback, useState } from 'react';
import { DebugTabs, TabConfig } from '../../components/dynamic/DebugTabs';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';
import { EditorLineInfo, getEditorLineInfo } from '@/features/rich-text-editor/admin/new-test-util';
import { getAllMetadata } from '@/features/rich-text-editor/utils/patternUtils';
import { MatrxRecordId } from '@/types/records';
import { MessageTemplateProcessed } from '@/types/AutomationSchemaTypes';
import { BrokerMetaData, ChipData, EditorState } from '@/types/editor.types';
import { BaseDebugProps } from '../../components/dynamic/PanelContent';

export interface DebugPanelWrapperProps extends BaseDebugProps {
    editorId: MatrxRecordId;
    message: MessageTemplateProcessed;
}

interface FlatEditorState {
    contentCharCount: number;
    initialized: boolean;
    contentMode: string;
    chipDataCount: number;
    metadataCount: number;
    layoutPosition: string | number | null;
    layoutIsVisible: boolean | null;
    layoutType: string | null;
}

const flattenEditorState = (state: EditorState): FlatEditorState => ({
    contentCharCount: state.content.length,
    initialized: state.initialized,
    contentMode: state.contentMode,
    chipDataCount: state.chipData.length,
    metadataCount: state.metadata?.length ?? 0,
    layoutPosition: state.layout?.position ?? null,
    layoutIsVisible: state.layout?.isVisible ?? null,
    layoutType: state.layout?.type ?? null,
});

export const DebugPanelWrapper: React.FC<DebugPanelWrapperProps> = ({ 
    editorId, 
    message 
}) => {
    const [editorInfo, setEditorInfo] = useState<EditorLineInfo>({} as EditorLineInfo);
    const [patternMatches, setPatternMatches] = useState<any[]>([]);
    const [brokerMetaData, setBrokerMetaData] = useState<BrokerMetaData[]>([]);
    const [chipData, setChipData] = useState<ChipData[]>([]);
    const [editorState, setEditorState] = useState<FlatEditorState>({} as FlatEditorState);

    const context = useEditorContext();
    const content = context.getContent(editorId);

    // Refresh handlers
    const refreshEditorInfo = useCallback(() => {
        const info = getEditorLineInfo(editorId);
        setEditorInfo(info);
    }, [editorId]);

    const refreshPatternMatches = useCallback(() => {
        const matches = getAllMetadata(content || '');
        setPatternMatches(matches);
    }, [content]);

    const refreshBrokerMetaData = useCallback(() => {
        const brokers = context.getBrokerMetadata(editorId);
        setBrokerMetaData(brokers || []);
    }, [context, editorId]);

    const refreshChips = useCallback(() => {
        const chips = context.getChipData(editorId);
        setChipData(chips || []);
    }, [context, editorId]);

    const refreshEditorState = useCallback(() => {
        const currentState = context.getEditorState(editorId);
        const flatState = flattenEditorState(currentState);
        setEditorState(flatState);
    }, [context, editorId]);

    const debugTabs: TabConfig[] = [
        {
            id: 'editor',
            label: 'Editor Info',
            type: 'table',
            data: editorInfo,
            onRefresh: refreshEditorInfo,
            refreshInterval: 2000
        },
        {
            id: 'text',
            label: 'Text Content',
            type: 'text',
            content: content || 'No content'
        },
        {
            id: 'editorState',
            label: 'Editor State',
            type: 'table',
            data: editorState,
            onRefresh: refreshEditorState
        },
        {
            id: 'chips',
            label: 'Chip Data',
            type: 'table',
            data: chipData,
            onRefresh: refreshChips
        },
        {
            id: 'patterns',
            label: 'Chip Patterns',
            type: 'table',
            data: patternMatches,
            onRefresh: refreshPatternMatches,
            refreshInterval: 2000
        },
        {
            id: 'brokers',
            label: 'Broker Data',
            type: 'table',
            data: brokerMetaData,
            onRefresh: refreshBrokerMetaData
        },
        {
            id: 'message',
            label: 'Message Data',
            type: 'table',
            data: [{
                matrxRecordId: message.matrxRecordId,
                order: message.order,
                role: message.role,
                type: message.type,
                content: message.content,
            }]
        }
    ];

    return (
        <DebugTabs
            tabs={debugTabs}
            defaultActiveTab="editor"
            refreshIntervals={true}
            className="bg-background border-b"
        />
    );
};

export default DebugPanelWrapper;