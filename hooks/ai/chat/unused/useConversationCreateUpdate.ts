import useCreateUpdateRecord  from "@/app/entities/hooks/crud/useCreateUpdateRecord";
import { getPermanentId } from "@/lib/redux/entity/utils/stateHelpUtils";
import { useMemo, useCallback } from 'react';
import { MatrxRecordId } from "@/types/records";
import { ChatMode, Conversation } from "@/types/chat/chat.types";

const NEW_CONVERSATION_DATA: Partial<Conversation> = {
    label: "New Conversation",
    isPublic: false,
    metadata: {
        currentModel: "",
        currentEndpoint: "",
        currentMode: "general",
        concurrentRecipes: [],
        brokerValues: {},
        availableTools: [],
        ModAssistantContext: "",
        ModUserContext: "",
    },
};

export const useConversationCreateUpdate = () => {
    const { 
        start: coreStart, 
        updateField, 
        updateFields, 
        save: coreSave, 
        currentRecordId, 
        recordDataWithDefaults,
        recordDataWithoutDefaults
    } = useCreateUpdateRecord({ entityKey: "conversation" });

    /**
     * The current conversation data with all defaults applied
     */
    const conversation = useMemo<Conversation>(() => 
        recordDataWithDefaults as Conversation, 
        [recordDataWithDefaults]
    );

    /**
     * The current conversation data without defaults (only explicitly set values)
     */
    const explicitConversationData = useMemo<Partial<Conversation>>(() => 
        recordDataWithoutDefaults as Partial<Conversation>, 
        [recordDataWithoutDefaults]
    );

    /**
     * Start creating a new conversation with default values
     */
    const startNew = useCallback(() => {
        return coreStart(NEW_CONVERSATION_DATA, 'id');
    }, [coreStart]);

    /**
     * Start creating a new conversation with custom initial data
     * This will merge the provided data with the default new conversation data
     */
    const startWithData = useCallback((initialData: Partial<Conversation>) => {
        const mergedData = {
            ...NEW_CONVERSATION_DATA,
            ...initialData,
            metadata: {
                ...NEW_CONVERSATION_DATA.metadata,
                ...(initialData.metadata || {}),
            },
        };
        const tempId = coreStart(mergedData, 'id');
        return tempId
    }, [coreStart, updateField]);

    /**
     * Save the current conversation and get the permanent ID
     */
    const save = useCallback(() => {
        if (!currentRecordId) return null;
        
        coreSave();
        const permanentId = getPermanentId(currentRecordId);
        return permanentId;
    }, [currentRecordId, coreSave]);

    // Convenience methods for updating specific fields

    /**
     * Update the conversation label
     */
    const updateLabel = useCallback((newLabel: string) => {
        updateField('label', newLabel);
    }, [updateField]);

    /**
     * Toggle the public status of the conversation
     */
    const togglePublic = useCallback(() => {
        updateField('isPublic', !conversation.isPublic);
    }, [updateField, conversation.isPublic]);

    /**
     * Set the public status of the conversation
     */
    const setPublic = useCallback((isPublic: boolean) => {
        updateField('isPublic', isPublic);
    }, [updateField]);

    // Metadata update convenience methods

    /**
     * Update the model for the conversation
     */
    const updateModel = useCallback((model: MatrxRecordId) => {
        updateField('metadata.currentModel', model);
    }, [updateField]);

    const updateMode = useCallback((mode: ChatMode) => {
      updateField('metadata.currentMode', mode);
  }, [updateField]);

    /**
     * Update the endpoint for the conversation
     */
    const updateEndpoint = useCallback((endpoint: MatrxRecordId) => {
        updateField('metadata.currentEndpoint', endpoint);
    }, [updateField]);

    /**
     * Update the available tools for the conversation
     */
    const updateAvailableTools = useCallback((tools: string[]) => {
        updateField('metadata.availableTools', tools);
    }, [updateField]);

    /**
     * Add a tool to available tools
     */
    const addTool = useCallback((tool: string) => {
        const currentTools = [...(conversation.metadata?.availableTools || [])];
        if (!currentTools.includes(tool)) {
            currentTools.push(tool);
            updateField('metadata.availableTools', currentTools);
        }
    }, [updateField, conversation.metadata?.availableTools]);

    /**
     * Remove a tool from available tools
     */
    const removeTool = useCallback((tool: string) => {
        const currentTools = [...(conversation.metadata?.availableTools || [])];
        const newTools = currentTools.filter(t => t !== tool);
        updateField('metadata.availableTools', newTools);
    }, [updateField, conversation.metadata?.availableTools]);

    /**
     * Update concurrent recipes
     */
    const updateConcurrentRecipes = useCallback((recipes: MatrxRecordId[]) => {
        updateField('metadata.concurrentRecipes', recipes);
    }, [updateField]);

    /**
     * Add a recipe to concurrent recipes
     */
    const addRecipe = useCallback((recipe: MatrxRecordId) => {
        const currentRecipes = [...(conversation.metadata?.concurrentRecipes || [])];
        if (!currentRecipes.includes(recipe)) {
            currentRecipes.push(recipe);
            updateField('metadata.concurrentRecipes', currentRecipes);
        }
    }, [updateField, conversation.metadata?.concurrentRecipes]);

    /**
     * Remove a recipe from concurrent recipes
     */
    const removeRecipe = useCallback((recipe: MatrxRecordId) => {
        const currentRecipes = [...(conversation.metadata?.concurrentRecipes || [])];
        const newRecipes = currentRecipes.filter(r => r !== recipe);
        updateField('metadata.concurrentRecipes', newRecipes);
    }, [updateField, conversation.metadata?.concurrentRecipes]);

    /**
     * Update a specific broker value
     */
    const updateBrokerValue = useCallback((key: MatrxRecordId, value: unknown) => {
        const updatedBrokerValues = {
            ...(conversation.metadata?.brokerValues || {}),
            [key]: value
        };
        updateField('metadata.brokerValues', updatedBrokerValues);
    }, [updateField, conversation.metadata?.brokerValues]);

    /**
     * Update multiple broker values at once
     */
    const updateBrokerValues = useCallback((values: Record<MatrxRecordId, unknown>) => {
        const updatedBrokerValues = {
            ...(conversation.metadata?.brokerValues || {}),
            ...values
        };
        updateField('metadata.brokerValues', updatedBrokerValues);
    }, [updateField, conversation.metadata?.brokerValues]);

    /**
     * Update the ModAssistantContext
     */
    const updateAssistantContext = useCallback((context: string) => {
        updateField('metadata.ModAssistantContext', context);
    }, [updateField]);

    /**
     * Update the ModUserContext
     */
    const updateUserContext = useCallback((context: string) => {
        updateField('metadata.ModUserContext', context);
    }, [updateField]);

    /**
     * Add a custom metadata field
     */
    const updateMetadataField = useCallback((key: string, value: unknown) => {
        if (key === 'brokerValues' || key === 'concurrentRecipes' || 
            key === 'availableTools' || key === 'currentModel' || 
            key === 'currentEndpoint' || key === 'ModAssistantContext' || 
            key === 'ModUserContext') {
            console.warn(`Use specific method to update ${key} rather than updateMetadataField`);
            return;
        }
        updateField(`metadata.${key}`, value);
    }, [updateField]);

    return {
        // Core operations
        startNew,
        startWithData,
        updateField,
        updateFields,
        save,
        
        // Current state
        currentId: currentRecordId,
        conversation,
        explicitConversationData,
        isCreating: !!currentRecordId,
        
        // Basic field updates
        updateLabel,
        togglePublic,
        setPublic,
        
        // Metadata updates
        updateModel,
        updateMode,
        updateEndpoint,
        updateAvailableTools,
        addTool,
        removeTool,
        updateConcurrentRecipes,
        addRecipe,
        removeRecipe,
        updateBrokerValue,
        updateBrokerValues,
        updateAssistantContext,
        updateUserContext,
        updateMetadataField,
    };
};

export default useConversationCreateUpdate;