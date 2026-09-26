"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/utils/supabase/client";
import {
  RegisteredFunction,
  getFunctionsByCategory,
  getAllRegisteredFunctions,
  executeFunction,
  FunctionDependencies,
} from "@/utils/ts-function-registry/function-registry";
import { registerDatabaseFunctions } from "@/utils/ts-function-registry/register-functions";
import { registerUtilityFunctions } from "@/utils/ts-function-registry/register-utility-functions";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AppletFunctionPickerProps {
  dependencies?: FunctionDependencies;
}

export default function AppletFunctionPicker({
  dependencies = {},
}: AppletFunctionPickerProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [functions, setFunctions] = useState<RegisteredFunction[]>([]);
  const [selectedFunction, setSelectedFunction] =
    useState<RegisteredFunction | null>(null);
  const [functionParams, setFunctionParams] = useState<Record<string, any>>({});
  const [executeResult, setExecuteResult] = useState<any>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Define dependencies to pass to functions
  const allDependencies: FunctionDependencies = {
    supabase,
    // Add more dependencies as needed
    localStorage: typeof window !== "undefined" ? window.localStorage : null,
    fetch: typeof window !== "undefined" ? window.fetch.bind(window) : null,
    ...dependencies,
  };

  // Initialize the function registry only once
  useEffect(() => {
    if (!isInitialized) {
      registerDatabaseFunctions();
      registerUtilityFunctions();
      setIsInitialized(true);

      // Get all available functions and extract categories
      const allFunctions = getAllRegisteredFunctions();
      const uniqueCategories = [
        ...new Set(allFunctions.map((fn) => fn.metadata.category)),
      ];
      setCategories(uniqueCategories);

      if (uniqueCategories.length > 0) {
        setSelectedCategory(uniqueCategories[0]);
      }
    }
  }, [isInitialized]);

  // When category changes, update the available functions
  useEffect(() => {
    if (selectedCategory) {
      const categoryFunctions = getFunctionsByCategory(selectedCategory);
      setFunctions(categoryFunctions);
      setSelectedFunction(null);
      setFunctionParams({});
      setExecuteResult(null);
      setError(null);
    }
  }, [selectedCategory]);

  // When selected function changes, reset parameters
  const handleFunctionChange = (functionName: string) => {
    const fn = functions.find((f) => f.metadata.name === functionName) || null;
    setSelectedFunction(fn);

    // Initialize params with default values
    if (fn) {
      const initialParams: Record<string, any> = {};
      fn.metadata.parameters.forEach((param) => {
        if (param.defaultValue !== undefined) {
          initialParams[param.name] = param.defaultValue;
        } else {
          initialParams[param.name] = "";
        }
      });
      setFunctionParams(initialParams);
    } else {
      setFunctionParams({});
    }

    setExecuteResult(null);
    setError(null);
  };

  // When a parameter input changes
  const handleParamChange = (paramName: string, value: any) => {
    setFunctionParams((prev) => ({
      ...prev,
      [paramName]: value,
    }));
  };

  // Execute the selected function
  const handleExecute = async () => {
    if (!selectedFunction) return;

    setIsExecuting(true);
    setError(null);

    try {
      // Check for required dependencies
      const missingDeps = selectedFunction.requiredDependencies.filter(
        (dep) => !allDependencies[dep],
      );

      if (missingDeps.length > 0) {
        throw new Error(
          `Missing required dependencies: ${missingDeps.join(", ")}`,
        );
      }

      const result = await executeFunction(
        selectedFunction.metadata.name,
        functionParams,
        allDependencies,
      );

      setExecuteResult(result);
    } catch (err) {
      console.error("Error executing function:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsExecuting(false);
    }
  };

  // Render parameter inputs based on function definition
  const renderParamInputs = () => {
    if (!selectedFunction) return null;

    return selectedFunction.metadata.parameters.map((param) => (
      <div key={param.name} className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {param.name}{" "}
          {param.required && <span className="text-red-500">*</span>}
        </label>
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {param.description}
        </div>

        {param.type === "boolean" ? (
          <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
            <Checkbox
              checked={!!functionParams[param.name]}
              onCheckedChange={(v) => handleParamChange(param.name, v === true)}
              className="shrink-0"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Enabled
            </span>
          </label>
        ) : param.type === "object" || param.type === "array" ? (
          <textarea
            value={
              typeof functionParams[param.name] === "object"
                ? JSON.stringify(functionParams[param.name], null, 2)
                : functionParams[param.name]
            }
            onChange={(e) => {
              try {
                const value = e.target.value.trim()
                  ? JSON.parse(e.target.value)
                  : param.type === "array"
                    ? []
                    : {};
                handleParamChange(param.name, value);
              } catch (err) {
                // Allow invalid JSON during typing
                handleParamChange(param.name, e.target.value);
              }
            }}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        ) : (
          <input
            type={param.type === "number" ? "number" : "text"}
            value={functionParams[param.name] || ""}
            onChange={(e) =>
              handleParamChange(
                param.name,
                param.type === "number"
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
            className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required={param.required}
          />
        )}
      </div>
    ));
  };

  return (
    <div className="bg-textured p-6 rounded-lg shadow-lg max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
        Applet Function Picker
      </h2>

      {/* Function Category Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Function Category
        </label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {/* Function Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Function
        </label>
        <select
          value={selectedFunction?.metadata.name || ""}
          onChange={(e) => handleFunctionChange(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 dark:bg-gray-800 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="">Select a function</option>
          {functions.map((fn) => (
            <option key={fn.metadata.name} value={fn.metadata.name}>
              {fn.metadata.displayName}
            </option>
          ))}
        </select>

        {selectedFunction && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {selectedFunction.metadata.description}
          </div>
        )}

        {/* Show required dependencies */}
        {selectedFunction &&
          selectedFunction.requiredDependencies.length > 0 && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
              Required dependencies:{" "}
              {selectedFunction.requiredDependencies.join(", ")}
            </div>
          )}
      </div>

      {/* Function Parameters */}
      {selectedFunction && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-4">
            Function Parameters
          </h3>
          {renderParamInputs()}

          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm disabled:opacity-50"
          >
            {isExecuting ? "Executing..." : "Execute Function"}
          </button>
        </div>
      )}

      {/* Results */}
      {error && (
        <div className="mt-6 p-4 bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-md text-red-800 dark:text-red-200">
          <h3 className="text-lg font-medium mb-2">Error</h3>
          <pre className="whitespace-pre-wrap text-sm">{error}</pre>
          <ErrorAlchemyMenu error={error} />
        </div>
      )}

      {executeResult !== null && !error && (
        <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
          <h3 className="text-lg font-medium mb-2 text-gray-800 dark:text-gray-200">
            Result
          </h3>
          <pre className="whitespace-pre-wrap text-sm bg-textured p-4 rounded-md overflow-x-auto">
            {JSON.stringify(executeResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
