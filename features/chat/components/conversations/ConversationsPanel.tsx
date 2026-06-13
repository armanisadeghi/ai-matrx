// features\chat\components\conversations\ConversationsPanel.tsx

import React from "react";
import {
  Search,
  PenSquare,
  Maximize2,
  Minimize2,
  Edit,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { useConversationPanel } from "@/features/chat/hooks/useConversationPanel";
import ResponseColumn from "@/features/chat/components/response/ResponseColumn";

export const ConversationsPanel: React.FC = () => {
  const {
    // State
    expanded,
    setExpanded,
    contentSearch,
    setContentSearch,
    labelSearch,
    setLabelSearch,
    selectedConversation,
    showContextMenu,
    contextMenuPosition,
    contextMenuConversationId,
    contextMenuRef,

    // Data
    groupedConversations,

    // Actions
    handleSelectConversation,
    handlePreviewConversation,
    handleContextMenu,
    handleEdit,
    handleDelete,
    handleCreateNewChat,
    formatRelativeTime,
    handleLoadMore,
    isLoadingMore,
    hasMoreConversations,
  } = useConversationPanel();

  return (
    <div
      className={clsx(
        "flex flex-col border-r border-border bg-white dark:bg-gray-950 transition-all duration-300 ease-in-out",
        expanded ? "w-96" : "w-72",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Conversations
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label={expanded ? "Collapse panel" : "Expand panel"}
          >
            {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      {/* Search Section */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
          <input
            type="text"
            placeholder="Search for labels"
            value={labelSearch}
            onChange={(e) => setLabelSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
          />
        </div>
        {expanded && (
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder="Search in content"
              value={contentSearch}
              onChange={(e) => setContentSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
            />
          </div>
        )}

        {/* Create New Chat Button */}
        <button
          onClick={handleCreateNewChat}
          className="flex items-center w-full px-4 py-2.5 rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white transition-colors duration-200"
        >
          <PenSquare size={18} className="mr-2" />
          Create New Chat
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-grow overflow-y-auto">
        {Object.entries(groupedConversations).map(
          ([section, conversations]) => (
            <div key={section} className="mb-4">
              <div className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                {section}
              </div>
              <div>
                {conversations.map((convo) => {
                  const isCurrent = selectedConversation === convo.id;
                  // Only use updatedAt for consistency with grouping logic.
                  // Pass the raw string so the formatter's naive-UTC handling
                  // applies (`conversation.updated_at` has no zone).
                  const date = convo.updatedAt || null;

                  return (
                    <div
                      key={convo.id}
                      onClick={() => {
                        // On click, fetch messages and update the UI
                        handlePreviewConversation(convo.id);
                        // If double-clicked or some other condition, navigate
                        // For now, we'll use single click for both preview and navigation
                        handleSelectConversation(convo.id);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, convo.id)}
                      className={clsx(
                        "px-4 py-3 cursor-pointer transition-colors duration-200",
                        isCurrent
                          ? "bg-gray-100 dark:bg-gray-800 border-r-4 border-blue-500 dark:border-blue-600"
                          : "hover:bg-gray-50 dark:hover:bg-gray-900",
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {convo.label || "Untitled Conversation"}
                          </h3>
                          {expanded && (
                            <div className="w-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-8 z-1">
                              <ResponseColumn />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                          {date ? formatRelativeTime(date) : "No date"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
        )}

        {/* Load More Button */}
        {hasMoreConversations && (
          <div className="p-4">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300 rounded-md transition-colors duration-200 text-sm font-medium"
            >
              {isLoadingMore ? "Loading..." : "Load More Conversations"}
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: "fixed",
            top: `${contextMenuPosition.y}px`,
            left: `${contextMenuPosition.x}px`,
            zIndex: 50,
          }}
          className="bg-textured shadow-lg rounded-md p-1 border-border"
        >
          <button
            onClick={() =>
              contextMenuConversationId && handleEdit(contextMenuConversationId)
            }
            className="flex items-center w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <Edit size={16} className="mr-2" />
            Edit
          </button>
          <button
            onClick={() =>
              contextMenuConversationId &&
              handleDelete(contextMenuConversationId)
            }
            className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <Trash2 size={16} className="mr-2" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

// Main component that includes the conversation panel and preview
const ConversationsWithPreview: React.FC = () => {
  return (
    <div className="flex h-dvh">
      <ConversationsPanel />

      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
            Select a conversation
          </h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            or start a new one
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConversationsWithPreview;
