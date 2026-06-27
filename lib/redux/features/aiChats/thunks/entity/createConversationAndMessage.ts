// @ts-nocheck

import { v4 as uuidv4 } from "uuid";
import { DEFAULT_CONVERSATION, DEFAULT_FIRST_MESSAGE } from "@/constants/chat";
import { Conversation, Message } from "@/types/chat/chat.types";
import { getEntitySlice } from "@/lib/redux/entity/entitySlice";
import { createAppThunk } from "@/lib/redux/utils";
import { EntityKeys } from "@/types/entityTypes";
import { MatrxRecordId } from "@/types/records";
import { saveRecordsInOrder } from "@/lib/redux/entity/thunks/createRecordThunk";
import { setTaskFields } from "@/lib/redux/socket-io/slices/socketTasksSlice";
import { submitTask } from "@/lib/redux/socket-io/thunks/submitTaskThunk";

const INFO = true;
const DEBUG = false;
const VERBOSE = false;

interface CreateConversationAndMessagePayload {
  conversationOverrides?: Partial<Conversation>;
  messageOverrides?: Partial<Message>;
  messageContent?: string;
}

interface CreateConversationAndMessageResult {
  conversationId: string;
  messageId: string;
  conversationRecordKey: string;
  messageRecordKey: string;
}

export const createConversationAndMessage = createAppThunk<
  CreateConversationAndMessageResult,
  CreateConversationAndMessagePayload,
  { rejectValue: string }
>(
  "chat/createConversationAndMessage",
  async (
    { conversationOverrides = {}, messageOverrides = {}, messageContent = "" },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const conversationId = uuidv4();
      const conversationRecordKey = `id:${conversationId}`;
      const conversationTempKey = `new-record-${conversationId}`;

      const messageId = uuidv4();
      const messageRecordKey = `id:${messageId}`;
      const messageTempKey = `new-record-${messageId}`;

      const conversationInitialData: Partial<Conversation> = {
        ...DEFAULT_CONVERSATION,
        id: conversationId,
        ...conversationOverrides,
      };

      const messageInitialData: Partial<Message> = {
        ...DEFAULT_FIRST_MESSAGE,
        id: messageId,
        conversationId: conversationId,
        content: messageContent,
        ...messageOverrides,
      };

      const conversationSlice = getEntitySlice("conversation");
      const messageSlice = getEntitySlice("message");

      dispatch(
        conversationSlice.actions.startRecordCreationWithData({
          tempId: conversationTempKey,
          initialData: conversationInitialData,
        }),
      );

      dispatch(
        messageSlice.actions.startRecordCreationWithData({
          tempId: messageTempKey,
          initialData: messageInitialData,
        }),
      );

      dispatch(conversationSlice.actions.setActiveRecord(conversationTempKey));
      dispatch(messageSlice.actions.setActiveRecord(messageTempKey));
      dispatch(messageSlice.actions.setActiveParentId(conversationId));
      dispatch(
        messageSlice.actions.addRuntimeFilter({
          field: "conversationId",
          operator: "eq",
          value: conversationId,
        }),
      );

      return {
        conversationId,
        messageId,
        conversationTempKey,
        messageTempKey,
        conversationRecordKey,
        messageRecordKey,
      };
    } catch (error) {
      return rejectWithValue(
        error instanceof Error
          ? error.message
          : "Failed to create conversation and message",
      );
    }
  },
);

interface SaveConversationAndMessagePayload {
  conversationTempId: MatrxRecordId;
  messageTempId: MatrxRecordId;
  taskId: string;
}

interface SaveConversationAndMessageResult {
  success: boolean;
  conversationData: {
    tempRecordId: string;
    recordKey: string;
    data: any;
  };
  messageData: {
    tempRecordId: string;
    recordKey: string;
    data: any;
  };
}

export const saveConversationAndMessage = createAppThunk<
  SaveConversationAndMessageResult,
  SaveConversationAndMessagePayload,
  { rejectValue: string }
>(
  "chat/saveConversationAndMessage",
  async (
    { conversationTempId, messageTempId, taskId },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const messageSlice = getEntitySlice("message");
      const conversationSlice = getEntitySlice("conversation");
      const payloads = [
        {
          entityKey: "conversation" as EntityKeys,
          matrxRecordId: conversationTempId,
        },
        { entityKey: "message" as EntityKeys, matrxRecordId: messageTempId },
      ];
      dispatch(
        messageSlice.actions.updateNestedFieldSmart({
          keyOrId: messageTempId,
          field: "metadata",
          nestedKey: "status",
          value: "processing",
        }),
      );

      const results = await dispatch(saveRecordsInOrder(payloads)).unwrap();

      if (DEBUG)
        console.log(
          "\x1b[34m[SAVE_CONVERSATION_AND_MESSAGE] Results:\x1b[0m",
          JSON.stringify(results, null, 2),
        );

      const [conversationResult, messageResult] = results;

      dispatch(
        conversationSlice.actions.updateCustomDataSmart({
          keyOrId: conversationResult.data.data.id,
          customData: {
            nextDisplayOrderToUse: messageResult.data.data.displayOrder + 2,
            nextSystemOrderToUse: messageResult.data.data.systemOrder + 2,
            isNewChat: false,
          },
        }),
      );

      if (!taskId) {
        console.error("SAVE_CONVERSATION_AND_MESSAGE: No taskId provided");
        return rejectWithValue("No taskId provided");
      }

      dispatch(
        setTaskFields({
          taskId,
          fields: {
            conversation_id: conversationResult.data.data.id,
            message_object: messageResult.data.data,
          },
        }),
      );

      dispatch(submitTask({ taskId }));

      if (DEBUG)
        console.log(
          "SAVE_CONVERSATION_AND_MESSAGE: Set task fields with taskId:",
          taskId,
          "conversation_id:",
          conversationResult.data.data.id,
          "message_object:",
          messageResult.data.data,
        );

      const returnValue = {
        success: true,
        conversationData: conversationResult.data,
        messageData: messageResult.data,
      };
      return returnValue;
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Failed to save conversation and message";
      console.error("SAVE_CONVERSATION_AND_MESSAGE: Error:", errorMsg);
      return rejectWithValue(errorMsg);
    }
  },
);
