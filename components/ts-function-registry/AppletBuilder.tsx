"use client";

import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AppletLogic,
  executeAppletLogic,
  getAvailableFunctions,
  validateApplet,
} from "@/utils/ts-function-registry/applet-utils";
import { registerDatabaseFunctions } from "@/utils/ts-function-registry/register-functions";
import { FunctionDependencies } from "@/utils/ts-function-registry/function-registry";
import { supabase } from "@/utils/supabase/client";

export default function AppletBuilder() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [availableFunctions, setAvailableFunctions] = useState<any[]>([]);
  const [functionCategories, setFunctionCategories] = useState<string[]>([]);
  const [applet, setApplet] = useState<AppletLogic>({
    id: "new-applet",
    name: "New Applet",
    description: "",
    steps: [],
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<Record<string, any>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

  // Initialize dependencies
  const dependencies: FunctionDependencies = {
    // Example of providing different types of dependencies that functions might need
    supabase: supabase,
    logger: console,
    localStorage: typeof window !== "undefined" ? window.localStorage : null,
    fetch: fetch,
  };

  // Initialize the registry once
  useEffect(() => {
    if (!isInitialized) {
      // Register all available functions
      registerDatabaseFunctions();
      setIsInitialized(true);

      // Get function information for the UI
      const functions = getAvailableFunctions();
      setAvailableFunctions(functions);

      // Extract unique categories
      const categories = [...new Set(functions.map((fn) => fn.category))];
      setFunctionCategories(categories);
    }
  }, [isInitialized]);

  // Add a step to the applet
  const addStep = (functionName: string) => {
    // Find the function details
    const fnDetails = availableFunctions.find((fn) => fn.name === functionName);
    if (!fnDetails) return;

    // Create a new step with default parameters
    const newStep: AppletStep = {
      id: `step-${Date.now()}`,
      type: "function",
      functionName: functionName,
      title: fnDetails.displayName,
      description: "",
      parameters: {},
    };

    // Pre-populate with default values where available
    fnDetails.parameters.forEach((param: any) => {
      if (param.defaultValue !== undefined) {
        newStep.parameters[param.name] = param.defaultValue;
      } else if (param.required) {
        // Add placeholder values for required parameters based on type
        switch (param.type) {
          case "string":
            newStep.parameters[param.name] = "";
            break;
          case "number":
            newStep.parameters[param.name] = 0;
            break;
          case "boolean":
            newStep.parameters[param.name] = false;
            break;
          case "object":
            newStep.parameters[param.name] = {};
            break;
          case "array":
            newStep.parameters[param.name] = [];
            break;
        }
      }
    });

    // Add the new step to the applet
    setApplet((prev) => ({
      ...prev,
      steps: [...prev.steps, newStep],
    }));
  };

  // Update a step's parameter
  const updateStepParameter = (
    stepId: string,
    paramName: string,
    value: any,
  ) => {
    setApplet((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === stepId
          ? { ...step, parameters: { ...step.parameters, [paramName]: value } }
          : step,
      ),
    }));
  };

  // Remove a step
  const removeStep = (stepId: string) => {
    setApplet((prev) => ({
      ...prev,
      steps: prev.steps.filter((step) => step.id !== stepId),
    }));
  };

  // Execute the applet
  const executeApplet = async () => {
    setIsExecuting(true);
    setError(null);

    try {
      // Gather available dependencies for validation
      const availableDependencyNames = Object.keys(dependencies);

      // Validate the applet
      const validation = validateApplet(applet, availableDependencyNames);
      if (!validation.valid) {
        setError(`Validation failed: ${validation.errors.join(", ")}`);
        setIsExecuting(false);
        return;
      }

      // Execute the applet
      const result = await executeAppletLogic(dependencies, applet);

      if (result.success) {
        setExecutionResults(result.results);
      } else {
        setError(result.error || "Execution failed");
      }
    } catch (err) {
      console.error("Error executing applet:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsExecuting(false);
    }
  };

  // Render the UI
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
        Applet Builder
      </h1>

      {/* Applet Name and Description */}
      <div className="mb-4">
        <input
          type="text"
          value={applet.name}
          onChange={(e) =>
            setApplet((prev) => ({ ...prev, name: e.target.value }))
          }
          className="w-full p-2 mb-2 rounded-md border border-border bg-textured text-gray-800 dark:text-gray-200"
          placeholder="Applet Name"
        />
        <textarea
          value={applet.description || ""}
          onChange={(e) =>
            setApplet((prev) => ({ ...prev, description: e.target.value }))
          }
          className="w-full p-2 rounded-md border border-border bg-textured text-gray-800 dark:text-gray-200"
          placeholder="Description"
          rows={2}
        />
      </div>

      {/* Add Step Dropdown */}
      <div className="mb-4">
        <label className="block mb-2 text-gray-700 dark:text-gray-300">
          Add Function Step:
        </label>
        <div className="flex">
          <select
            className="flex-1 p-2 rounded-md border border-border bg-textured text-gray-800 dark:text-gray-200 mr-2"
            onChange={(e) => e.target.value && addStep(e.target.value)}
            value=""
          >
            <option value="">Select a function...</option>
            {functionCategories.map((category) => (
              <optgroup key={category} label={category}>
                {availableFunctions
                  .filter((fn) => fn.category === category)
                  .map((fn) => (
                    <option key={fn.name} value={fn.name}>
                      {fn.displayName}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Steps Display */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2 text-gray-800 dark:text-gray-200">
          Steps: {applet.steps.length > 0 ? applet.steps.length : "None"}
        </h2>

        {applet.steps.map((step, index) => {
          const fnDetails = availableFunctions.find(
            (fn) => fn.name === step.functionName,
          );

          return (
            <div
              key={step.id}
              className="mb-3 p-3 rounded-md border border-border bg-textured"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-gray-800 dark:text-gray-200">
                  {index + 1}. {step.title || step.functionName}
                </h3>
                <button
                  onClick={() => removeStep(step.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              {/* Step Parameters */}
              {fnDetails?.parameters.map((param) => (
                <div key={`${step.id}-${param.name}`} className="mb-2">
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {param.name}
                    {param.required ? " *" : ""}:
                  </label>

                  {param.type === "boolean" ? (
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={!!step.parameters[param.name]}
                        onCheckedChange={(v) =>
                          updateStepParameter(step.id, param.name, v === true)
                        }
                        className="shrink-0"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Yes
                      </span>
                    </label>
                  ) : param.type === "object" || param.type === "array" ? (
                    <textarea
                      value={
                        typeof step.parameters[param.name] === "object"
                          ? JSON.stringify(step.parameters[param.name], null, 2)
                          : String(step.parameters[param.name] ?? "")
                      }
                      onChange={(e) => {
                        try {
                          const value = e.target.value.trim()
                            ? JSON.parse(e.target.value)
                            : param.type === "array"
                              ? []
                              : {};
                          updateStepParameter(step.id, param.name, value);
                        } catch (err) {
                          updateStepParameter(
                            step.id,
                            param.name,
                            e.target.value,
                          );
                        }
                      }}
                      rows={3}
                      className="w-full p-2 rounded-md border border-border bg-textured text-gray-800 dark:text-gray-200"
                    />
                  ) : (
                    <input
                      type={param.type === "number" ? "number" : "text"}
                      value={String(step.parameters[param.name] ?? "")}
                      onChange={(e) =>
                        updateStepParameter(
                          step.id,
                          param.name,
                          param.type === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                        )
                      }
                      className="w-full p-2 rounded-md border border-border bg-textured text-gray-800 dark:text-gray-200"
                    />
                  )}

                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {param.description}
                  </p>
                </div>
              ))}

              {/* Dependency Requirements Display */}
              {fnDetails?.requiredDependencies.length > 0 && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  Required dependencies:{" "}
                  {fnDetails.requiredDependencies.join(", ")}
                </div>
              )}

              {/* Step Results (if executed) */}
              {executionResults[step.id] && (
                <div className="mt-3 pt-3 border-t border-border">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Result:
                  </h4>
                  <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                    {JSON.stringify(executionResults[step.id], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Execute Button */}
      {applet.steps.length > 0 && (
        <button
          onClick={executeApplet}
          disabled={isExecuting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm disabled:opacity-50"
        >
          {isExecuting ? "Executing..." : "Execute Applet"}
        </button>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

// Helper interfaces
interface AppletStep {
  id: string;
  type: "function";
  functionName: string;
  parameters: Record<string, any>;
  title: string;
  description?: string;
}
