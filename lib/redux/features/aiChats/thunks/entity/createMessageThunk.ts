// @ts-nocheck

import { v4 as uuidv4 } from "uuid";
import { DEFAULT_NEW_MESSAGE } from "@/constants/chat";
import { Message } from "@/types/chat/chat.types";
import { getEntitySlice } from "@/lib/redux/entity/entitySlice";
import { createAppThunk } from "@/lib/redux/utils";
import { EntityKeys } from "@/types/entityTypes";
import { MatrxRecordId } from "@/types/records";
import { ConversationData } from "@/types/AutomationSchemaTypes";
import {
  SaveCallbackResult,
  saveUnsavedRecord,
} from "@/lib/redux/entity/thunks/createRecordThunk";
import { callbackManager } from "@/utils/callbackManager";
import {
  CHAT_DEFAULT_MESSAGE_RUNTIME_FILTERS,
  CHAT_DEFAULT_MESSAGE_RUNTIME_SORT,
} from "@/lib/redux/entity/custom-actions/chatMessageRuntimeDefaults";

const INFO = true;
const DEBUG = false;
const VERBOSE = false;

interface CreateMessagePayload {
  conversationId: string;
  displayOrder: number;
  systemOrder: number;
  messageOverrides?: Partial<Message>;
  messageContent?: string;
}

interface CreateMessageResult {
  conversationId: string;
  messageId: string;
  messageTempKey: string;
  messageRecordKey: string;
}

export const createMessageForConversation = createAppThunk<
  CreateMessageResult,
  CreateMessagePayload,
  { rejectValue: string }
>(
  "chat/createMessageForConversation",
  async (
    {
      conversationId,
      displayOrder,
      systemOrder,
      messageOverrides = {},
      messageContent = "",
    },
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      const messageId = uuidv4();
      const messageRecordKey = `id:${messageId}`;
      const messageTempKey = `new-record-${messageId}`;

      const messageInitialData: Partial<Message> = {
        ...DEFAULT_NEW_MESSAGE,
        ...messageOverrides,
        id: messageId,
        displayOrder: displayOrder,
        systemOrder: systemOrder,
        conversationId: conversationId,
        content: messageContent,
      };

      const messageSlice = getEntitySlice("message");

      dispatch(
        messageSlice.actions.startRecordCreationWithData({
          tempId: messageTempKey,
          initialData: messageInitialData,
        }),
      );

      if (DEBUG)
        console.log(
          "CREATE MESSAGE FOR CONVERSATION: created Message with temp id",
          messageTempKey,
        );

      dispatch(messageSlice.actions.setActiveParentId(conversationId));

      dispatch(
        messageSlice.actions.setRuntimeFilters([
          ...CHAT_DEFAULT_MESSAGE_RUNTIME_FILTERS,
        ]),
      );
      dispatch(
        messageSlice.actions.setRuntimeSort({
          ...CHAT_DEFAULT_MESSAGE_RUNTIME_SORT,
        }),
      );

      dispatch(
        messageSlice.actions.addRuntimeFilter({
          field: "conversationId",
          operator: "eq",
          value: conversationId,
        }),
      );
      dispatch(messageSlice.actions.setActiveRecord(messageTempKey));

      return {
        conversationId,
        messageId,
        messageTempKey,
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

interface CreateMessageForActiveConversationPayload {
  messageOverrides?: Partial<Message>;
  messageContent?: string;
}

export const createMessageForActiveConversation = createAppThunk<
  CreateMessageResult,
  CreateMessageForActiveConversationPayload,
  { rejectValue: string }
>(
  "chat/createMessageForConversation",
  async (
    { messageOverrides = {}, messageContent = "" },
    { dispatch, getState, rejectWithValue },
  ) => {
    const conversationNextDisplayOrder =
      getState().entities["conversation"].customData?.nextDisplayOrderToUse;
    const conversationNextSystemOrder =
      getState().entities["conversation"].customData?.nextSystemOrderToUse;
    const conversationKey =
      getState().entities["conversation"].selection.activeRecord;
    const conversation = getState().entities["conversation"].records[
      conversationKey
    ] as ConversationData;
    const conversationId = conversation.id;
    const conversationMetadata = conversation.metadata;

    const allOverrides = {
      ...messageOverrides,
      ...conversationMetadata,
    };

    if (!conversationNextDisplayOrder || !conversationNextSystemOrder) {
      return rejectWithValue(
        "CREATE MESSAGE FOR CONVERSATION THUNK: Conversation record does not have display and system order",
      );
    }

    try {
      const messageId = uuidv4();
      const messageRecordKey = `id:${messageId}`;
      const messageTempKey = `new-record-${messageId}`;

      const messageInitialData: Partial<Message> = {
        ...DEFAULT_NEW_MESSAGE,
        id: messageId,
        displayOrder: conversationNextDisplayOrder as number,
        systemOrder: conversationNextSystemOrder as number,
        conversationId: conversationId,
        content: messageContent,
        ...allOverrides,
      };

      console.log(
        "CREATE MESSAGE FOR ACTIVE CONVERSATION: messageInitialData",
        messageInitialData,
      );

      const messageSlice = getEntitySlice("message");

      dispatch(
        messageSlice.actions.startRecordCreationWithData({
          tempId: messageTempKey,
          initialData: messageInitialData,
        }),
      );

      dispatch(messageSlice.actions.setActiveRecord(messageTempKey));
      dispatch(messageSlice.actions.setActiveParentId(conversationId));
      dispatch(
        messageSlice.actions.setRuntimeFilters([
          ...CHAT_DEFAULT_MESSAGE_RUNTIME_FILTERS,
        ]),
      );
      dispatch(
        messageSlice.actions.setRuntimeSort({
          ...CHAT_DEFAULT_MESSAGE_RUNTIME_SORT,
        }),
      );
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
        messageTempKey,
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

interface SaveMessagePayload {
  messageTempId: MatrxRecordId;
}

export interface SaveMessageResult {
  success: boolean;
  messageData: {
    tempRecordId: string;
    recordKey: string;
    data: any;
  };
}

export const saveMessageThunk = createAppThunk<
  SaveMessageResult,
  SaveMessagePayload,
  { rejectValue: string }
>(
  "chat/saveMessageThunk",
  async ({ messageTempId }, { dispatch, rejectWithValue }) => {
    try {
      // Dispatch the saveUnsavedRecord thunk and get initial result
      if (!messageTempId) {
        return rejectWithValue(
          "SAVE MESSAGE THUNK: Message temp id was not found",
        );
      }

      const initialResult = await dispatch(
        saveUnsavedRecord({
          entityKey: "message" as EntityKeys,
          matrxRecordId: messageTempId,
        }),
      ).unwrap();

      const { callbackId } = initialResult;

      const callbackData: SaveCallbackResult = await new Promise(
        (resolve, reject) => {
          const listener = (data: any) => {
            resolve(data);
          };

          const success = callbackManager.subscribe(callbackId, listener);

          if (!success) {
            const errorMsg = `Failed to subscribe to callback ${callbackId}`;
            console.error(`SAVE_MESSAGE: ${errorMsg}`);
            reject(new Error(errorMsg));
          }
        },
      );

      // Structure the return value matching the interface
      const returnValue = {
        success: true,
        messageData: {
          tempRecordId: messageTempId,
          recordKey: callbackData.result.recordKey, // Assuming callbackData.result has this structure
          data: callbackData.result,
        },
      };

      return returnValue;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Failed to save message";
      console.error("SAVE_MESSAGE: Error:", errorMsg);
      return rejectWithValue(errorMsg);
    }
  },
);
