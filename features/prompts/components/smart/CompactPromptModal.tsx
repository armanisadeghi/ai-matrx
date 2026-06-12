"use client";
import React, { useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import {
  selectInstance,
  selectIsExecuting,
  selectIsLastMessageUser,
  selectCurrentInput,
} from '@/lib/redux/prompt-execution/selectors';
import { executeMessage } from '@/lib/redux/prompt-execution/thunks/executeMessageThunk';
import { CompactPromptInput } from './CompactPromptInput';

interface CompactPromptModalProps {
  /** Control modal visibility */
  isOpen: boolean;
  onClose: () => void;
  
  /**
   * The runId of the execution instance
   * Required for Redux integration
   */
  runId?: string;
  
  /** Optional callbacks */
  onSubmit?: () => void; // Called after successful submission
  
  /**
   * Mode of operation
   * - 'execute': Execute the prompt and call onSubmit (default, standalone mode)
   * - 'input-only': Only collect input and call onSubmit (used in pre-execution flow)
   */
  mode?: 'execute' | 'input-only';
  
  /** CompactPromptInput props */
  placeholder?: string;
  uploadBucket?: string;
  uploadPath?: string;
  enablePasteImages?: boolean;
}

/**
 * CompactPromptModal - Modal wrapper for CompactPromptInput
 * 
 * Provides a complete modal dialog with:
 * - Header with prompt title
 * - Compact prompt input with variables and resources
 * - Inline execute button
 * - Redux-driven execution
 * 
 * Supports two modes:
 * - 'execute' (default): Executes prompt directly on submit (standalone usage)
 * - 'input-only': Only collects input, parent handles execution (pre-execution flow)
 * 
 * Ideal for inline AI triggers from context menus, toolbars, etc.
 */
export function CompactPromptModal({
  isOpen,
  onClose,
  runId,
  onSubmit,
  mode = 'execute',
  placeholder,
  uploadBucket,
  uploadPath,
  enablePasteImages,
}: CompactPromptModalProps) {
  const dispatch = useAppDispatch();

  // Redux state
  const instance = useAppSelector(state => runId ? selectInstance(state, runId) : null);
  const isExecuting = useAppSelector(state => runId ? selectIsExecuting(state, runId) : false);
  const isLastMessageUser = useAppSelector(state => runId ? selectIsLastMessageUser(state, runId) : false);
  const chatInput = useAppSelector(state => runId ? selectCurrentInput(state, runId) : '');
  
  const promptName = instance?.promptName || 'Configure Options';

  // Determine if submit should be disabled
  const isSendDisabled = !runId || isExecuting || (!isLastMessageUser && !chatInput.trim());

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!runId || isSendDisabled) return;

    // In 'input-only' mode, just call onSubmit and let parent handle execution
    if (mode === 'input-only') {
      onSubmit?.();
      return;
    }

    // In 'execute' mode (default), execute the prompt directly
    try {
      await dispatch(executeMessage({
        runId,
        userInput: chatInput,
      })).unwrap();

      // Call optional onSubmit callback
      onSubmit?.();
      
      // Close modal on successful submission
      // Note: You may want to keep it open to show results in some cases
      // onClose();
    } catch (error) {
      console.error('Failed to execute prompt:', error);
      // Toast error is handled by the thunk
    }
  }, [runId, chatInput, isSendDisabled, dispatch, onSubmit, mode]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 gap-0 max-h-[calc(100dvh-4rem)] overflow-hidden">
        {/* Header with prompt name */}
        <div className="h-10 flex-shrink-0 flex items-center px-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold truncate">{promptName}</DialogTitle>
        </div>
        
        {/* Scrollable content area - minimal padding */}
        <div className="overflow-y-auto scrollbar-thin px-3 pb-3">
          <CompactPromptInput
            runId={runId}
            placeholder={placeholder}
            uploadBucket={uploadBucket}
            uploadPath={uploadPath}
            enablePasteImages={enablePasteImages}
            onSubmit={handleSubmit}
            isExecuting={isExecuting}
            isSendDisabled={isSendDisabled}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

