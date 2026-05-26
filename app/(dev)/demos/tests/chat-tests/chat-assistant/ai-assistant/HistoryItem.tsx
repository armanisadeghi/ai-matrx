// HistoryItem.tsx - Component for history items
import React from 'react';
import { ArrowRight } from 'lucide-react';
import { HistoryItemProps } from './types';
import { formatTime } from './hooks';

const HistoryItem: React.FC<HistoryItemProps> = ({ 
  interaction, 
  restoreFromHistory 
}) => {
  // Simplified content preview
  let contentPreview = "";
  if (interaction.type === "question") {
    contentPreview = interaction.content;
  } else if (interaction.type === "input") {
    contentPreview = interaction.label;
  } else if (interaction.type === "slider") {
    contentPreview = interaction.label;
  } else if (interaction.type === "checkbox") {
    contentPreview = interaction.label;
  } else if (interaction.type === "text") {
    contentPreview = interaction.content;
  }
  
  // Truncate preview if needed
  contentPreview = contentPreview.length > 60 
    ? contentPreview.substring(0, 60) + "..." 
    : contentPreview;
  
  return (
    <div className="rounded-lg p-2 shadow-sm bg-textured border-border relative">
      <div className="flex justify-between items-start">
        <div className="flex-grow">
          <div className="text-xs mb-1 text-gray-500 dark:text-gray-400">
            {formatTime(interaction.timestamp)}
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 pr-6">
            {contentPreview}
          </p>
        </div>
        <button
          onClick={() => restoreFromHistory(interaction.id)}
          className="absolute top-2 right-2 p-1 rounded-full 
            bg-gray-100 hover:bg-gray-200 text-indigo-600 
            dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-indigo-400"
          title="Restore from history"
        >
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default HistoryItem;