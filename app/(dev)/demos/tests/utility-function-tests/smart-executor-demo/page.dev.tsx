'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { registerDatabaseFunctions } from '@/utils/ts-function-registry/register-functions';
import { registerUtilityFunctions } from '@/utils/ts-function-registry/register-utility-functions';
import { registerResultComponents } from '@/utils/ts-function-registry/register-result-components';
import { FunctionDependencies, getAllRegisteredFunctions } from '@/utils/ts-function-registry/function-registry';
import { getAllResultComponents } from '@/utils/ts-function-registry/component-registry';
import SmartFunctionExecutor from '@/components/ts-function-registry/SmartFunctionExecutor';

export default function SmartExecutorDemo() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableFunctions, setAvailableFunctions] = useState<Array<{ name: string, displayName: string, category: string }>>([]);
  const [availableComponents, setAvailableComponents] = useState<Array<{ name: string, displayName: string, description: string }>>([]);
  
  // Initialize dependencies that will be passed to functions
  const dependencies: FunctionDependencies = {
    supabase,
    logger: console,
    localStorage: typeof window !== 'undefined' ? window.localStorage : null,
    fetch: typeof window !== 'undefined' ? window.fetch.bind(window) : null
  };
  
  // Initialize function registry and result component registry
  useEffect(() => {
    if (!isInitialized) {
      registerDatabaseFunctions();
      registerUtilityFunctions();
      registerResultComponents();
      setIsInitialized(true);
      
      // Get list of available functions
      const functions = getAllRegisteredFunctions();
      setAvailableFunctions(
        functions.map(fn => ({
          name: fn.metadata.name,
          displayName: fn.metadata.displayName,
          category: fn.metadata.category
        }))
      );
      
      // Get list of available result components
      const components = getAllResultComponents();
      setAvailableComponents(
        components.map(comp => ({
          name: comp.metadata.name,
          displayName: comp.metadata.displayName,
          description: comp.metadata.description
        }))
      );
    }
  }, [isInitialized]);
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Smart Function Executor Demo
      </h1>
      
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-blue-800 dark:text-blue-200">
        <p>
          This demo shows the SmartFunctionExecutor component that combines the FunctionButton with specialized
          result components from the component registry. Each function has a tailored display component.
        </p>
      </div>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
          Available Functions and Components
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-textured rounded-md shadow-md">
            <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">Registered Functions</h3>
            <div className="h-48 overflow-y-auto">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {availableFunctions.map(fn => (
                  <li key={fn.name} className="py-2">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{fn.displayName}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({fn.name})</span>
                    <span className="ml-2 px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {fn.category}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="p-4 bg-textured rounded-md shadow-md">
            <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">Registered Result Components</h3>
            <div className="h-48 overflow-y-auto">
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {availableComponents.map(comp => (
                  <li key={comp.name} className="py-2">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{comp.displayName}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({comp.name})</span>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{comp.description}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        Smart Function Executors
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Date Formatter with specialized display */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Format Date</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the dateDisplay component to show formatted date results.
          </p>
          
          <SmartFunctionExecutor
            functionName="formatDate"
            data={{ date: new Date().toISOString(), format: 'yyyy-MM-dd HH:mm:ss' }}
            dependencies={dependencies}
            resultComponentName="dateDisplay"
            buttonText="Format Current Date"
          />
        </div>
        
        {/* String Transformation with specialized display */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Transform String</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the stringTransformDisplay component to show before/after comparison.
          </p>
          
          <SmartFunctionExecutor
            functionName="stringTransform"
            data={{ input: 'Hello world from smart executor!', transformation: 'uppercase' }}
            dependencies={dependencies}
            resultComponentName="stringTransformDisplay"
            buttonText="Transform to Uppercase"
          />
        </div>
        
        {/* Email Validation with specialized display */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Validate Email</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the validationDisplay component to show validation status.
          </p>
          
          <SmartFunctionExecutor
            functionName="validateEmail"
            data={{ email: 'user@example.com' }}
            dependencies={dependencies}
            resultComponentName="validationDisplay"
            buttonText="Validate Email Address"
          />
        </div>
        
        {/* Statistics with specialized display */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Calculate Statistics</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the statsDisplay component to show statistical results in a grid.
          </p>
          
          <SmartFunctionExecutor
            functionName="calculateStats"
            data={{ numbers: [12, 34, 56, 78, 90, 23, 45, 67, 89] }}
            dependencies={dependencies}
            resultComponentName="statsDisplay"
            buttonText="Calculate Statistics"
          />
        </div>
        
        {/* Random Data Generation with specialized display */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Generate Random Data</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the randomDataDisplay component to show randomly generated data.
          </p>
          
          <SmartFunctionExecutor
            functionName="generateRandomData"
            data={{ type: 'name', count: 5 }}
            dependencies={dependencies}
            resultComponentName="randomDataDisplay"
            buttonText="Generate 5 Random Names"
          />
        </div>
        
        {/* Generic JSON viewer fallback */}
        <div className="p-6 bg-textured rounded-lg shadow-md">
          <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">Generic JSON Viewer</h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            This example uses the generic jsonViewer component which works with any function.
          </p>
          
          <SmartFunctionExecutor
            functionName="generateRandomData"
            data={{ type: 'color', count: 3 }}
            dependencies={dependencies}
            resultComponentName="jsonViewer"
            buttonText="Generate 3 Random Colors"
          />
        </div>
      </div>
    </div>
  );
} 