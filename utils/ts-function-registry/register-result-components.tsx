'use client';

import React from 'react';
import { registerResultComponent, ResultRendererProps } from './component-registry';

export function registerResultComponents() {
  // JSON Result Component
  registerResultComponent(
    {
      name: 'jsonViewer',
      displayName: 'JSON Viewer',
      description: 'Displays results as formatted JSON',
      // Works with any function
    },
    ({ result, error }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      return (
        <div className="json-viewer">
          <pre className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md overflow-x-auto text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      );
    }
  );
  
  // Date Formatter Result Component
  registerResultComponent(
    {
      name: 'dateDisplay',
      displayName: 'Date Display',
      description: 'Nicely formats date results',
      supportedFunctions: ['formatDate']
    },
    ({ result, error }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      return (
        <div className="date-display text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{String(result)}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Formatted Date</div>
        </div>
      );
    }
  );
  
  // Stats Display Component
  registerResultComponent(
    {
      name: 'statsDisplay',
      displayName: 'Statistics Display',
      description: 'Displays statistical results in a structured format',
      supportedFunctions: ['calculateStats']
    },
    ({ result, error }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      if (!result || typeof result !== 'object') return null;

      return (
        <div className="stats-display">
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(result as Record<string, unknown>).map(([key, value]) => (
              <div key={key} className="p-2 border-border rounded">
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{key}</div>
                <div className="text-lg font-bold text-gray-800 dark:text-gray-200">{String(value)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  );

  // Email Validation Result Component
  registerResultComponent(
    {
      name: 'validationDisplay',
      displayName: 'Validation Result',
      description: 'Displays validation results with status indicators',
      supportedFunctions: ['validateEmail']
    },
    ({ result, error }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      if (!result || typeof result !== 'object') return null;

      const validation = result as { isValid?: boolean; message?: string };
      const isValid = validation.isValid;

      return (
        <div className={`p-4 ${isValid ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'} border rounded-md`}>
          <div className="flex items-center">
            <div className={`w-4 h-4 rounded-full ${isValid ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
            <div className={`font-medium ${isValid ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
              {validation.message}
            </div>
          </div>
        </div>
      );
    }
  );

  // Random Data Generator Result Component
  registerResultComponent(
    {
      name: 'randomDataDisplay',
      displayName: 'Random Data Display',
      description: 'Displays randomly generated data in a list format',
      supportedFunctions: ['generateRandomData']
    },
    ({ result, error }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      if (!result) return null;
      
      // Handle both array and single value results
      const items = Array.isArray(result) ? result : [result];
      
      return (
        <div className="random-data-display">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((item, index) => (
              <li key={index} className="py-3 flex items-center">
                <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full flex items-center justify-center mr-3">
                  {index + 1}
                </div>
                <div className="text-gray-800 dark:text-gray-200">
                  {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  );

  // String Transformation Result Component
  registerResultComponent(
    {
      name: 'stringTransformDisplay',
      displayName: 'String Transform Display',
      description: 'Displays string transformation results with before/after comparison',
      supportedFunctions: ['stringTransform']
    },
    ({ result, error, context }: ResultRendererProps) => {
      if (error) {
        return (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
            {error}
          </div>
        );
      }
      
      // Get the original input from context if available
      const originalInput = (context?.input as string | undefined) || '';
      
      return (
        <div className="string-transform-display p-4 bg-gray-50 dark:bg-gray-800 rounded-md">
          {originalInput && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Original:</div>
              <div className="text-gray-800 dark:text-gray-200 p-2 bg-textured rounded border-border">
                {originalInput}
              </div>
            </div>
          )}
          
          <div>
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">Transformed:</div>
            <div className="text-blue-600 dark:text-blue-400 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800 font-medium">
              {String(result)}
            </div>
          </div>
        </div>
      );
    }
  );
} 