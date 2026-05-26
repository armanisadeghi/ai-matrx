// hooks.ts - Custom hooks for AI Assistant functionality
import { useState, useEffect } from 'react';
import { Interaction } from './types';

// Demo data for development and testing
const DEMO_INTERACTIONS: Interaction[] = [
  {
    id: 1,
    type: 'question',
    content: "I noticed you're asking about React hooks. Would you like me to explain useState vs useEffect?",
    options: ["Yes, please explain", "No, I understand them", "Just show me code examples"],
    answer: null,
    timestamp: new Date().getTime() - 60000 * 5
  },
  {
    id: 2,
    type: 'text',
    content: "You seem to be implementing a complex form. Would you like suggestions on form validation?",
    timestamp: new Date().getTime() - 60000 * 3
  },
  {
    id: 3,
    type: 'input',
    label: "What specific React component are you trying to build?",
    value: "",
    timestamp: new Date().getTime() - 60000 * 1
  }
];

/**
 * Hook to manage AI interactions
 * In a real app, this would connect to your AI service
 */
export const useAIInteractions = () => {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [notifications, setNotifications] = useState(0);
  
  // Load initial demo interactions
  useEffect(() => {
    setInteractions(DEMO_INTERACTIONS);
    setNotifications(DEMO_INTERACTIONS.length);
  }, []);
  
  // Add a new random interaction (for demo purposes)
  const addRandomInteraction = () => {
    const types: Interaction['type'][] = ["question", "text", "input", "slider", "checkbox"];
    const type = types[Math.floor(Math.random() * types.length)];
    const newId = Math.max(0, ...interactions.map(i => i.id)) + 1;
    
    let newInteraction: Interaction;
    
    switch(type) {
      case "question":
        newInteraction = {
          id: newId,
          type,
          content: "Would you like suggestions for optimizing your code?",
          options: ["Yes", "No", "Maybe later"],
          answer: null,
          timestamp: new Date().getTime()
        };
        break;
      case "text":
        newInteraction = {
          id: newId,
          type,
          content: "I noticed you're working with large datasets. Have you considered using virtualization?",
          timestamp: new Date().getTime()
        };
        break;
      case "input":
        newInteraction = {
          id: newId,
          type,
          label: "What's your main challenge with this component?",
          value: "",
          timestamp: new Date().getTime()
        };
        break;
      case "slider":
        newInteraction = {
          id: newId,
          type,
          label: "How complex is your use case?",
          min: 1,
          max: 10,
          value: 5,
          timestamp: new Date().getTime()
        };
        break;
      case "checkbox":
        newInteraction = {
          id: newId,
          type,
          label: "Which features are you interested in?",
          options: ["Performance", "Accessibility", "Design", "Testing"],
          selected: [],
          timestamp: new Date().getTime()
        };
        break;
      default:
        newInteraction = {
          id: newId,
          type: 'text',
          content: "Hello, how can I help you today?",
          timestamp: new Date().getTime()
        };
    }
    
    setInteractions([...interactions, newInteraction]);
    setNotifications(prev => prev + 1);
    
    return newInteraction;
  };
  
  return {
    interactions,
    setInteractions,
    notifications,
    setNotifications,
    addRandomInteraction
  };
};

/**
 * Hook to manage the holding area for answered items
 */
export const useHoldingArea = () => {
  const [holdingArea, setHoldingArea] = useState<Interaction[]>([]);
  
  const addToHoldingArea = (interaction: Interaction) => {
    setHoldingArea(prev => [...prev, interaction]);
  };
  
  const removeFromHoldingArea = (id: number) => {
    setHoldingArea(prev => prev.filter(item => item.id !== id));
  };
  
  const clearHoldingArea = () => {
    setHoldingArea([]);
  };
  
  return {
    holdingArea,
    addToHoldingArea,
    removeFromHoldingArea,
    clearHoldingArea
  };
};

/**
 * Hook to manage history items
 */
export const useInteractionHistory = () => {
  const [historyItems, setHistoryItems] = useState<Interaction[]>([]);
  
  const addToHistory = (interaction: Interaction) => {
    setHistoryItems(prev => [...prev, interaction]);
  };
  
  const removeFromHistory = (id: number) => {
    setHistoryItems(prev => prev.filter(item => item.id !== id));
  };
  
  return {
    historyItems,
    addToHistory,
    removeFromHistory
  };
};

/**
 * Helper hook for managing expanded state of messages
 */
export const useExpandedItems = () => {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});
  
  const toggleExpanded = (id: number) => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };
  
  return {
    expandedItems,
    toggleExpanded
  };
};

/**
 * Format timestamp to readable time
 */
export const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};