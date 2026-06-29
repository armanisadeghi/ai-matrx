"use client";

import React, { useState, useEffect } from "react";
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/slices/userSlice";
import { selectMessageActionInstance } from "@/features/agents/redux/execution-system/message-actions/message-actions.slice";
import { selectMessageHasUnsavedChanges } from "../../_legacy-stubs";
import { useCartesiaSpeaker } from "@/features/tts/hooks/useCartesiaSpeaker";
import { READ_ALOUD_DICTIONARY_SURFACE } from "@/features/dictionary/constants";
import {
  getMessageActions,
  resumePendingAuthAction,
} from "../../actions/messageActionRegistry";

export interface MessageOptionsMenuProps {
  isOpen: boolean;
  instanceId: string;
  onClose: () => void;
  anchorElement?: HTMLElement | null;
  showFullPrint?: boolean;
  onFullPrint?: () => void;
  isCapturing?: boolean;
}

const MessageOptionsMenu: React.FC<MessageOptionsMenuProps> = ({
  isOpen,
  instanceId,
  onClose,
  anchorElement,
  showFullPrint = false,
  onFullPrint,
  isCapturing,
}) => {
  const dispatch = useAppDispatch();
  const instance = useAppSelector((state) =>
    selectMessageActionInstance(state, instanceId),
  );
  const user = useAppSelector(selectUser);
  const isAuthenticated = !!user?.email;
  const [isBrowserTtsPlaying, setIsBrowserTtsPlaying] = useState(false);

  const hasUnsavedChanges = useAppSelector((state) =>
    instance?.sessionId && instance?.messageId
      ? selectMessageHasUnsavedChanges(
          state,
          instance.sessionId,
          instance.messageId,
        )
      : false,
  );
  // Lazy TTS hook — does nothing until speak() is called (no eager token fetch)
  const {
    speak: cartesiaSpeak,
    isLoading: isTtsGenerating,
    isPlaying: isTtsPlaying,
  } = useCartesiaSpeaker({ processMarkdown: true, dictionarySurfaceKey: READ_ALOUD_DICTIONARY_SURFACE });

  useEffect(() => {
    if (instance) {
      resumePendingAuthAction(isAuthenticated, instance.content, dispatch);
    }
  }, [isAuthenticated, instance?.content, dispatch]);

  if (!instance) return null;

  const menuItems = getMessageActions({
    instanceId,
    content: instance.content,
    isAuthenticated,
    sessionId: instance.sessionId,
    messageId: instance.messageId,
    conversationId: instance.conversationId,
    rawContent: instance.rawContent,
    metadata: instance.metadata,
    hasUnsavedChanges,
    dispatch,
    onClose,
    showFullPrint,
    onFullPrint,
    isCapturing,
    ttsState: {
      isTtsGenerating,
      isTtsPlaying,
      isBrowserTtsPlaying,
      cartesiaSpeak,
      setBrowserTtsPlaying: setIsBrowserTtsPlaying,
    },
  });

  return (
    <AdvancedMenu
      isOpen={isOpen}
      onClose={onClose}
      items={menuItems}
      title="Message Options"
      position="bottom-left"
      anchorElement={anchorElement}
    />
  );
};

export default MessageOptionsMenu;
