import React, { useState, useEffect, useCallback } from 'react';
import { BrokerMetaData, ChipData, ContentMode, EditorState } from '@/types/editor.types';
import { MatrxRecordId } from '@/types/records';
import { EditorLineInfo, getEditorLineInfo } from '@/features/rich-text-editor/admin/new-test-util';
import CompactTable from '@/components/matrx/CompactTable';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';
import { getAllMetadata } from '@/features/rich-text-editor/utils/patternUtils';

interface DebugPanelProps {
    editorId: MatrxRecordId;
    message: any;
}

interface FlatEditorState {
    contentCharCount: number;
    initialized: boolean;
    contentMode: ContentMode;
    chipDataCount: number;
    metadataCount: number;
    layoutPosition: string | number | null;
    layoutIsVisible: boolean | null;
    layoutType: string | null;
}

export const flattenEditorState = (state: EditorState): FlatEditorState => {
    return {
        contentCharCount: state.content.length,
        initialized: state.initialized,
        contentMode: state.contentMode,
        chipDataCount: state.chipData.length,
        metadataCount: state.metadata?.length ?? 0,
        layoutPosition: state.layout?.position ?? null,
        layoutIsVisible: state.layout?.isVisible ?? null,
        layoutType: state.layout?.type ?? null,
    };
};


const DebugPanel: React.FC<DebugPanelProps> = ({ editorId, message }) => {
    const [activeView, setActiveView] = useState<'editor' | 'text' | 'editorState' | 'chips' | 'patterns' | 'brokers' | 'message'>('editor');
    
    const [editorInfo, setEditorInfo] = useState<EditorLineInfo>({} as EditorLineInfo);
    const [patternMatches, setPatternMatches] = useState<any[]>([]);
    const [brokerMetaData, setBrokerMetaData] = useState<BrokerMetaData[]>([]);
    const [chipData, setChipData] = useState<ChipData[]>([]);
    const [editorState, setEditorState] = useState<FlatEditorState >({} as FlatEditorState);

    const context = useEditorContext();
    const content = context.getContent(editorId);

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
    
    
    // Set up interval refresh when editor tab is active
    useEffect(() => {
        if (activeView === 'editor') {
            refreshEditorInfo();
            const interval = setInterval(refreshEditorInfo, 2000);
            return () => clearInterval(interval);
        }
    }, [activeView, refreshEditorInfo]);

    // Set up interval refresh when patterns tab is active
    useEffect(() => {
        if (activeView === 'patterns') {
            refreshPatternMatches();
            const interval = setInterval(refreshPatternMatches, 2000);
            return () => clearInterval(interval);
        }
    }, [activeView, refreshPatternMatches]);

    // Refresh broker metadata when brokers tab is active
    useEffect(() => {
        if (activeView === 'brokers') {
            refreshBrokerMetaData();
        }
    }, [activeView, refreshBrokerMetaData]);

    useEffect(() => {
        if (activeView === 'chips') {
            refreshChips();
        }
    }, [activeView, refreshChips]);

    useEffect(() => {
        if (activeView === 'editorState') {
            refreshBrokerMetaData();
        }
    }, [activeView, refreshBrokerMetaData]);

    const tabs = [
        { id: 'editor', label: 'Editor Info', onMouseEnter: refreshEditorInfo },
        { id: 'text', label: 'Text Content' },
        { id: 'editorState', label: 'Editor State', onMouseEnter: refreshEditorState },
        { id: 'chips', label: 'Chip Data' },
        { id: 'patterns', label: 'Chip Patterns', onMouseEnter: refreshPatternMatches },
        { id: 'brokers', label: 'Broker Data', onMouseEnter: refreshBrokerMetaData },
        { id: 'message', label: 'Message Data' },
    ];
    const renderDebugContent = () => {
        switch (activeView) {
            case 'editor':
                return (
                    <CompactTable
                        data={editorInfo}
                    />
                );
            case 'editorState':
                return (
                    <CompactTable
                        data={editorState}
                    />
                );

            case 'text':
                return (
                    <div className='w-full'>
                        <div className='text-xs font-medium mb-1'>Plain Text Content:</div>
                        <div className='text-xs font-mono bg-muted/30 p-2 rounded'>{content || 'No content'}</div>
                    </div>
                );
            case 'chips':
                return (
                    <CompactTable
                        data={chipData}
                    />
                );
            case 'patterns':
                return (
                    <CompactTable
                        data={patternMatches}
                    />
                );
            case 'brokers':
                return (
                    <CompactTable
                        data={brokerMetaData}
                    />
                );
            case 'message':
                return (
                    <CompactTable
                        data={[
                            {
                                matrxRecordId: message.matrxRecordId,
                                order: message.order,
                                role: message.role,
                                type: message.type,
                                content: message.content,
                            },
                        ]}
                    />
                );
        }
    };

    return (
        <div className='bg-background border-b'>
            <div className='flex border-b'>
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveView(tab.id as any)}
                        onMouseEnter={tab.onMouseEnter}
                        className={`
                            px-3 py-1 text-xs font-medium transition-colors
                            ${activeView === tab.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}
                        `}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div className='p-2'>{renderDebugContent()}</div>
        </div>
    );
};

export default DebugPanel;
