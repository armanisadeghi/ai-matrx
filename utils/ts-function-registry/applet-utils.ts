'use client';

import { executeFunction, getRegisteredFunction, getAllRegisteredFunctions, getFunctionsByCategory, FunctionDependencies } from './function-registry';

export interface AppletStep {
  id: string;
  type: 'function';
  functionName: string;
  parameters: Record<string, unknown>;
  title: string;
  description?: string;
}

export interface AppletLogic {
  id: string;
  name: string;
  description?: string;
  steps: AppletStep[];
}

/**
 * Execute a sequence of applet steps
 */
export async function executeAppletLogic(
  dependencies: FunctionDependencies,
  applet: AppletLogic,
  initialState: Record<string, unknown> = {}
): Promise<{
  success: boolean;
  results: Record<string, unknown>;
  error?: string;
  failedStep?: string;
}> {
  // Create a state object that will be updated as each step executes
  const state = { ...initialState };
  const results: Record<string, unknown> = {};
  
  try {
    // Execute each step in sequence
    for (const step of applet.steps) {
      if (step.type !== 'function') {
        // Skip non-function steps (could expand to support other step types)
        continue;
      }
      
      // Check if function exists
      const fn = getRegisteredFunction(step.functionName);
      if (!fn) {
        return {
          success: false,
          results,
          error: `Function ${step.functionName} not found`,
          failedStep: step.id
        };
      }
      
      // Check for required dependencies
      const missingDeps = fn.requiredDependencies.filter(dep => !dependencies[dep]);
      if (missingDeps.length > 0) {
        return {
          success: false,
          results,
          error: `Missing required dependencies for function ${step.functionName}: ${missingDeps.join(', ')}`,
          failedStep: step.id
        };
      }
      
      // Prepare parameters with potential template variables
      const processedParams = await processParameters(step.parameters, state);
      
      // Execute the function
      const stepResult = await executeFunction(step.functionName, processedParams, dependencies);
      
      // Store the result in both the state and results objects
      state[step.id] = stepResult;
      results[step.id] = stepResult;
    }
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Error executing applet logic:', error);
    return {
      success: false,
      results,
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      failedStep: applet.steps.find(s => !results[s.id])?.id
    };
  }
}

/**
 * Process parameters to resolve template variables
 * Example: {value: "{{step1.id}}"} would be replaced with the actual value
 */
async function processParameters(
  params: Record<string, unknown>,
  state: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const processedParams: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.match(/^\{\{.*\}\}$/)) {
      // Extract variable path from template {{stepId.property.subproperty}}
      const path = value.slice(2, -2).trim().split('.');

      // Traverse the state object to get the referenced value
      let current: unknown = state;
      for (const segment of path) {
        if (current === undefined || current === null || typeof current !== 'object') {
          break;
        }
        current = (current as Record<string, unknown>)[segment];
      }

      processedParams[key] = current;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects and arrays
      processedParams[key] = await processParameters(value as Record<string, unknown>, state);
    } else {
      // Keep primitive values as-is
      processedParams[key] = value;
    }
  }

  return processedParams;
}

/**
 * Get a simplified representation of available functions for applet building UI
 */
export function getAvailableFunctions() {
  return getAllRegisteredFunctions().map(fn => ({
    name: fn.metadata.name,
    displayName: fn.metadata.displayName,
    description: fn.metadata.description,
    category: fn.metadata.category,
    parameters: fn.metadata.parameters.map(param => ({
      name: param.name,
      type: param.type,
      description: param.description,
      required: param.required,
      defaultValue: param.defaultValue
    })),
    requiredDependencies: fn.requiredDependencies
  }));
}

/**
 * Validate an applet definition to ensure all functions exist and required parameters are provided
 */
export function validateApplet(
  applet: AppletLogic,
  availableDependencies: string[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!applet.name || !applet.name.trim()) {
    errors.push('Applet name is required');
  }
  
  if (!applet.steps || !Array.isArray(applet.steps) || applet.steps.length === 0) {
    errors.push('Applet must have at least one step');
  } else {
    // Validate each step
    applet.steps.forEach((step, index) => {
      if (step.type !== 'function') {
        errors.push(`Step ${index + 1}: Unsupported step type "${step.type}"`);
        return;
      }
      
      // Check if function exists
      const fn = getRegisteredFunction(step.functionName);
      if (!fn) {
        errors.push(`Step ${index + 1}: Function "${step.functionName}" not found`);
        return;
      }
      
      // Check for dependencies
      const missingDeps = fn.requiredDependencies.filter(dep => !availableDependencies.includes(dep));
      if (missingDeps.length > 0) {
        errors.push(`Step ${index + 1}: Missing required dependencies: ${missingDeps.join(', ')}`);
      }
      
      // Check required parameters
      fn.metadata.parameters.forEach(param => {
        if (param.required && 
            (step.parameters === undefined || 
             step.parameters[param.name] === undefined)) {
          errors.push(`Step ${index + 1}: Missing required parameter "${param.name}" for function "${step.functionName}"`);
        }
      });
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
} 