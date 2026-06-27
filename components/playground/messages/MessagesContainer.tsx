"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator, GroupImperativeHandle, PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { MatrxRecordId } from "@/types/records";
import ConfirmationDialog, { DialogType } from "../components/ConfirmationDialog";
import MessageEditor from "./MessageEditor";
import { CockpitControls } from "../types";
import { generateMessage } from "./prompts";
import { AddMessagePayload } from "../hooks/messages/useAddMessage";
import EmptyMessagesCard from "./EmptyMessagesCard";
import { useDebounce } from "@uidotdev/usehooks";


interface MessagesContainerProps {
    cockpitControls: CockpitControls;
}

function MessagesContainer({ cockpitControls: playgroundControls }: MessagesContainerProps) {
    const { messages, deleteMessage, addMessage, handleDragDrop, registerComponentSave, recipeMessageIsLoading } = playgroundControls.aiCockpitHook;

    const [collapsedPanels, setCollapsedPanels] = useState<Set<MatrxRecordId>>(new Set());
    const [hiddenEditors, setHiddenEditors] = useState<Set<MatrxRecordId>>(new Set());
    const panelGroupRef = useRef<GroupImperativeHandle>(null);
    const panelRefs = useRef<Map<MatrxRecordId, PanelImperativeHandle>>(new Map());

    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState<DialogType>("delete");
    const [activeEditorId, setActiveEditorId] = useState<MatrxRecordId | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    
    const messagesLoading = useDebounce(recipeMessageIsLoading, 1000);

    useEffect(() => {
        setIsLoading(messagesLoading);
    }, [messagesLoading]);

    const addNewSection = useCallback(() => {
        const getNextRole = (currentRole: AddMessagePayload["role"]): AddMessagePayload["role"] => {
            switch (currentRole) {
                case "system":
                    return "user";
                case "user":
                    return "assistant";
                case "assistant":
                    return "user";
                default:
                    return "system";
            }
        };

        const lastSection = messages[messages.length - 1];
        const lastRole = lastSection?.role;
        const nextRole = lastRole ? getNextRole(lastRole as AddMessagePayload["role"]) : "system";

        const newMessage = generateMessage(nextRole, messages.length);
        addMessage(newMessage);
    }, [messages, addMessage]);

    const registerPanelRef = (messageRecordId: MatrxRecordId, ref: PanelImperativeHandle | null) => {
        if (ref) {
            panelRefs.current.set(messageRecordId, ref);
        } else {
            panelRefs.current.delete(messageRecordId);
        }
    };

    const handlePanelCollapse = (messageRecordId: MatrxRecordId) => {
        setCollapsedPanels((prev) => {
            const newSet = new Set(prev);
            newSet.add(messageRecordId);
            return newSet;
        });
        setHiddenEditors((prev) => {
            const newSet = new Set(prev);
            newSet.add(messageRecordId);
            return newSet;
        });
    };

    const handlePanelExpand = (messageRecordId: MatrxRecordId) => {
        setCollapsedPanels((prev) => {
            const newSet = new Set(prev);
            newSet.delete(messageRecordId);
            return newSet;
        });
        setHiddenEditors((prev) => {
            const newSet = new Set(prev);
            newSet.delete(messageRecordId);
            return newSet;
        });
    };

    const toggleEditor = useCallback(
        (messageRecordId: MatrxRecordId) => {
            const panelRef = panelRefs.current.get(messageRecordId);
            const isCurrentlyCollapsed = collapsedPanels.has(messageRecordId);

            if (isCurrentlyCollapsed) {
                panelRef?.resize(35);
                handlePanelExpand(messageRecordId);
            } else {
                panelRef?.resize(3);
                handlePanelCollapse(messageRecordId);
            }
        },
        [handlePanelExpand, handlePanelCollapse]
    );

    const handleDialogConfirm = () => {
        if (!activeEditorId) return;

        switch (dialogType) {
            case "delete":
                console.log("Deleting message:", activeEditorId);
                break;
            case "unsaved":
                console.log("Confirming exit with unsaved changes for:", activeEditorId);
                break;
            case "linkBroker":
                console.log("Confirming broker link for:", activeEditorId);
                break;
        }

        setDialogOpen(false);
        setActiveEditorId(null);
    };

    const openDialog = (type: DialogType, messageRecordId: MatrxRecordId) => {
        setDialogType(type);
        setActiveEditorId(messageRecordId);
        setDialogOpen(true);
    };

    return (
        <div className="h-full relative">
            <Group id="messages-panel-group" orientation="vertical" className="h-full" groupRef={panelGroupRef}>
                {messages.length > 0 ? (
                    <>
                        {/* Sort messages by their order property */}
                        {[...messages]
                            .sort((a, b) => a.order - b.order)
                            .map((message, index, sortedArray) => {
                                const isLastPanel = index === sortedArray.length - 1;
                                const remainingSize = 100 - (sortedArray.length - 1) * 10;
                                const isCollapsed = collapsedPanels.has(message.matrxRecordId);

                                // Create a stable key using order and ID
                                const panelKey = `${message.order}-${message.id}`;

                                return (
                                    <React.Fragment key={panelKey}>
                                        <Panel
                                            panelRef={(ref: PanelImperativeHandle | null) => registerPanelRef(message.matrxRecordId, ref)}
                                            id={message.matrxRecordId}
                                            defaultSize={isLastPanel ? remainingSize : 10}
                                            minSize={30}
                                            maxSize={100}
                                            collapsible={true}
                                            collapsedSize={3}
                                        >
                                            <MessageEditor
                                                messageRecordId={message.matrxRecordId}
                                                message={message}
                                                deleteMessage={deleteMessage}
                                                isCollapsed={isCollapsed}
                                                onToggleEditor={() => toggleEditor(message.matrxRecordId)}
                                                onDragDrop={handleDragDrop}
                                                registerComponentSave={registerComponentSave}
                                            />
                                        </Panel>
                                        {!isLastPanel && <Separator />}
                                    </React.Fragment>
                                );
                            })}
                        <Button variant="ghost" className="w-full mt-2" onClick={addNewSection}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add {messages[messages.length - 1]?.role === "user" ? "Assistant" : "User"} Message
                        </Button>
                    </>
                ) : (
                    <Panel defaultSize={100}>
                        <EmptyMessagesCard
                            onSuccess={() => {
                                // The hook will handle the message addition
                            }}
                            onError={(error) => {
                                console.error("Error adding template messages:", error);
                            }}
                            disabled={isLoading}
                        />
                    </Panel>
                )}
            </Group>
            <ConfirmationDialog open={dialogOpen} onOpenChange={setDialogOpen} onConfirm={handleDialogConfirm} type={dialogType} />
        </div>
    );
}

export default MessagesContainer;
