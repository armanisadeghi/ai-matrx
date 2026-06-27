import { useOneRelationship } from "@/lib/redux/entity/hooks/useOneRelationship";
import { MatrxRecordId } from "@/types/records";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Conversation, Message, MessageRole } from "@/types/chat/chat.types";
import { useCreateConvoAndMessage } from "@/app/entities/hooks/crud/by-relationships/useCreateConvoAndMessage";
import { extractErrorMessage } from "@/utils/errors";
import {
    NEW_CONVERSATION_ID,
    CHAT_RELATIONSHIP_BASE_CONFIG,
    CHAT_CREATE_BASE_CONFIG,
    NEW_CHAT_PARAMS,
    DEFAULT_GPT_MODEL_ID,
} from "@/constants/chat";

const DEBUG = true;
const VERBOSE = true;

type MessageWithKey = Message & { matrxRecordId: MatrxRecordId };

export interface CombinedSaveChatResult {
    success: boolean;
    conversationId?: string;
    conversationRecordKey?: MatrxRecordId;
    messageId?: string;
    messageRecordKey?: MatrxRecordId;
    conversation?: Conversation;
    message?: Message;
    error?: Error;
}

export function useNewConversation() {
    const relationshipHook = useOneRelationship(CHAT_RELATIONSHIP_BASE_CONFIG);

    const { conversationCrud, messageCrud, createConversationAndMessage, saveConversationAndMessage } =
        useCreateConvoAndMessage(CHAT_CREATE_BASE_CONFIG);

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(true);
    const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
    const [chatMessages, setChatMessages] = useState<MessageWithKey[]>([]);
    const [newMessageId, setNewMessageId] = useState<string | null>(null);

    const createNewConversation = useCallback(async () => {
        const { conversationId, messageId } = createConversationAndMessage(NEW_CHAT_PARAMS);
        relationshipHook.setActiveParent(`new-record-${conversationId}`);
        setIsChatLoading(false);
        setNewMessageId(messageId);
        setConversationId(conversationId);

        return { conversationId, messageId };
    }, [createConversationAndMessage]);

    useEffect(() => {
        createNewConversation();
    }, []);

    const saveNewConversation = useCallback(async (): Promise<CombinedSaveChatResult> => {
        try {
            const result = await saveConversationAndMessage();

            if (result.conversationSuccess && result.messageSuccess) {
                setConversationId(result.conversationId);
                setIsChatLoading(true);
                setNewMessageId(null);

                return {
                    success: true,
                    conversationId: result.conversationId,
                    conversationRecordKey: result.conversationRecordKey,
                    messageId: result.messageId,
                    messageRecordKey: result.messageRecordKey,
                    conversation: result.conversation,
                    message: result.message,
                    error: result.error,
                };
            }

            return {
                success: false,
                error: result.error || new Error("Failed to save conversation or message"),
            };
        } catch (error) {
            console.error("Error saving new conversation:", error);
            return {
                success: false,
                error: error instanceof Error ? error : new Error(extractErrorMessage(error)),
            };
        }
    }, [saveConversationAndMessage]);

    const newMessage = useMemo(() => {
        return messageCrud.message;
    }, [messageCrud.message]);

    return {
        isChatLoading,
        activeConversation,
        conversationId,
        chatMessages,
        newMessageId,
        saveNewConversation,
        newMessage,
        conversationCrud,
        messageCrud,
    };
}
