import { PanelContent } from '../../components/dynamic/PanelContent';
import React, { useCallback, useEffect, useState } from 'react';
import { useAppDispatch } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useUpdateRecord } from '@/app/entities/hooks/crud/useUpdateRecord';
import { EditorWithProviders } from '@/providers/rich-text-editor/withManagedEditor';
import { MatrxRecordId } from '@/types/records';
import { MessageTemplateProcessed } from '@/types/AutomationSchemaTypes';
import { TextPlaceholderEffect } from '../TextPlaceholderEffect';
import { useEditorContext } from '@/providers/rich-text-editor/Provider';
import { BrokerMetaData } from '@/types/editor.types';
import useChipHandlers from '../../hooks/brokers/useChipHandlers';
import MessageToolbar, { MessageToolbarProps } from './MessageToolbar';
import DebugPanelWrapper, { DebugPanelWrapperProps } from './DebugPanelWrapper';

const DEBUG_STATUS = true;

interface MessageEditorWrapperProps {
    messageRecordId: MatrxRecordId;
    message: MessageTemplateProcessed;
    className?: string;
    isCollapsed?: boolean;
    onCollapse?: () => void;
    onExpand?: () => void;
    onDelete?: (messageRecordId: MatrxRecordId) => void;
    onChipUpdate?: (chipData: any) => void;
    onToggleEditor?: (messageRecordId: MatrxRecordId) => void;
    onDragDrop?: (draggedId: MatrxRecordId, targetId: MatrxRecordId) => void;
    deleteMessage?: (childRecordId: MatrxRecordId) => void;
    onOrderChange?: (draggedId: MatrxRecordId, dropTargetId: MatrxRecordId) => void;
}

export const MessageEditorWrapper: React.FC<MessageEditorWrapperProps> = ({
    messageRecordId,
    message,
    className,
    isCollapsed = false,
    onToggleEditor,
    onDelete,
    onDragDrop,
    deleteMessage,
    ...props
}) => {
    const dispatch = useAppDispatch();
    const context = useEditorContext();
    const { updateRecord } = useUpdateRecord('messageTemplate');
    const [initialRenderHold, setInitialRenderHold] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedContent, setLastSavedContent] = useState('');
    const [isEditorHidden, setIsEditorHidden] = useState(isCollapsed);
    const [debugVisible, setDebugVisible] = useState(false);
    const { actions: messageActions } = useEntityTools('messageTemplate');
    const { handleChipClick, handleChipDoubleClick, handleChipMouseEnter, handleChipMouseLeave, handleChipContextMenu, addDialogHandler } =
        useChipHandlers(messageRecordId);

    useEffect(() => {
        setIsEditorHidden(isCollapsed);
    }, [isCollapsed]);

    useEffect(() => {
        if (message?.content) {
            setLastSavedContent(message.content);
        }
    }, [message?.content]);

    const updateMessageContent = useCallback(
        (content: string) => {
            dispatch(
                messageActions.updateUnsavedField({
                    recordId: messageRecordId,
                    field: 'content',
                    value: content,
                })
            );
        },
        [messageActions, dispatch, messageRecordId]
    );

    const handleSave = useCallback(() => {
        console.log('Saving message:', messageRecordId);
        if (isSaving || initialRenderHold) {
            console.log('Skipping save:', isSaving, initialRenderHold);
            return;
        }
        const processedContent = context.getEncodedText(messageRecordId);
        if (processedContent === lastSavedContent) {
            return;
        }

        setIsSaving(true);
        updateMessageContent(processedContent);
        updateRecord(messageRecordId);
        setLastSavedContent(processedContent);

        setTimeout(() => {
            setIsSaving(false);
        }, 500);
    }, [context, messageRecordId, updateMessageContent, updateRecord, isSaving, lastSavedContent]);

    const createNewBroker = useCallback(
        async (brokerMetadata: BrokerMetaData) => {
            try {
                // await context.chips.syncChipToBroker(chipData.id, `id:${newBrokerId}`);
                console.log('Message Editor was informated of a new broker:', brokerMetadata);
                handleSave();
            } catch (error) {
                console.error('Failed to create relationship:', error);
            }
        },
        [handleSave]
    );

    const addExistingBrokerToSelection = useCallback((brokerId: string) => {
        console.log('Adding broker to selection:', brokerId);
    }, []);

    const associateBrokerWithMessage = useCallback((brokerId: string) => {
        console.log('Associating broker with message:', brokerId);
    }, []);

    const handleBlur = useCallback(() => {
        console.log('Editor blurred:', messageRecordId);
        handleSave();
    }, [handleSave]);

    const handleDelete = useCallback(() => {
        console.log('Deleting message:', messageRecordId);
        deleteMessage(messageRecordId);
    }, [messageRecordId, onDelete]);

    // Toolbar handlers
    const handleRoleChange = useCallback(
        (messageRecordId: MatrxRecordId, newRole: string) => {
            dispatch(
                messageActions.updateUnsavedField({
                    recordId: messageRecordId,
                    field: 'role',
                    value: newRole,
                })
            );
            updateRecord(messageRecordId);
        },
        [dispatch, messageActions, updateRecord]
    );

    const handleAddMedia = useCallback(() => {
        console.log('Adding media for:', messageRecordId);
    }, [messageRecordId]);

    const handleLinkBroker = useCallback(() => {
        console.log('Linking broker for:', messageRecordId);
    }, [messageRecordId]);

    const handleShowChips = useCallback(() => {
        context.setContentMode(messageRecordId, 'encodeChips');
    }, [context, messageRecordId]);

    const handleShowEncoded = useCallback(() => {
        context.setContentMode(messageRecordId, 'encodeVisible');
    }, [context, messageRecordId]);

    const handleShowNames = useCallback(() => {
        context.setContentMode(messageRecordId, 'name');
    }, [context, messageRecordId]);

    const handleShowDefaultValue = useCallback(() => {
        context.setContentMode(messageRecordId, 'defaultValue');
    }, [context, messageRecordId]);

    // Toolbar props
    const toolbarProps = {
        messageRecordId,
        role: message.role,
        isCollapsed,
        onAddMedia: handleAddMedia,
        onLinkBroker: handleLinkBroker,
        onDelete: handleDelete,
        onSave: handleSave,
        onToggleCollapse: () => onToggleEditor?.(messageRecordId),
        onShowChips: handleShowChips,
        onShowEncoded: handleShowEncoded,
        onShowNames: handleShowNames,
        onShowDefaultValue: handleShowDefaultValue,
        onRoleChange: handleRoleChange,
        onDragDrop,
        debug: DEBUG_STATUS,
        onDebugClick: () => setDebugVisible((prev) => !prev),
    };

    // Debug props
    const debugProps = {
        editorId: messageRecordId,
        message: message,
    };

    return (
        <PanelContent
            id={messageRecordId}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => onToggleEditor?.(messageRecordId)}
            onSave={handleSave}
            onDelete={() => deleteMessage?.(messageRecordId)}
            toolbarComponent={MessageToolbar}
            toolbarProps={toolbarProps}
            debugComponent={DebugPanelWrapper}
            debugProps={debugProps}
            debug={DEBUG_STATUS}
            debugVisible={debugVisible}
            onDebugVisibilityChange={setDebugVisible}
            isLoading={initialRenderHold}
            loadingComponent={<TextPlaceholderEffect />}
        >
            <div className={`transition-all duration-200 ${isEditorHidden ? 'h-0 overflow-hidden' : 'h-[calc(100%-2rem)]'}`}>
                {initialRenderHold ? (
                    <div className='flex items-center justify-center h-full'>
                        <TextPlaceholderEffect />
                    </div>
                ) : (
                    <EditorWithProviders
                        id={messageRecordId}
                        initialContent={message.content}
                        className={className}
                        onBlur={handleBlur}
                        chipHandlers={{
                            onClick: handleChipClick,
                            onDoubleClick: addDialogHandler,
                            onMouseEnter: handleChipMouseEnter,
                            onMouseLeave: handleChipMouseLeave,
                            onContextMenu: handleChipContextMenu,
                            onNewChip: createNewBroker,
                        }}
                        {...props}
                    />
                )}
            </div>
        </PanelContent>
    );
};

export default MessageEditorWrapper;
