import { useCallback } from "react";
import { MatrxRecordId } from "@/types/records";
import { MessageTemplateProcessed } from "@/types/AutomationSchemaTypes";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useEntityTools } from "@/lib/redux/entity/hooks/coreHooks";
import type { AppDispatch } from "@/lib/redux/store";

// Single thunk for handling all message reordering
export const useNewMessageReordering = (
  messages: MessageTemplateProcessed[],
  onComplete?: () => void,
) => {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { actions, selectors } = useEntityTools("recipeMessage");

  const updateMessageOrder = useCallback(
    (newOrderedMessages: MessageTemplateProcessed[]) => {
      return (dispatch: AppDispatch) => {
        const state = store.getState();

        // Update all recipeMessage records with their new order positions (starting from 1)
        newOrderedMessages.forEach((message, index) => {
          // Find the recipeMessage record where messageId matches message.id
          const recipeMessageKeys = selectors.selectRecordKeysByFieldValue(
            state,
            "messageId",
            message.id,
          );

          if (recipeMessageKeys.length === 0) {
            return;
          }

          const recipeMessageId = recipeMessageKeys[0]; // Take the first (and only) match
          const newOrder = index + 1;
          const payload = {
            matrxRecordId: recipeMessageId,
            data: { order: newOrder },
          };

          dispatch(actions.directUpdateRecord(payload));
        });
      };
    },
    [dispatch, actions, selectors, store, messages],
  );

  // Handle drag and drop reordering
  const handleDragDrop = useCallback(
    (draggedId: MatrxRecordId, dropTargetId: MatrxRecordId) => {
      const draggedIndex = messages.findIndex(
        (msg) => msg.matrxRecordId === draggedId,
      );
      const dropTargetIndex = messages.findIndex(
        (msg) => msg.matrxRecordId === dropTargetId,
      );

      if (draggedIndex === -1 || dropTargetIndex === -1) {
        return;
      }

      // Create a new array with the updated order
      const newMessages = [...messages];
      const [draggedMessage] = newMessages.splice(draggedIndex, 1);
      newMessages.splice(dropTargetIndex, 0, draggedMessage);

      // Dispatch the thunk with the new complete order
      dispatch(updateMessageOrder(newMessages));

      // Call onComplete to trigger UI reprocessing
      onComplete?.();
    },
    [messages, dispatch, updateMessageOrder, onComplete],
  );

  return {
    handleDragDrop,
    updateMessageOrder, // Export this if you need manual ordering control elsewhere
  };
};
