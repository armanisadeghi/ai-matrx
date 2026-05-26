// HoldingArea.tsx - Component for the holding area of answered items
import React from 'react';
import { X } from 'lucide-react';
import { 
  HoldingAreaProps, 
  isTextInteraction,
  isQuestionInteraction,
  isInputInteraction,
  isSliderInteraction,
  isCheckboxInteraction
} from './types';

const HoldingArea: React.FC<HoldingAreaProps> = ({
  items,
  onAddToContext,
  onClear,
  onRemoveItem
}) => {
  if (items.length === 0) return null;
  
  // Render item content based on type
  const renderItemContent = (item: any) => {
    if (isQuestionInteraction(item)) {
      return (
        <span>
          {item.content.substring(0, 30)}... <strong>{item.answer}</strong>
        </span>
      );
    } else if (isInputInteraction(item)) {
      return (
        <span>
          {item.label.substring(0, 30)}... <strong>{item.value}</strong>
        </span>
      );
    } else if (isCheckboxInteraction(item)) {
      return (
        <span>
          {item.label.substring(0, 30)}... <strong>{(item.selected || []).join(", ")}</strong>
        </span>
      );
    } else if (isSliderInteraction(item)) {
      return (
        <span>
          {item.label.substring(0, 30)}... <strong>{item.value}</strong>
        </span>
      );
    } else if (isTextInteraction(item)) {
      return <span>{item.content.substring(0, 40)}...</span>;
    }
    
    return <span>Item</span>;
  };
  
  return (
    <div className="overflow-y-auto flex flex-col gap-1 w-72 px-2 py-1 bg-textured border-t border-border max-h-[20vh]">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Answered Items ({items.length})
        </span>
        <div className="flex gap-1">
          <button
            onClick={onAddToContext}
            className="text-xs px-2 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600 dark:text-white"
            title="Add all to chat context"
          >
            Add to Chat
          </button>
          <button
            onClick={onClear}
            className="text-xs px-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            title="Clear holding area"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      
      {items.map(item => (
        <div
          key={item.id}
          className="flex justify-between items-center text-xs p-1 rounded bg-gray-100 dark:bg-gray-700"
        >
          <div className="truncate flex-grow">
            {renderItemContent(item)}
          </div>
          <button
            onClick={() => onRemoveItem(item.id)}
            className="ml-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title="Remove from holding area"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default HoldingArea;