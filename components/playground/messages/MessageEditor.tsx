import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import { useUpdateRecord } from "@/app/entities/hooks/crud/useUpdateRecord";
import { EditorWithProviders } from "@/providers/rich-text-editor/withManagedEditor";
import { Card } from "@/components/ui/card";
import { MatrxRecordId } from "@/types/records";
import { MessageTemplateProcessed } from "@/types/AutomationSchemaTypes";
import MessageToolbar, { DisplayOption } from "./MessageToolbar";
import DebugPanel from "./AdminToolbar";
import { BrokerMetaData, ChipData } from "@/types/editor.types";
import useChipHandlers from "../hooks/brokers/useChipHandlers";
import { TextPlaceholderEffect } from "./TextPlaceholderEffect";
import { useEditorContext } from "@/providers/rich-text-editor/Provider";
import FullScreenMarkdownEditor from "@/components/mardown-display/chat-markdown/FullScreenMarkdownEditor";

const DEBUG_STATUS = true;
const DEBUG_PRINTS = false;

interface ChipChangeData {
    chipId: string;
    brokerId?: string;
    action: "add" | "update" | "remove";
    data: Partial<ChipData>;
}

interface MessageEditorProps {
    messageRecordId: MatrxRecordId;
    message: MessageTemplateProcessed;
    isCollapsed: boolean;
    className?: string;
    onCollapse?: () => void;
    onExpand?: () => void;
    onDelete?: (messageRecordId: MatrxRecordId) => void;
    onChipUpdate?: (chipData: ChipChangeData) => void;
    onToggleEditor?: (messageRecordId: MatrxRecordId) => void;
    onDragDrop?: (draggedId: MatrxRecordId, targetId: MatrxRecordId) => void;
    deleteMessage?: (childRecordId: MatrxRecordId) => void;
    onOrderChange?: (draggedId: MatrxRecordId, dropTargetId: MatrxRecordId) => void;
    registerComponentSave?: (componentId: string, saveFn: () => Promise<void>) => void;
}

export const MessageEditor: React.FC<MessageEditorProps> = ({
    messageRecordId,
    message,
    className,
    isCollapsed = false,
    onCollapse,
    onExpand,
    onDelete,
    onChipUpdate,
    onToggleEditor,
    onDragDrop,
    onOrderChange,
    deleteMessage,
    registerComponentSave,
    ...props
}) => {
    const dispatch = useAppDispatch();
    const context = useEditorContext();
    const { updateRecord } = useUpdateRecord("messageTemplate");
    const [initialRenderHold, setInitialRenderHold] = useState(false);
    const [currentDisplayOption, setCurrentDisplayOption] = useState<DisplayOption>("richText");

    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedContent, setLastSavedContent] = useState("");
    const [isEditorHidden, setIsEditorHidden] = useState(isCollapsed);
    const [debugVisible, setDebugVisible] = useState(false);
    const [isFullScreenMarkdownEditorOpen, setIsFullScreenMarkdownEditorOpen] = useState(false);

    const { actions: messageActions } = useEntityTools("messageTemplate");
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
            console.log("--> MessageEditor: updateMessageContent: Dispatching action to update content: ", content);
            dispatch(
                messageActions.updateUnsavedField({
                    recordId: messageRecordId,
                    field: "content",
                    value: content,
                })
            );
        },
        [messageActions, dispatch, messageRecordId]
    );

    const handleSaveAsync = useCallback(async () => {
        if (DEBUG_PRINTS) {
            console.log("Saving message:", messageRecordId);
        }
        if (isSaving || initialRenderHold) {
            console.log("Skipping save:", isSaving, initialRenderHold);

            return;
        }

        const processedContent = context.getEncodedText(messageRecordId);
        if (processedContent === lastSavedContent) {
            return;
        }

        setIsSaving(true);
        try {
            updateMessageContent(processedContent);
            await updateRecord(messageRecordId);
            setLastSavedContent(processedContent);
        } finally {
            setTimeout(() => {
                setIsSaving(false);
            }, 200);
        }
    }, [context, messageRecordId, updateMessageContent, updateRecord, isSaving, lastSavedContent, initialRenderHold]);

    // Keep the original handleSave for direct calls (blur, etc)
    const handleSave = useCallback(() => {
        handleSaveAsync().catch((error) => {
            console.error("Error saving message:", error);
        });
    }, [handleSaveAsync]);

    // Register with the orchestration system if available
    useEffect(() => {
        if (registerComponentSave) {
            return registerComponentSave(`message-editor-${messageRecordId}`, handleSaveAsync);
        }
    }, [registerComponentSave, messageRecordId, handleSaveAsync]);

    const createNewBroker = useCallback(
        async (brokerMetadata: BrokerMetaData) => {
            try {
                // await context.chips.syncChipToBroker(chipData.id, `id:${newBrokerId}`);
                console.log("Message Editor was informated of a new broker:", brokerMetadata);
                handleSave();
            } catch (error) {
                console.error("Failed to create relationship:", error);
            }
        },
        [handleSave]
    );

    const addExistingBrokerToSelection = useCallback(
        (brokerId: string) => {
            console.log("Adding broker to selection:", brokerId);
        },
        [messageRecordId]
    );

    const associateBrokerWithMessage = useCallback(
        (brokerId: string) => {
            console.log("Associating broker with message:", brokerId);
        },
        [messageRecordId]
    );

    const handleBlur = useCallback(() => {
        if (DEBUG_PRINTS) {
            console.log("Editor blurred:", messageRecordId);
        }
        handleSave();
    }, [handleSave]);

    const handleDelete = useCallback(() => {
        if (DEBUG_PRINTS) {
            console.log("Deleting message:", messageRecordId);
        }
        deleteMessage(messageRecordId);
    }, [messageRecordId, onDelete]);

    const handleAddMedia = useCallback(() => {
        // Implementation for adding media
        if (DEBUG_PRINTS) {
            console.log("Adding media");
        }
    }, []);

    const handleLinkBroker = useCallback(() => {
        // Implementation for linking broker
        console.log("Linking broker");
    }, []);

    const handleShowChips = useCallback(() => {
        context.setContentMode(messageRecordId, "encodeChips");
        console.log("Showing chips");
    }, []);

    const handleShowEncoded = useCallback(() => {
        context.setContentMode(messageRecordId, "encodeVisible");
        console.log("Showing encoded");
    }, []);

    const handleShowEncodedId = useCallback(() => {
        context.setContentMode(messageRecordId, "recordKey");
        console.log("Showing encoded id");
    }, []);

    const handleShowNames = useCallback(() => {
        context.setContentMode(messageRecordId, "name");
        console.log("Showing names");
    }, []);

    const handleShowDefaultValue = useCallback(() => {
        context.setContentMode(messageRecordId, "defaultValue");
        console.log("Showing default value");
    }, []);

    const handleToggleVisibility = useCallback(() => {
        setIsEditorHidden((prev) => !prev);
        if (onToggleEditor) {
            onToggleEditor(messageRecordId);
        }
    }, [messageRecordId, onToggleEditor]);

    const handleRoleChange = useCallback(
        (messageRecordId: MatrxRecordId, newRole: "user" | "assistant" | "system") => {
            dispatch(
                messageActions.updateUnsavedField({
                    recordId: messageRecordId,
                    field: "role",
                    value: newRole,
                })
            );
            updateRecord(messageRecordId);
        },
        [dispatch]
    );

    const toggleDebug = useCallback(() => {
        setDebugVisible((prev) => !prev);
    }, []);

    const handleDisplayOptionChange = useCallback((messageRecordId: MatrxRecordId, displayOption: DisplayOption) => {
        if (displayOption === "markdown") {
            setIsFullScreenMarkdownEditorOpen(true);
        }

        setCurrentDisplayOption(displayOption);
    }, []);

    const markdownAnalysisData = null;

    const handleFullDisplayCancel = () => {
        setIsFullScreenMarkdownEditorOpen(false);
    };

    const handleValidateContent = (newContent: string) => {
        const isContentValid = true;
        console.log("Validating content:", newContent);
        return isContentValid;
    };

    const handleFullDisplaySave = (newContent: string) => {
        console.log("--> MessageEditor: handleFullDisplaySave: newContent: ", newContent);
        const isContentValid = handleValidateContent(newContent);
        console.log("--> MessageEditor: handleFullDisplaySave: isContentValid: ", isContentValid);
        if (isContentValid) {
            context.setContent(messageRecordId, newContent);

            setTimeout(() => {
                handleSave();
            }, 100);
            setIsFullScreenMarkdownEditorOpen(false);
        }
    };

    const handleToggleFullDisplay = () => {
        setIsFullScreenMarkdownEditorOpen((prev) => !prev);
    };

    return (
        <Card className="h-full p-0 overflow-hidden bg-textured border-elevation2">
            <MessageToolbar
                messageRecordId={messageRecordId}
                role={message.role}
                isCollapsed={isCollapsed}
                onAddMedia={handleAddMedia}
                onLinkBroker={handleLinkBroker}
                onDelete={handleDelete}
                onSave={handleSave}
                onToggleCollapse={handleToggleVisibility}
                onShowChips={handleShowChips}
                onShowEncoded={handleShowEncoded}
                onShowEncodedId={handleShowEncodedId}
                onShowNames={handleShowNames}
                onShowDefaultValue={handleShowDefaultValue}
                onRoleChange={handleRoleChange}
                onDragDrop={onDragDrop}
                debug={DEBUG_STATUS}
                onDebugClick={toggleDebug}
                onDisplayOptionChange={handleDisplayOptionChange}
                currentDisplayOption={currentDisplayOption}
            />
            {debugVisible && <DebugPanel editorId={messageRecordId} message={message} />}
            <div className={`transition-all duration-200 ${isEditorHidden ? "h-0 overflow-hidden" : "h-[calc(100%-2rem)]"}`}>
                {initialRenderHold ? (
                    <div className="flex items-center justify-center h-full">
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
                <FullScreenMarkdownEditor
                    isOpen={isFullScreenMarkdownEditorOpen}
                    initialContent={message.content}
                    onSave={handleFullDisplaySave}
                    onCancel={handleFullDisplayCancel}
                    analysisData={markdownAnalysisData}
                    messageId={message.id}
                    initialTab="preview"
                />
            </div>
        </Card>
    );
};

MessageEditor.displayName = "MessageEditor";

export default MessageEditor;
