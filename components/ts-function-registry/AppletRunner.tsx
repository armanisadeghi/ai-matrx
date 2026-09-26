'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabase/client';
import { registerDatabaseFunctions } from '@/utils/ts-function-registry/register-functions';
import { registerUtilityFunctions } from '@/utils/ts-function-registry/register-utility-functions';
import { AppletLogic, executeAppletLogic, validateApplet } from '@/utils/ts-function-registry/applet-utils';
import { FunctionDependencies } from '@/utils/ts-function-registry/function-registry';
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AppletRunnerProps {
  applet: AppletLogic;
  initialState?: Record<string, any>;
  // Optional custom dependencies can be passed in 
  customDependencies?: FunctionDependencies;
}

export default function AppletRunner({ 
  applet, 
  initialState = {},
  customDependencies = {} 
}: AppletRunnerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Setup dependencies with default supabase
  const dependencies: FunctionDependencies = {
    supabase,
    ...customDependencies
  };
    
  // Initialize the function registry
  useEffect(() => {
    if (!isInitialized) {
      registerDatabaseFunctions();
      registerUtilityFunctions();
      setIsInitialized(true);
      
      // Validate the applet with available dependencies
      const validation = validateApplet(applet, Object.keys(dependencies));
      if (!validation.valid) {
        setValidationErrors(validation.errors);
      }
    }
  }, [applet, isInitialized, dependencies]);
  
  const runApplet = async () => {
    if (validationErrors.length > 0 || isRunning) return;
    
    setIsRunning(true);
    setResults({});
    setError(null);
    
    try {
      // Execute the applet with dependencies
      const result = await executeAppletLogic(dependencies, applet, initialState);
      
      if (result.success) {
        setResults(result.results);
      } else {
        setError(result.error || 'An error occurred while running the applet');
        setCurrentStep(result.failedStep || null);
      }
    } catch (err) {
      console.error('Error running applet:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsRunning(false);
    }
  };
  
  // Show each step's title and its execution result
  const renderStepResults = () => {
    return applet.steps.map(step => {
      const result = results[step.id];
      const isFailed = currentStep === step.id;
      
      return (
        <div 
          key={step.id} 
          className={`p-4 mb-2 rounded-md ${
            isFailed 
              ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700' 
              : result 
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
                : 'bg-gray-50 dark:bg-gray-800 border-border'
          }`}
        >
          <h3 className="text-lg font-medium mb-1 text-gray-800 dark:text-gray-200">
            {step.title}
          </h3>
          
          {step.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {step.description}
            </p>
          )}
          
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Function: {step.functionName}
          </div>
          
          {result && (
            <div className="mt-2">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Result:
              </div>
              <pre className="text-xs bg-textured p-2 rounded overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
          
          {isFailed && error && (
            <div className="mt-2 text-sm text-red-600 dark:text-red-400">
              Error: {error}
            </div>
          )}
          <ErrorAlchemyMenu error={error} />
        </div>
      );
    });
  };
  
  return (
    <div className="bg-textured p-6 rounded-lg shadow-lg max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
            {applet.name}
          </h2>
          
          {applet.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {applet.description}
            </p>
          )}
        </div>
        
        <button
          onClick={runApplet}
          disabled={validationErrors.length > 0 || isRunning}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm disabled:opacity-50"
        >
          {isRunning ? 'Running...' : 'Run Applet'}
        </button>
      </div>
      
      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
          <h3 className="text-lg font-medium mb-2 text-red-800 dark:text-red-300">
            Validation Errors
          </h3>
          <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-400">
            {validationErrors.map((err, index) => (
              <li key={index}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Steps */}
      <div className="mt-6">
        <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
          Steps
        </h3>
        {renderStepResults()}
      </div>
      
      {/* Overall error if any */}
      {error && !currentStep && (
        <div className="mt-4 p-4 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-300">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}
    </div>
  );
} 