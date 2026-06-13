import React, { useState, useRef, useEffect } from "react";
import { Search, PenSquare, X, Menu, Edit, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useConversationPanel } from "@/features/chat/hooks/useConversationPanel";
import ResponseColumn from "@/features/chat/components/response/ResponseColumn";

export const MobileConversationsPanel: React.FC = () => {
  const {
    // State
    contentSearch,
    setContentSearch,
    labelSearch,
    setLabelSearch,
    selectedConversation,

    // Data
    groupedConversations,

    // Actions
    handleSelectConversation,
    handlePreviewConversation,
    handleCreateNewChat,
    formatRelativeTime,
  } = useConversationPanel();

  // Mobile-specific state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar after selecting conversation
  const handleMobileSelect = (convoId: string) => {
    handlePreviewConversation(convoId);
    handleSelectConversation(convoId);
    setSidebarOpen(false);
  };

  // Mobile sidebar component
  const MobileSidebar = () => (
    <div
      className={clsx(
        "fixed inset-0 z-50 lg:hidden",
        sidebarOpen ? "block" : "hidden",
      )}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50"
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar content */}
      <div className="fixed inset-y-0 left-0 w-full max-w-xs bg-white dark:bg-gray-950 shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Conversations
          </h2>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={20} />
          </button>
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

          {/* Create New Chat Button */}
          <button
            onClick={() => {
              handleCreateNewChat();
              setSidebarOpen(false);
            }}
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
                    // Raw string (not pre-built Date) so the formatter's
                    // naive-UTC handling applies — see UnifiedConversationsUI.
                    const date = convo.updatedAt || convo.createdAt;

                    return (
                      <div
                        key={convo.id}
                        onClick={() => handleMobileSelect(convo.id)}
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
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                              {/* Placeholder for message preview */}
                              Start a new conversation
                              {/* {convo.metadata?.lastMessage || 'Start a new conversation'} */}
                            </p>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ml-2">
                            {formatRelativeTime(date)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh">
      {/* Mobile header */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-white dark:bg-gray-950">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Open conversation list"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {selectedConversation
            ? groupedConversations.Today?.find(
                (c) => c.id === selectedConversation,
              )?.label ||
              groupedConversations.Yesterday?.find(
                (c) => c.id === selectedConversation,
              )?.label ||
              groupedConversations["This Week"]?.find(
                (c) => c.id === selectedConversation,
              )?.label ||
              groupedConversations.Earlier?.find(
                (c) => c.id === selectedConversation,
              )?.label ||
              "Chat"
            : "Conversations"}
        </h1>
        <button
          onClick={handleCreateNewChat}
          className="p-1.5 rounded-md text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Create new chat"
        >
          <PenSquare size={20} />
        </button>
      </header>

      {/* Desktop layout */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Desktop Sidebar - This uses our existing ConversationsPanel component */}
        <div className="w-80 border-r border-border bg-white dark:bg-gray-950 flex flex-col">
          {/* Import the DesktopConversationsPanel here */}
          {/* <DesktopConversationsPanel /> */}
          {/* For now, we'll simplify and just show a placeholder */}
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Conversations
            </h2>
          </div>
          <div className="p-4">
            <p className="text-gray-500 dark:text-gray-400">
              Desktop conversation panel will be rendered here
            </p>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto">
          {selectedConversation ? (
            <div className="h-full">
              {/* Response column for desktop view */}
              <ResponseColumn />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">
                  Select a conversation
                </h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">
                  or start a new one
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile conversation list sidebar */}
      <MobileSidebar />

      {/* Mobile content view - only shows when a conversation is selected */}
      <div className="lg:hidden flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto">
        {selectedConversation ? (
          <div className="h-full">
            {/* Response column for mobile view */}
            <ResponseColumn />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 text-center">
              Select a conversation or create a new one
            </h2>
            <button
              onClick={() => setSidebarOpen(true)}
              className="mt-4 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white transition-colors duration-200"
            >
              View Conversations
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Unified component that handles both desktop and mobile layouts
export const ResponsiveConversationsUI: React.FC = () => {
  return <MobileConversationsPanel />;
};

export default ResponsiveConversationsUI;
