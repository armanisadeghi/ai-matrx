"use client";

/**
 * usePromptExecution Hook
 * 
 * Provides a simple API for executing prompts programmatically.
 * Returns an execute function that handles the full execution lifecycle.
 * 
 * This is the ORIGINAL hook for programmatic prompt execution.
 * For UI-based execution (with state management), use usePromptExecutionCore.
 */

import { replaceVariablesInText } from '../utils/variable-resolver';
import { v4 as uuidv4 } from 'uuid';
import type { 
  PromptExecutionConfig, 
  ExecutionResult, 
  UsePromptExecutionReturn,
  ExecutionError,
  ExecutionProgress
} from '../types/execution';
import type { PromptMessage } from '../types/core';

// Helper functions
export function createSimpleVariables(vars: Record<string, string>) {
  const result: Record<string, any> = {};
  Object.entries(vars).forEach(([key, value]) => {
    result[key] = { type: 'hardcoded', value };
  });
  return result;
}

export function createRuntimeVariable(name: string, getValue: () => string | Promise<string>) {
  return { [name]: { type: 'runtime', getValue } };
}

export function createFunctionVariable(name: string, fn: (context?: any) => string | Promise<string>) {
  return { [name]: { type: 'function', fn } };
}

/**
 * Hook for programmatic prompt execution
 */
export function usePromptExecution(): UsePromptExecutionReturn {
  const dispatch = useAppDispatch();
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExecutionProgress | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  
  const streamingText = useAppSelector(state => 
    currentTaskId ? '' : ""
  );
  
  const isResponseEnded = useAppSelector(state =>
    currentTaskId ? true : false
  );

  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (config: PromptExecutionConfig): Promise<ExecutionResult> => {
    setIsExecuting(true);
    setError(null);
    setProgress({ status: 'initializing' });
    
    const startTime = Date.now();
    const taskId = uuidv4();
    
    try {
      // Resolve variables
      setProgress({ status: 'resolving-variables', message: 'Resolving variables...' });
      const resolvedVariables: Record<string, string> = {};
      
      if (config.variables) {
        for (const [key, source] of Object.entries(config.variables)) {
          if (source.type === 'hardcoded') {
            resolvedVariables[key] = source.value;
          } else if (source.type === 'runtime') {
            resolvedVariables[key] = await source.getValue();
          } else if (source.type === 'function') {
            resolvedVariables[key] = await source.fn(config.context);
          }
          // Add other source types as needed
        }
      }

      // Fetch prompt if needed
      let promptData = config.promptData;
      if (!promptData && config.promptId) {
        setProgress({ status: 'initializing', message: 'Fetching prompt...' });
        const response = await fetch(`/api/prompts/${config.promptId}`);
        if (!response.ok) throw new Error('Failed to fetch prompt');
        promptData = await response.json();
      }

      if (!promptData) {
        throw new Error('No prompt data provided');
      }

      // Replace variables in messages
      const messages: PromptMessage[] = (promptData.messages || []).map(msg => ({
        ...msg,
        content: replaceVariablesInText(msg.content, resolvedVariables)
      }));

      // Add user input if provided
      if (config.userInput) {
        const userContent = typeof config.userInput === 'function' 
          ? await config.userInput() 
          : config.userInput;
        
        messages.push({
          role: 'user',
          content: userContent
        });
      }

      // Execute
      setProgress({ status: 'executing', message: 'Executing prompt...' });
      setCurrentTaskId(taskId);

      const settings = promptData.settings || {};
      const chatConfig = {
        model_id: config.modelConfig?.modelId || config.modelConfig?.model_id || (settings as any).model_id,
        messages,
        stream: true,
        ...settings,
        ...config.modelConfig,
      };

      await dispatch(createAndSubmitTask({
        service: "chat_service",
        taskName: "direct_chat",
        taskData: { chat_config: chatConfig },
        customTaskId: taskId,
      })).unwrap();

      // Wait for completion
      setProgress({ status: 'streaming', message: 'Streaming response...' });
      
      // Poll for completion
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          // This will be updated by the selector
          if (isResponseEnded) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });

      const duration = Date.now() - startTime;

      const executionResult: ExecutionResult = {
        success: true,
        text: streamingText,
        metadata: {
          promptId: promptData.id || config.promptId || '',
          promptName: promptData.name || '',
          taskId,
          duration,
          model: chatConfig.model_id,
        },
        resolvedVariables,
      };

      setResult(executionResult);
      setProgress({ status: 'complete' });
      
      return executionResult;

    } catch (err: any) {
      const executionError: ExecutionError = {
        stage: 'execution',
        message: err.message || 'Unknown error',
        details: err,
      };

      setError(err.message);
      config.onError?.(executionError);

      return {
        success: false,
        text: '',
        metadata: {
          promptId: config.promptId || '',
          promptName: '',
          taskId,
          duration: Date.now() - startTime,
        },
        error: executionError,
        resolvedVariables: {},
      };
    } finally {
      setIsExecuting(false);
      setCurrentTaskId(null);
    }
  }, [dispatch, streamingText, isResponseEnded]);

  const reset = useCallback(() => {
    setIsExecuting(false);
    setCurrentTaskId(null);
    setError(null);
    setProgress(null);
    setResult(null);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsExecuting(false);
    setCurrentTaskId(null);
  }, []);

  return {
    execute,
    isExecuting,
    streamingText,
    currentTaskId,
    isResponseEnded,
    progress,
    result,
    error,
    reset,
    cancel,
  };
}
