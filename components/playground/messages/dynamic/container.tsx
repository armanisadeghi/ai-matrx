import React, { useCallback, useState } from 'react';
import { generateMessage } from '../prompts';
import type { MatrxRecordId } from '@/types/records';
import type { AddMessagePayload } from '../../hooks/messages/useAddMessage';
import { CockpitControls } from '../../types';
import EmptyMessagesCard from '../EmptyMessagesCard';
import { MessageEditorWrapper } from './MessageEditorWrapper';
import { ResizablePanelSystem } from '../../components/dynamic/VerticalPanelSystem';

interface MessagesContainerProps {
    cockpitControls: CockpitControls;
}

export function DynamicMessagesContainer({ 
    cockpitControls: playgroundControls 
}: MessagesContainerProps) {
    const { messages, deleteMessage, addMessage, handleDragDrop } = playgroundControls.aiCockpitHook;

    const addNewSection = useCallback(() => {
        const getNextRole = (currentRole: AddMessagePayload['role']): AddMessagePayload['role'] => {
            switch (currentRole) {
                case 'system': return 'user';
                case 'user': return 'assistant';
                case 'assistant': return 'user';
                default: return 'system';
            }
        };
    
        const lastSection = messages[messages.length - 1];
        const lastRole = lastSection?.role;
        const nextRole = lastRole ? getNextRole(lastRole as any) : 'system';
        
        const newMessage = generateMessage(nextRole, messages.length);
        addMessage(newMessage);
    }, [messages, addMessage]);

    // Convert messages to panel data
    const panelData = messages.map((message, index) => ({
        id: message.matrxRecordId,
        content: message,
        order: index + 1
    }));

    // Render panel content
    const renderPanel = useCallback((panel: { id: string, content: any }, isCollapsed: boolean) => {
        const panelId = panel.id as MatrxRecordId;
        return (
            <MessageEditorWrapper
                messageRecordId={panelId}
                message={panel.content}
                className=""
                isCollapsed={isCollapsed}
                onToggleEditor={() => {}}
                onDelete={() => deleteMessage(panelId)}
                deleteMessage={deleteMessage}
                onDragDrop={handleDragDrop}
            />
        );
    }, [deleteMessage, handleDragDrop]);

    if (messages.length === 0) {
        return (
            <EmptyMessagesCard 
                onSuccess={() => {
                    // The hook will handle the message addition
                }}
                onError={(error) => {
                    console.error('Error adding template messages:', error);
                }}
            />
        );
    }

    return (
        <div className="h-full relative">
            <ResizablePanelSystem
                panels={panelData}
                renderPanel={renderPanel}
                onPanelAdd={addNewSection}
                onPanelDelete={deleteMessage}
                onPanelReorder={handleDragDrop}
                addButtonLabel={`Add ${messages[messages.length - 1]?.role === 'user' ? 'Assistant' : 'User'} Message`}
                showAddButton={true}
            />
        </div>
    );
}

export default DynamicMessagesContainer;
