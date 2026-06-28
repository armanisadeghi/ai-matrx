"use client";

import React, { useState, useEffect, useRef } from "react";
import MessageItem from "@/features/chat/components/response/MessageItem";
import { useAppSelector } from "@/lib/redux/hooks";
import AssistantStream from "@/features/chat/components/response/assistant-message/stream/AssistantStream";
import { createChatSelectors } from "@/lib/redux/entity/custom-selectors/chatSelectors";
import type { RootState } from "@/lib/redux/store";
import { DebugInfo } from "./DebugInfo";
import ErrorCard from "./assistant-message/stream/ErrorCard";

const INFO = false;
const DEBUG = false;
const VERBOSE = false;

const ResponseColumn: React.FC<{ isOverlay?: boolean }> = ({
  isOverlay = false,
}) => {
  const [streamKey, setStreamKey] = useState<string>("stream-0");
  const [autoScrollEnabled, setAutoScrollEnabled] = useState<boolean>(true);

  const chatSelectors = createChatSelectors();
  const taskId = useAppSelector(chatSelectors.taskId);
  const messagesToDisplay = useAppSelector(
    chatSelectors.messageRelationFilteredRecords,
  );
  const messageCount = messagesToDisplay.length;

  const settings = useAppSelector(chatSelectors.activeMessageSettings);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isStreaming = false;
  const isStreamEnded = true;
  const streamError: unknown[] = [];
  const textResponse = "";
  const dataResponse: unknown[] = [];
  const infoResponse: unknown[] = [];
  const errorsResponse: unknown[] = [];
  const isTaskComplete = true;

  const activeMessageStatus = useAppSelector((state: RootState) =>
    chatSelectors.activeMessageStatus(state),
  );
  const shouldShowLoader = useAppSelector((state: RootState) =>
    chatSelectors.shouldShowLoader(state),
  );
  const isDebugMode = useAppSelector((state: RootState) =>
    chatSelectors.isDebugMode(state),
  );

  const isStreamError = streamError !== null;
  const hasUserVisibleMessage =
    streamError &&
    Array.isArray(streamError) &&
    streamError.length > 0 &&
    (streamError[0]?.user_message || streamError[0]?.user_visible_message) !=
      null &&
    (streamError[0]?.user_message || streamError[0]?.user_visible_message)
      ?.length > 5;

  const handleScrollToBottom = () => {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, i * 20);
    }
  };

  useEffect(() => {
    if (messageCount === 0) return;
    const timer = setTimeout(() => {
      const assistantMessages = messagesToDisplay.filter(
        (message) => message.role === "assistant",
      );
      const maxDisplayOrder = Math.max(
        ...assistantMessages.map((message) => message.displayOrder),
        0,
      );
      setStreamKey(`stream-${maxDisplayOrder}`);
    }, 100);
    return () => clearTimeout(timer);
  }, [messageCount, messagesToDisplay]);

  // Handling touch start for mobile users
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    // Function to detect wheel events (mouse scrolling)
    const handleWheel = (e: WheelEvent) => {
      // Detect scroll up (negative deltaY means scrolling up)
      if (e.deltaY < 0) {
        setAutoScrollEnabled(false);
      }
    };

    // Functions to detect touch scrolling for mobile
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartY.current !== null) {
        const touchY = e.touches[0].clientY;
        // If touch moved upward (user is scrolling up)
        if (touchY > touchStartY.current) {
          setAutoScrollEnabled(false);
        }
        touchStartY.current = touchY;
      }
    };

    // Handle key events (arrow up, page up)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Home") {
        setAutoScrollEnabled(false);
      }
    };

    // Add all event listeners
    document.addEventListener("wheel", handleWheel, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      // Remove all event listeners on cleanup
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (autoScrollEnabled) {
      handleScrollToBottom();
    }
  }, [messageCount, autoScrollEnabled]);

  const handleAutoScrollToBottom = (isVisible: boolean) => {
    if (!isStreaming) return;
    if (!isVisible && autoScrollEnabled) {
      handleScrollToBottom();
    }
  };

  // Reset auto-scroll when a new message starts coming in
  useEffect(() => {
    if (isStreaming) {
      setAutoScrollEnabled(true);
    }
  }, [isStreaming]);

  const handleRetry = () => {
    console.log("===> [RESPONSE COLUMN] Retrying");
  };

  const handleClose = () => {
    console.log("===> [RESPONSE COLUMN] Closing");
  };

  useEffect(() => {
    if (DEBUG)
      console.log(
        "===> [RESPONSE LAYOUT MANAGER] Errors response:",
        JSON.stringify(errorsResponse, null, 2),
      );
  }, [errorsResponse]);

  useEffect(() => {
    if (DEBUG)
      console.log(
        "===> [RESPONSE LAYOUT MANAGER] Info response:",
        JSON.stringify(infoResponse, null, 2),
      );
  }, [infoResponse]);

  return (
    <div
      className="w-full min-w-0 pt-2 pb-24 relative overflow-x-hidden"
      ref={containerRef}
    >
      <div className="max-w-3xl mx-auto px-3 md:px-4 space-y-4 overflow-x-hidden min-w-0">
        {messagesToDisplay.map((message) => (
          <MessageItem
            key={message.id}
            taskId={taskId}
            message={message}
            onScrollToBottom={handleScrollToBottom}
            isOverlay={isOverlay}
          />
        ))}
        {isDebugMode && (
          <DebugInfo
            activeMessageStatus={activeMessageStatus}
            shouldShowLoader={shouldShowLoader}
            isStreaming={isStreaming}
            isStreamEnded={isStreamEnded}
            isStreamError={isStreamError}
            streamError={streamError}
            streamKey={streamKey}
            taskId={taskId}
            settings={settings}
          />
        )}
        {/* ALWAYS render AssistantStream - it handles its own visibility */}
        <AssistantStream
          key={streamKey}
          taskId={taskId}
          handleVisibility={handleAutoScrollToBottom}
          scrollToBottom={handleScrollToBottom}
        />
        {hasUserVisibleMessage && (
          <ErrorCard
            message={
              streamError[0].user_message || streamError[0].user_visible_message
            }
            onRetry={handleRetry}
            onClose={handleClose}
          />
        )}

        <div ref={bottomRef} style={{ height: "1px" }} />
      </div>
    </div>
  );
};

export default ResponseColumn;
