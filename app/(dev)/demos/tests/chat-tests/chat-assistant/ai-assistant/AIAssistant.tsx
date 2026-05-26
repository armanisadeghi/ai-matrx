'use client';
import React, { useRef, useEffect } from 'react';
import { 
  Minimize2, 
  MessageSquare,
  Clock, 
  PlusCircle,
  CircleArrowUp,
  CircleArrowDown,
  X,
  Settings
} from 'lucide-react';
import { 
  AIAssistantProps, 
  Interaction,
  isInputInteraction,
  isSliderInteraction,
  isCheckboxInteraction
} from './types';
import { 
  useAIInteractions, 
  useHoldingArea, 
  useInteractionHistory, 
  useExpandedItems 
} from './hooks';
import InteractionItem from './InteractionItem';
import HistoryItem from './HistoryItem';
import HoldingArea from './HoldingArea';

const AIAssistant: React.FC<AIAssistantProps> = ({
  onAddToContext,
  onFeedbackChange,
  className
}) => {
  const { 
    interactions, 
    setInteractions, 
    notifications, 
    setNotifications, 
    addRandomInteraction 
  } = useAIInteractions();
  
  const { 
    holdingArea, 
    addToHoldingArea, 
    removeFromHoldingArea, 
    clearHoldingArea 
  } = useHoldingArea();
  
  const { 
    historyItems, 
    addToHistory, 
    removeFromHistory 
  } = useInteractionHistory();
  
  const { 
    expandedItems, 
    toggleExpanded 
  } = useExpandedItems();
  
  const [isOpen, setIsOpen] = React.useState(true);
  const [showHistory, setShowHistory] = React.useState(false);
  const [feedbackValue, setFeedbackValue] = React.useState(5);
  const [showSettings, setShowSettings] = React.useState(false);

  const interactionsContainerRef = useRef<HTMLDivElement>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll effect for interactions container
  useEffect(() => {
    if (interactionsContainerRef.current && interactions.length > 0) {
      // Simple scroll to top (newest items will be at the top)
      interactionsContainerRef.current.scrollTop = 0;
    }
  }, [interactions.length]);
  
  // Auto-scroll effect for history container
  useEffect(() => {
    if (historyContainerRef.current && historyItems.length > 0 && showHistory) {
      // Simple scroll to top (newest items will be at the top)
      historyContainerRef.current.scrollTop = 0;
    }
  }, [historyItems.length, showHistory]);
  
  // Toggle history visibility
  const toggleHistory = () => {
    setShowHistory(!showHistory);
  };

  // Toggle settings visibility
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };
  
  // Handle answering a question
  const handleAnswer = (id: number, answer: any) => {
    // Find the interaction
    const interaction = interactions.find(item => item.id === id);
    if (!interaction) return;
    
    // Update the interaction - using type casting to handle the union type
    const updatedInteraction = { ...interaction, answer, isAnswered: true } as Interaction;
    
    // Update interactions list
    setInteractions(interactions.map(item => 
      item.id === id ? updatedInteraction : item
    ));
    
    // Add to holding area
    addToHoldingArea(updatedInteraction);
    
    // Reduce notification count
    setNotifications(Math.max(0, notifications - 1));
    
    // Remove from active list after a delay
    setTimeout(() => {
      setInteractions(interactions.filter(item => item.id !== id));
    }, 3000);
  };
  
  // Move an interaction to history
  const moveToHistory = (id: number) => {
    const interaction = interactions.find(item => item.id === id);
    if (!interaction) return;
    
    addToHistory(interaction);
    setInteractions(interactions.filter(item => item.id !== id));
    setNotifications(Math.max(0, notifications - 1));
  };
  
  // Restore an interaction from history
  const restoreFromHistory = (id: number) => {
    const interaction = historyItems.find(item => item.id === id);
    if (!interaction) return;
    
    // Add to the beginning of the array (will appear at the top with flex-col-reverse)
    setInteractions([interaction, ...interactions]);
    removeFromHistory(id);
    setNotifications(notifications + 1);
  };
  
  // Add all holding area items as context
  const handleAddToContext = () => {
    if (onAddToContext) {
      onAddToContext(holdingArea);
    } else {
      // Default behavior for demo purposes
      console.log(`Added ${holdingArea.length} items to chat context`);
    }
    clearHoldingArea();
  };
  
  // Update feedback value
  const updateFeedbackValue = (newValue: number) => {
    setFeedbackValue(newValue);
    if (onFeedbackChange) {
      onFeedbackChange(newValue);
    }
  };
  
  // Handle input changes
  const handleInputChange = (id: number, value: string) => {
    setInteractions(interactions.map(item => {
      if (item.id === id && isInputInteraction(item)) {
        return { ...item, value };
      }
      return item;
    }));
  };
  
  // Handle slider changes
  const handleSliderChange = (id: number, value: number) => {
    setInteractions(interactions.map(item => {
      if (item.id === id && isSliderInteraction(item)) {
        return { ...item, value };
      }
      return item;
    }));
  };
  
  // Handle checkbox changes
  const handleCheckboxChange = (id: number, option: string, isChecked: boolean) => {
    setInteractions(interactions.map(item => {
      if (item.id === id && isCheckboxInteraction(item)) {
        const newSelected = isChecked 
          ? [...(item.selected || []), option]
          : (item.selected || []).filter(selected => selected !== option);
        return { ...item, selected: newSelected };
      }
      return item;
    }));
  };
  
  // Override the addRandomInteraction to prepend items
  const handleAddRandomInteraction = () => {
    // Call the original function (assume it returns a new interaction)
    const newInteraction = addRandomInteraction();
    
    // If we have the actual interaction and want to ensure it's at the top,
    // we could do something like this:
    // setInteractions(prevInteractions => [newInteraction, ...prevInteractions]);
  };
  
  // Control button classes
  const controlButtonClasses = "p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 hover:bg-opacity-20 transition-all duration-200";
  
  return (
    <div 
      className={`fixed bottom-0 right-0 z-50 flex flex-col-reverse gap-2 max-h-screen ${className || ''}`}
    >
      {/* Interaction Items (visible when open) */}
      <div 
        ref={interactionsContainerRef}
        className={`
          overflow-y-auto flex flex-col-reverse gap-2 w-72 pr-2 pb-2 pl-1
          ${isOpen ? "opacity-100 visible max-h-[70vh]" : "opacity-0 invisible h-0"} 
          transition-all duration-300 ease-in-out scroll-smooth scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700
        `}
      >
        {/* Render interactions in reverse order so newest appears at the top with flex-col-reverse */}
        {[...interactions].reverse().map(interaction => (
          <InteractionItem 
            key={interaction.id}
            interaction={interaction}
            expanded={expandedItems[interaction.id]}
            toggleExpanded={toggleExpanded}
            handleAnswer={handleAnswer}
            handleInputChange={handleInputChange}
            handleSliderChange={handleSliderChange}
            handleCheckboxChange={handleCheckboxChange}
            moveToHistory={moveToHistory}
          />
        ))}
      </div>
      
      {/* History Items (visible when history is open) */}
      <div 
        ref={historyContainerRef}
        className={`
          overflow-y-auto flex flex-col-reverse gap-1 w-72 pr-2 pb-0 pl-1
          ${isOpen && showHistory ? "opacity-100 visible max-h-[70vh]" : "opacity-0 invisible h-0"} 
          transition-all duration-300 ease-in-out
        `}
      >
        <div className="text-center mb-2 text-gray-500 dark:text-gray-400 relative">
          <span className="text-sm font-medium">History</span>
          {/* Global close button for history */}
          <button 
            onClick={toggleHistory}
            className="absolute right-1 top-0 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label="Close history"
          >
            <X size={16} />
          </button>
        </div>
        {/* Render history items in reverse order so newest appears at the top with flex-col-reverse */}
        {[...historyItems].reverse().map(interaction => (
          <HistoryItem 
            key={interaction.id}
            interaction={interaction}
            restoreFromHistory={restoreFromHistory}
            toggleHistory={toggleHistory}
          />
        ))}
        {historyItems.length === 0 && (
          <div className="text-center p-4 text-gray-400 dark:text-gray-500">
            <span className="text-sm">No history items yet</span>
          </div>
        )}
      </div>
      
      {/* Holding Area for answered items */}
      {isOpen && (
        <HoldingArea 
          items={holdingArea}
          onAddToContext={handleAddToContext}
          onClear={clearHoldingArea}
          onRemoveItem={removeFromHoldingArea}
        />
      )}
      
      {/* Main Control Bar */}
      <div className="flex justify-end items-center py-1 px-2">
        {isOpen && (
          <div className="flex gap-1 mr-1 text-gray-600 dark:text-white">
            {/* Feedback Controls */}
            <div className="flex items-center mr-1 border-1 border-gray-200 dark:border-gray-700 rounded-full">
              <button 
                onClick={() => updateFeedbackValue(Math.max(1, feedbackValue - 1))}
                className={controlButtonClasses}
                title="Less frequent interactions"
              >
                <CircleArrowDown size={16} />
              </button>
              <div className="mx-1 text-xs text-gray-500 dark:text-gray-400">
                {feedbackValue}
              </div>
              <button
                onClick={() => updateFeedbackValue(Math.min(10, feedbackValue + 1))}
                className={controlButtonClasses}
                title="More frequent interactions"
              >
                <CircleArrowUp size={16} />
              </button>
            </div>
            
            {/* Add Demo Interaction */}
            <button 
              onClick={addRandomInteraction} 
              className={controlButtonClasses}
              aria-label="Add demo interaction"
            >
              <PlusCircle size={16} />
            </button>
            
            {/* Toggle History View */}
            <button 
              onClick={toggleHistory} 
              className={`${controlButtonClasses} ${showHistory ? "bg-gray-200 dark:bg-gray-700" : ""}`}
              aria-label="Toggle history"
            >
              <Clock size={16} />
            </button>
            <button 
              onClick={toggleSettings} 
              className={`${controlButtonClasses} ${showSettings ? "bg-gray-200 dark:bg-gray-700" : ""}`}
              aria-label="Settings"
            >
              <Settings size={16} />
            </button>
          </div>
        )}
        
        {/* Main Toggle Button */}
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className={`
            rounded-full p-2 shadow-lg flex items-center justify-center transition-all duration-300
            ${notifications > 0 && !isOpen ? "animate-glow ring-2 ring-indigo-400" : ""}
            bg-white hover:bg-gray-100 text-indigo-600 border-border
            dark:bg-indigo-600 dark:hover:bg-indigo-700 dark:text-white dark:border-transparent
          `}
          aria-label={isOpen ? "Minimize assistant" : "Open assistant"}
        >
          {isOpen ? (
            <Minimize2 size={16} />
          ) : (
            <div className="relative">
              <MessageSquare size={16} />
              {notifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {notifications}
                </span>
              )}
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default AIAssistant;