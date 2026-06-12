import React, { useState, useEffect, useRef } from "react";
import { Search, X, ArrowRight, Edit, Trash2, MoreVertical } from "lucide-react";
import { BsChevronDoubleRight, BsChevronDoubleLeft } from "react-icons/bs";
import clsx from "clsx";
import { useConversationPanel } from "@/features/chat/hooks/useConversationPanel";
import ResponseColumn from "@/features/chat/components/response/ResponseColumn";
import formatRelativeTime from "../utils/formatRelativeTime";
import ConversationPreviewHeader from "./ConversationPreviewHeader";

interface ConversationSearchOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ConversationSearchOverlay: React.FC<ConversationSearchOverlayProps> = ({ isOpen, onClose }) => {
    const {
        contentSearch,
        setContentSearch,
        labelSearch,
        setLabelSearch,
        groupedConversations,
        handleSelectConversation,
        handlePreviewConversation,
        handleCoordinatedFetch,
        handleContextMenu,
        handleLoadMore,
        isLoadingMore,
        hasMoreConversations,
    } = useConversationPanel();
    // Local state for the overlay
    const [selectedForPreview, setSelectedForPreview] = useState<string | null>(null);
    const [expanded, setExpanded] = useState(true);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [contextMenuConversationId, setContextMenuConversationId] = useState<string | null>(null);
    
    // Refs
    const overlayContainerRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);
    
    // Use a custom close handler that checks if we should prevent closing
    const handleClose = (e?: MouseEvent) => {
        // If we have a click event, check if it's inside the context menu
        if (
            e &&
            ((contextMenuRef.current && contextMenuRef.current.contains(e.target as Node)) ||
                // Also check for click events on context menu buttons or other UI elements that shouldn't close
                (e.target as HTMLElement).closest(".context-menu-trigger") ||
                (e.target as HTMLElement).closest(".prevent-overlay-close"))
        ) {
            return; // Don't close the overlay
        }
        // Only close if event is outside our overlay and not on a context menu
        if (!e || !overlayRef.current || !overlayRef.current.contains(e.target as Node)) {
            onClose();
        }
    };
    
    // Custom click outside hook
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
                // If we're showing the context menu and the click is inside it, don't close
                if (showContextMenu && contextMenuRef.current && contextMenuRef.current.contains(event.target as Node)) {
                    return;
                }
                handleClose(event);
            }
        };
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [isOpen, showContextMenu]);
    
    // Focus the search input when overlay opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);
    
    // Reset state when overlay closes
    useEffect(() => {
        if (!isOpen) {
            setContentSearch("");
            setLabelSearch("");
            setSelectedForPreview(null);
            setShowContextMenu(false);
        }
    }, [isOpen, setContentSearch, setLabelSearch]);
    
    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showContextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowContextMenu(false);
                } else {
                    handleClose();
                }
            }
        };
        if (isOpen) {
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, showContextMenu]);
    
    // Close context menu when clicking outside, but don't close the overlay
    useEffect(() => {
        const handleContextMenuOutside = (event: MouseEvent) => {
            if (
                contextMenuRef.current &&
                !contextMenuRef.current.contains(event.target as Node) &&
                !(event.target as HTMLElement).closest(".context-menu-trigger")
            ) {
                setShowContextMenu(false);
            }
        };
        if (showContextMenu) {
            document.addEventListener("mousedown", handleContextMenuOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleContextMenuOutside);
        };
    }, [showContextMenu]);
    
    // Handle selecting a conversation for preview
    const handlePreview = (convoId: string) => {
        setSelectedForPreview(convoId);
        handleCoordinatedFetch(convoId);
    };
    
    // Handle navigating to a conversation
    const handleNavigate = (convoId: string) => {
        handleSelectConversation(convoId);
        onClose();
    };
    
    // Handle context menu
    const handleLocalContextMenu = (e: React.MouseEvent, convoId: string) => {
        e.preventDefault();
        e.stopPropagation();
        const boundingRect = overlayContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
        // Adjust position relative to the overlay container
        const x = e.clientX;
        const y = e.clientY;
        // Check if the context menu would go off the right edge
        const rightEdgeDistance = window.innerWidth - x;
        const adjustedX = rightEdgeDistance < 200 ? x - (200 - rightEdgeDistance) : x;
        setContextMenuPosition({ x: adjustedX, y });
        setContextMenuConversationId(convoId);
        setShowContextMenu(true);
    };
    
    // Handle updating conversation metadata
    const handleUpdateConversation = (id: string, updates: Partial<any>) => {
        // Implement your update logic here
        console.log(`Updating conversation ${id}:`, updates);
        // This is where you would call your API or update local state
        // For example:
        // updateConversationMetadata(id, updates);
    };
    
    // Handle context menu actions
    const handleEdit = (id: string) => {
        // Select the conversation for preview first if not already selected
        if (selectedForPreview !== id) {
            setSelectedForPreview(id);
            handleCoordinatedFetch(id);
            
            // Wait for the conversation to be loaded and component to be mounted
            setTimeout(() => {
                // Use a custom event to trigger edit mode
                const event = new CustomEvent('edit-conversation-metadata', { detail: { id } });
                document.dispatchEvent(event);
            }, 100);
        } else {
            // If already selected, just trigger edit mode immediately
            const event = new CustomEvent('edit-conversation-metadata', { detail: { id } });
            document.dispatchEvent(event);
        }
        
        setShowContextMenu(false);
    };
    
    const handleDelete = (id: string) => {
        // Implement your delete logic here
        console.log(`Deleting conversation: ${id}`);
        setShowContextMenu(false);
    };
    
    if (!isOpen) return null;
    
    // Calculate if we have any results
    const hasResults = Object.values(groupedConversations).some((group) => group.length > 0);
    
    // Find the selected conversation
    const selectedConversation = selectedForPreview 
        ? Object.values(groupedConversations).flat().find(c => c.id === selectedForPreview) 
        : null;
    
    return (
        <div
            ref={overlayContainerRef}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={(e) => {
                // Only close if clicking the backdrop, not the content
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                ref={overlayRef}
                className="bg-zinc-100 dark:bg-zinc-850 rounded-3xl shadow-xl flex flex-col w-full max-w-7xl h-full max-h-[92dvh] mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()} // Prevent clicks from bubbling to backdrop
            >
                {/* Header with search inputs */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                    <div className="flex-1 flex items-center space-x-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search Labels..."
                                value={labelSearch}
                                onChange={(e) => setLabelSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none border-none"
                            />
                        </div>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Search description and keywords..."
                                value={contentSearch}
                                onChange={(e) => setContentSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:outline-none border-none"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                        <button
                            onClick={() => onClose()}
                            className="p-2 rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 prevent-overlay-close"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
                {/* Main content area */}
                <div className="flex flex-1 overflow-hidden relative">
                    {/* Conversation list */}
                    <div
                        className={clsx(
                            "overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 transition-all duration-300",
                            expanded ? "w-1/2" : "w-1/3"
                        )}
                    >
                        {hasResults ? (
                            Object.entries(groupedConversations).map(([section, conversations]) => {
                                if (conversations.length === 0) return null;
                                return (
                                    <div key={section} className="mb-4">
                                        <div className="px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 sticky top-0 bg-zinc-100 dark:bg-zinc-850 z-10">
                                            {section}
                                        </div>
                                        <div>
                                            {conversations.map((convo) => {
                                                const isPreviewSelected = selectedForPreview === convo.id;
                                                // Only use updatedAt, never fall back to createdAt
                                                const lastUpdated = convo.updatedAt;
                                                return (
                                                    <div
                                                        key={convo.id}
                                                        onClick={() => handlePreview(convo.id)}
                                                        onContextMenu={(e) => handleLocalContextMenu(e, convo.id)}
                                                        className={clsx(
                                                            "px-4 py-3 cursor-pointer transition-colors duration-200 flex justify-between items-start",
                                                            isPreviewSelected
                                                                ? "bg-zinc-100 dark:bg-zinc-800 border-l-4 border-blue-500 dark:border-blue-600"
                                                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                                        )}
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <h3 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                                                {convo.label || "Untitled Conversation"}
                                                            </h3>
                                                            <div className="flex items-center mt-1">
                                                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                                    {formatRelativeTime(lastUpdated)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center space-x-1">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleLocalContextMenu(e, convo.id);
                                                                }}
                                                                className="p-1 rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 prevent-overlay-close context-menu-trigger"
                                                            >
                                                                <MoreVertical size={16} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleNavigate(convo.id);
                                                                }}
                                                                className="p-1 rounded-full text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 prevent-overlay-close"
                                                            >
                                                                <ArrowRight size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex items-center justify-center h-full p-8">
                                <div className="text-center">
                                    <p className="text-lg font-medium text-zinc-700 dark:text-zinc-300">No results found</p>
                                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">Try adjusting your search terms</p>
                                </div>
                            </div>
                        )}
                        
                        {/* Load More Button */}
                        {hasResults && hasMoreConversations && (
                            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                                <button
                                    onClick={handleLoadMore}
                                    disabled={isLoadingMore}
                                    className="w-full py-2 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-700 dark:text-zinc-300 rounded-lg transition-colors duration-200 text-sm font-medium"
                                >
                                    {isLoadingMore ? "Loading..." : "Load More Conversations"}
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Expansion/collapse toggle button positioned at the divider */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="absolute top-1/2 transform -translate-y-1/2 z-20 bg-zinc-100 dark:bg-zinc-850 rounded-full shadow-md p-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 prevent-overlay-close"
                        style={{
                            left: expanded ? "calc(50% - 12px)" : "calc(33.333% - 12px)",
                            transition: "left 0.3s ease-in-out",
                        }}
                        aria-label={expanded ? "Collapse panel" : "Expand panel"}
                    >
                        {expanded ? <BsChevronDoubleLeft size={22} /> : <BsChevronDoubleRight size={22} />}
                    </button>
                    {/* Preview area */}
                    <div
                        className={clsx(
                            "bg-zinc-50 dark:bg-zinc-800 overflow-auto transition-all duration-300",
                            expanded ? "w-1/2" : "w-2/3"
                        )}
                    >
                        {selectedForPreview && selectedConversation ? (
                            <div className="h-full flex flex-col">                                
                                {/* Conversation Metadata Component */}
                                {selectedConversation && (
                                    <ConversationPreviewHeader 
                                        key={selectedConversation.id}
                                        conversation={selectedConversation}
                                        editable={true}
                                        onUpdate={handleUpdateConversation}
                                        onNavigate={handleNavigate}
                                    />
                                )}
                                
                                <div className="flex-1 overflow-y-auto p-4">
                                    <ResponseColumn isOverlay={true} />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300">Select a conversation</h2>
                                    <p className="mt-2 text-zinc-500 dark:text-zinc-400">to preview its contents</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* Context Menu */}
            {showContextMenu && (
                <div
                    ref={contextMenuRef}
                    style={{
                        position: "fixed",
                        top: `${contextMenuPosition.y}px`,
                        left: `${contextMenuPosition.x}px`,
                        zIndex: 60,
                    }}
                    className="bg-zinc-100 dark:bg-zinc-850 shadow-lg rounded-xl p-1 border border-zinc-200 dark:border-zinc-700"
                >
                    <button
                        onClick={() => contextMenuConversationId && handleEdit(contextMenuConversationId)}
                        className="flex items-center w-full px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                    >
                        <Edit size={16} className="mr-2" />
                        Edit
                    </button>
                    <button
                        onClick={() => contextMenuConversationId && handleDelete(contextMenuConversationId)}
                        className="flex items-center w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg"
                    >
                        <Trash2 size={16} className="mr-2" />
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
};

export default ConversationSearchOverlay;