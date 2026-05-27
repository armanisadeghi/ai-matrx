'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { registerDatabaseFunctions } from '@/utils/ts-function-registry/register-functions';
import { registerUtilityFunctions } from '@/utils/ts-function-registry/register-utility-functions';
import { FunctionDependencies, getAllRegisteredFunctions } from '@/utils/ts-function-registry/function-registry';
import FunctionButton from '@/components/ts-function-registry/FunctionButton';

export default function FunctionButtonDemo() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [jsonData, setJsonData] = useState('');
  const [parsedData, setParsedData] = useState<Record<string, any> | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string>('');
  const [availableFunctions, setAvailableFunctions] = useState<Array<{ name: string, displayName: string }>>([]);
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize dependencies that will be passed to functions
  const dependencies: FunctionDependencies = {
    supabase,
    logger: console,
    localStorage: typeof window !== 'undefined' ? window.localStorage : null,
    fetch: typeof window !== 'undefined' ? window.fetch.bind(window) : null
  };
  
  // Initialize function registry
  useEffect(() => {
    if (!isInitialized) {
      registerDatabaseFunctions();
      registerUtilityFunctions();
      setIsInitialized(true);
      
      // Get list of available functions for selection
      const functions = getAllRegisteredFunctions();
      setAvailableFunctions(
        functions.map(fn => ({
          name: fn.metadata.name,
          displayName: fn.metadata.displayName
        }))
      );
      
      // Set default selected function if available
      if (functions.length > 0) {
        setSelectedFunction(functions[0].metadata.name);
      }
    }
  }, [isInitialized]);
  
  // Try to parse JSON when it changes
  const handleJsonChange = (json: string) => {
    setJsonData(json);
    
    try {
      if (!json.trim()) {
        setParsedData(null);
        return;
      }
      
      const parsed = JSON.parse(json);
      setParsedData(parsed);
      setError(null);
    } catch (err) {
      setParsedData(null);
      setError('Invalid JSON: ' + (err instanceof Error ? err.message : String(err)));
    }
  };
  
  // Handle function execution result
  const handleExecuted = (result: any, error?: string) => {
    setExecuteResult(result);
    setError(error || null);
  };

  // Prepare some example data for common functions
  const getExampleData = (functionName: string) => {
    switch(functionName) {
      case 'formatDate':
        return JSON.stringify({
          date: new Date().toISOString(),
          format: 'yyyy-MM-dd HH:mm:ss'
        }, null, 2);
      case 'stringTransform':
        return JSON.stringify({
          input: 'Hello world from function button!',
          transformation: 'uppercase'
        }, null, 2);
      case 'validateEmail':
        return JSON.stringify({
          email: 'user@example.com'
        }, null, 2);
      case 'calculateStats':
        return JSON.stringify({
          numbers: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        }, null, 2);
      case 'generateRandomData':
        return JSON.stringify({
          type: 'name',
          count: 5
        }, null, 2);
      default:
        return '{\n  \n}';
    }
  };
  
  // When selected function changes, populate with example data
  useEffect(() => {
    if (selectedFunction) {
      handleJsonChange(getExampleData(selectedFunction));
    }
  }, [selectedFunction]);
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-200">
        Function Button Demo
      </h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Data Source (JSON)
          </h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Select Function to Test
            </label>
            <select
              value={selectedFunction}
              onChange={e => setSelectedFunction(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border dark:bg-gray-800"
            >
              {availableFunctions.map(fn => (
                <option key={fn.name} value={fn.name}>
                  {fn.displayName} ({fn.name})
                </option>
              ))}
            </select>
          </div>
          
          <div className="bg-textured p-4 rounded-lg shadow-md">
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
              This JSON data simulates data coming from an external source:
            </p>
            
            <textarea
              value={jsonData}
              onChange={e => handleJsonChange(e.target.value)}
              className="w-full h-80 p-3 font-mono text-sm bg-gray-50 dark:bg-gray-800 border border-border rounded-md"
              placeholder="Enter JSON data here..."
            />
            
            {error && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            Function Button
          </h2>
          
          <div className="bg-textured p-6 rounded-lg shadow-md mb-8">
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              This button executes the selected function with the data from the JSON editor.
              It is completely generic and has no knowledge of specific function implementations.
            </p>
            
            <div className="flex items-center justify-center mb-8">
              <FunctionButton
                functionName={selectedFunction}
                data={parsedData}
                dependencies={dependencies}
                buttonText={`Execute ${selectedFunction}`}
                onExecuted={handleExecuted}
                className="text-lg"
              />
            </div>
            
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
                Execution Result
              </h3>
              
              {executeResult !== null ? (
                <pre className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md overflow-x-auto text-sm">
                  {JSON.stringify(executeResult, null, 2)}
                </pre>
              ) : (
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-md text-gray-500 dark:text-gray-400 text-center">
                  No result yet. Click the button to execute the function.
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-textured p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-medium mb-4 text-gray-800 dark:text-gray-200">
              Multiple Function Buttons Demo
            </h3>
            
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              These buttons use pre-configured data but the same generic component:
            </p>
            
            <div className="space-y-4">
              <div className="p-4 border-border rounded-md">
                <h4 className="font-medium mb-2 text-gray-700 dark:text-gray-300">Format Current Date</h4>
                <FunctionButton
                  functionName="formatDate"
                  data={{ date: new Date().toISOString(), format: 'yyyy-MM-dd HH:mm:ss' }}
                  dependencies={dependencies}
                  buttonText="Format Today's Date"
                  onExecuted={(result) => console.log('Date formatted:', result)}
                />
              </div>
              
              <div className="p-4 border-border rounded-md">
                <h4 className="font-medium mb-2 text-gray-700 dark:text-gray-300">Generate Random Names</h4>
                <FunctionButton
                  functionName="generateRandomData"
                  data={{ type: 'name', count: 3 }}
                  dependencies={dependencies}
                  buttonText="Generate 3 Random Names"
                  onExecuted={(result) => console.log('Names generated:', result)}
                />
              </div>
              
              <div className="p-4 border-border rounded-md">
                <h4 className="font-medium mb-2 text-gray-700 dark:text-gray-300">Calculate Statistics</h4>
                <FunctionButton
                  functionName="calculateStats"
                  data={{ numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }}
                  dependencies={dependencies}
                  buttonText="Calculate Stats on Sequence"
                  onExecuted={(result) => console.log('Stats calculated:', result)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 