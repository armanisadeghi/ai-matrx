'use client';

import React from 'react'; 



// Component for AI assistance
const AIAssistant = ({ generateWithAI, isGenerating, aiSuggestion, applySuggestion }) => {
  return (
    <div className="bg-textured p-4 border-b border-border">
      <h2 className="font-bold text-lg mb-2 text-gray-800 dark:text-gray-100">AI Assistant</h2>
      <div className="flex space-x-2 mb-3">
        <input
          type="text"
          placeholder="Describe what you want to create..."
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-800 dark:text-gray-200"
          onKeyDown={(e) => e.key === 'Enter' && generateWithAI((e.target as HTMLInputElement).value)}
        />
        <button
          className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 disabled:bg-blue-300 dark:disabled:bg-blue-900 transition-colors"
          onClick={(e) => generateWithAI(((e.target as HTMLElement).previousElementSibling as HTMLInputElement).value)}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
      </div>
      
      {aiSuggestion && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-blue-700 dark:text-blue-400">AI Suggestion</h3>
            <button
              className="px-3 py-1 bg-blue-600 dark:bg-blue-700 text-white text-sm rounded-md hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
              onClick={applySuggestion}
            >
              Apply
            </button>
          </div>
          <pre className="text-xs text-gray-600 dark:text-gray-300 max-h-40 overflow-auto">
            {aiSuggestion.slice(0, 150)}...
          </pre>
        </div>
      )}
    </div>
  );
};

export default AIAssistant;
