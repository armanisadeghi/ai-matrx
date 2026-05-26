'use client';

import React, { useState, useEffect } from 'react'; 
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';


// Component for editing React code
const CodeEditor = ({ code, setCode, resetCode }) => {
  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="bg-gray-100 dark:bg-gray-800 p-2 flex justify-between items-center border-b border-border">
        <h2 className="font-semibold text-gray-700 dark:text-gray-200">Code Editor</h2>
        <button 
          className="px-2 py-1 bg-gray-500 dark:bg-gray-600 text-white text-sm rounded hover:bg-gray-600 dark:hover:bg-gray-700 transition-colors"
          onClick={resetCode}
        >
          Reset
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-textured">
        <LiveProvider code={code} noInline={true}>
          <LiveEditor 
            className="min-h-full font-mono text-sm p-4" 
            onChange={setCode}
            style={{ fontFamily: 'monospace', background: 'transparent' }}
          />
        </LiveProvider>
      </div>
    </div>
  );
};

export default CodeEditor;
