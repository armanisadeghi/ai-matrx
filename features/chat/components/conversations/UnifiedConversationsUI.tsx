// features\chat\components\conversations\UnifiedConversationsUI.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, PenSquare, Maximize2, Minimize2, Menu, X, ArrowLeft } from 'lucide-react';
import clsx from 'clsx';
import { useConversationPanel } from '@/features/chat/hooks/useConversationPanel';
import { ConversationContextMenu, useContextMenu } from './ConversationContextMenu';
import ResponseColumn from '@/features/chat/components/response/ResponseColumn';
import { getChatActionsWithThunks } from '@/lib/redux/entity/custom-actions/chatActions';
import { useAppDispatch } from "@/lib/redux/hooks";

/**
 * Unified Conversations UI that handles both desktop and mobile layouts
 */
export const UnifiedConversationsUI: React.FC = () => {

    const dispatch = useAppDispatch();
    const chatActions = getChatActionsWithThunks();

    useEffect(() => {
        dispatch(chatActions.initialize());
    }, []);


    const {
    expanded,
    setExpanded,
    contentSearch,
    setContentSearch,
    labelSearch,
    setLabelSearch,
    selectedConversation,
    groupedConversations,
    handleSelectConversation,
    handlePreviewConversation,
    handleCoordinatedFetch,
    handleCreateNewChat,
    formatRelativeTime
  } = useConversationPanel();

  // Context menu state using our custom hook
  const contextMenu = useContextMenu();

  // Mobile-specific state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  // Check if we're on mobile on mount and when window resizes
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 1024); // 1024px is the 'lg' breakpoint in Tailwind
    };
    
    // Initial check
    checkIfMobile();
    
    // Check on resize
    window.addEventListener('resize', checkIfMobile);
    
    return () => {
      window.removeEventListener('resize', checkIfMobile);
    };
  }, []);

  // Handle opening the context menu
  const handleContextMenu = (e: React.MouseEvent, convoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.handleOpen(e, convoId);
  };

  // Handle editing a conversation (e.g., renaming)
  const handleEdit = (id: string) => {
    // Implement your edit logic here
    console.log(`Editing conversation: ${id}`);
    // For example, open a modal to rename the conversation
  };

  // Handle deleting a conversation
  const handleDelete = (id: string) => {
    // Implement your delete logic here
    console.log(`Deleting conversation: ${id}`);
    // You might want to add a confirmation step
  };

  // Select a conversation on mobile and close the sidebar
  const handleMobileSelect = (convoId: string) => {
    handleCoordinatedFetch(convoId);
    handleSelectConversation(convoId);
    setSidebarOpen(false);
  };

  // Get the title of the currently selected conversation
  const getSelectedConversationTitle = () => {
    if (!selectedConversation) return 'Conversations';
    
    for (const section of Object.keys(groupedConversations)) {
      const convo = groupedConversations[section]?.find(c => c.id === selectedConversation);
      if (convo) return convo.label || 'Untitled Conversation';
    }
    
    return 'Chat';
  };

  // Render the conversation list (used in both mobile and desktop)
  const renderConversationList = (mobile: boolean = false) => (
    <>
      {Object.entries(groupedConversations).map(([section, conversations]) => (
        <div key={section} className="mb-4">
          <div className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            {section}
          </div>
          <div>
            {conversations.map((convo) => {
              const isCurrent = selectedConversation === convo.id;
              const date = new Date(convo.updatedAt || convo.createdAt);
              
              return (
                <div
                  key={convo.id}
                  onClick={() => mobile ? handleMobileSelect(convo.id) : handleSelectConversation(convo.id)}
                  onContextMenu={(e) => handleContextMenu(e, convo.id)}
                  className={clsx(
                    "px-4 py-3 cursor-pointer transition-colors duration-200",
                    isCurrent 
                      ? "bg-gray-100 dark:bg-gray-800 border-r-4 border-blue-500 dark:border-blue-600" 
                      : "hover:bg-gray-50 dark:hover:bg-gray-900"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {convo.label || 'Untitled Conversation'}
                      </h3>
                      {(expanded || mobile) && (
                        <div className="w-full overflow-y-auto overflow-x-hidden scrollbar-hide pb-8 z-1">
                          {isCurrent && !mobile && <ResponseColumn />}
                          {!isCurrent && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
                              {/* Placeholder for message preview */}
                              Start a new conversation
                              {/* {convo.metadata?.lastMessage || 'Start a new conversation'} */}
                            </p>
                          )}
                        </div>
                      )}
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
      ))}
    </>
  );

  // Mobile sidebar component
  const MobileSidebar = () => (
    <div 
      className={clsx(
        "fixed inset-0 z-50 lg:hidden",
        sidebarOpen ? "block" : "hidden"
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversations</h2>
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
          {renderConversationList(true)}
        </div>
      </div>
    </div>
  );

  // Desktop sidebar component
  const DesktopSidebar = () => (
    <div
      className={clsx(
        "flex-none flex flex-col border-r border-border bg-white dark:bg-gray-950 transition-all duration-300 ease-in-out",
        expanded ? "w-96" : "w-72"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversations</h2>
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
        {renderConversationList()}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh">
      {/* Mobile header - only visible on small screens */}
      <header className="lg:hidden flex items-center justify-between p-4 border-b border-border bg-white dark:bg-gray-950">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Open conversation list"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {getSelectedConversationTitle()}
        </h1>
        <button
          onClick={handleCreateNewChat}
          className="p-1.5 rounded-md text-blue-600 hover:text-blue-700 dark:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Create new chat"
        >
          <PenSquare size={20} />
        </button>
      </header>
      
      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar - hidden on mobile */}
        <div className="hidden lg:block">
          <DesktopSidebar />
        </div>
        
        {/* Main content */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto">
          {selectedConversation ? (
            <div className="h-full">
              {/* Response column */}
              <ResponseColumn />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">Select a conversation</h2>
                <p className="mt-2 text-gray-500 dark:text-gray-400">or start a new one</p>
                {isMobile && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="mt-4 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white transition-colors duration-200"
                  >
                    View Conversations
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Mobile sidebar */}
      <MobileSidebar />
      
      {/* Context Menu */}
      <ConversationContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        conversationId={contextMenu.targetId}
        onClose={contextMenu.handleClose}
        onEdit={handleEdit}
        onDelete={handleDelete}
        menuRef={contextMenu.menuRef}
      />
    </div>
  );
};

export default UnifiedConversationsUI;