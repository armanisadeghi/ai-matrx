'use client';
import DynamicComponentRenderer from './DynamicComponentRenderer';
import React, { useState, useEffect } from 'react'; 
import { LiveProvider, LiveEditor, LiveError, LivePreview } from 'react-live';


// Component for saving/loading components
const ComponentManager = ({ 
  currentComponentName, 
  setCurrentComponentName, 
  saveComponent, 
  savedComponents, 
  loadComponent, 
  deleteComponent 
}) => {
  return (
    <>
      {/* Save Component Section */}
      <div className="bg-textured p-4 border-t border-border">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder="Component name"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-textured text-gray-800 dark:text-gray-200"
            value={currentComponentName}
            onChange={(e) => setCurrentComponentName(e.target.value)}
          />
          <button
            className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-md hover:bg-green-700 dark:hover:bg-green-800 transition-colors"
            onClick={saveComponent}
          >
            Save
          </button>
        </div>
      </div>
      
      {/* Saved Components */}
      <div className="bg-textured border-t border-border">
        <div className="bg-gray-100 dark:bg-gray-800 p-2 border-b border-border">
          <h2 className="font-semibold text-gray-700 dark:text-gray-200">Saved Components</h2>
        </div>
        <div className="max-h-60 overflow-auto p-2">
          {savedComponents.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">No saved components yet</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {savedComponents.map((component) => (
                <li key={component.id} className="py-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{component.name}</span>
                    <div>
                      <button
                        className="px-2 py-1 text-xs bg-blue-500 dark:bg-blue-600 text-white rounded mr-2 hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                        onClick={() => loadComponent(component)}
                      >
                        Load
                      </button>
                      <button
                        className="px-2 py-1 text-xs bg-red-500 dark:bg-red-600 text-white rounded hover:bg-red-600 dark:hover:bg-red-700 transition-colors"
                        onClick={() => deleteComponent(component.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
};

export default ComponentManager;
