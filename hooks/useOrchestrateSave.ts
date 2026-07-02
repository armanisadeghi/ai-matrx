import { useCallback, useEffect, useRef, useState } from 'react';
import { callbackManager } from '@/utils/callbackManager';

interface SaveResult {
    success: boolean;
    error?: Error;
}

interface SaveOrchestrationContext {
    componentId: string;
    saveType: 'component' | 'main';
}

export interface OrchestrateSaveHook {
    // For child components to register their save functions
    registerComponentSave: (componentId: string, saveFn: () => Promise<void>) => void;
    // For parent to trigger the orchestrated save
    save: () => Promise<void>;
    // Optional: For monitoring save status
    isSaving: boolean;
    savingComponents: Set<string>;
}

export function useOrchestrateSave(
    mainSaveFn: () => Promise<void>,
    options?: {
        onError?: (error: Error, componentId?: string) => void;
        onSaveComplete?: () => void;
    }
) {
    const [isSaving, setIsSaving] = useState(false);
    const [savingComponents, setSavingComponents] = useState<Set<string>>(new Set());
    const activeGroupId = useRef<string | null>(null);
    const componentSaves = useRef<Map<string, () => Promise<void>>>(new Map());
    
    // Cleanup function for when save completes or component unmounts
    const cleanup = useCallback(() => {
        if (activeGroupId.current) {
            callbackManager.removeGroup(activeGroupId.current);
            activeGroupId.current = null;
        }
        setIsSaving(false);
        setSavingComponents(new Set());
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    // Register a component's save function
    const registerComponentSave = useCallback((
        componentId: string,
        saveFn: () => Promise<void>
    ) => {
        componentSaves.current.set(componentId, saveFn);
        
        // Cleanup when component unmounts
        return () => {
            componentSaves.current.delete(componentId);
        };
    }, []);

    // Main save orchestration function
    const save = useCallback(async () => {
        if (isSaving) return;
        setIsSaving(true);
        
        try {
            // Create a new group for this save operation
            activeGroupId.current = callbackManager.createGroup();
            const groupId = activeGroupId.current;
            
            // Create a promise for each component save
            const savePromises: Promise<SaveResult>[] = [];
            const updatedSavingComponents = new Set<string>();
            
            // Register callbacks for each component
            componentSaves.current.forEach((saveFn, componentId) => {
                updatedSavingComponents.add(componentId);
                
                const promise = new Promise<SaveResult>((resolve) => {
                    callbackManager.registerWithContext(
                        (data: SaveResult) => {
                            setSavingComponents(prev => {
                                const updated = new Set(prev);
                                updated.delete(componentId);
                                return updated;
                            });
                            resolve(data);
                        },
                        {
                            groupId,
                            // Satisfies SaveOrchestrationContext; typed as the
                            // manager's CallbackContext bag (no cast needed).
                            context: {
                                componentId,
                                saveType: 'component'
                            }
                        }
                    );
                });
                
                // Execute the save and handle the result
                const executeComponentSave = async () => {
                    try {
                        await saveFn();
                        return { success: true };
                    } catch (error) {
                        if (options?.onError) {
                            options.onError(error as Error, componentId);
                        }
                        return { success: false, error: error as Error };
                    }
                };
                
                savePromises.push(executeComponentSave().then(result => {
                    if (!result.success) {
                        throw result.error;
                    }
                    return result;
                }));
            });
            
            setSavingComponents(updatedSavingComponents);
            
            // Wait for all component saves to complete
            await Promise.all(savePromises);
            
            // Execute the main save
            await mainSaveFn();
            
            options?.onSaveComplete?.();
            
        } catch (error) {
            if (options?.onError) {
                options.onError(error as Error);
            }
            throw error;
        } finally {
            cleanup();
        }
    }, [isSaving, mainSaveFn, cleanup, options]);

    return {
        registerComponentSave,
        save,
        isSaving,
        savingComponents
    };
}

// Example usage in main component:
/*
const { save, registerComponentSave, isSaving, savingComponents } = useOrchestrateSave(
    saveCompiledRecipe,
    {
        onError: (error, componentId) => {
            console.error(`Save failed for ${componentId || 'main'}:`, error);
        },
        onSaveComplete: () => {
            console.log('All saves completed successfully');
        }
    }
);
*/

// Example usage in child component:
/*
useEffect(() => {
    const cleanup = registerComponentSave('editorId', async () => {
        await saveEditorContent();
    });
    
    return cleanup;
}, [registerComponentSave]);
*/