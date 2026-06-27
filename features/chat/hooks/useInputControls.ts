// hooks/useInputControls.ts
import { useState, useCallback, useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import useChatBasics from "@/features/chat/hooks/useChatBasics";
import { MatrxRecordId } from "@/types/records";
import { FileManagerReturn } from "@/hooks/ai/chat/useFileManagement";

type ChatMode = "general" | "thinking" | "plan" | "askQuestions" | "research" | "recipes";

interface InputControlsSettings {
    searchEnabled: boolean;
    toolsEnabled: boolean;
    thinkEnabled: boolean;
    researchEnabled: boolean;
    recipesEnabled: boolean;
    planEnabled: boolean;
    audioEnabled: boolean;
    enableAskQuestions: boolean;
    enableBrokers: boolean;
}

interface UseInputControlsProps {
    isDisabled: boolean;
    onSendMessage: () => void;
    fileManager: FileManagerReturn;
    onAddSpecialContent?: (content: string) => void;
}

export default function useInputControls({
    isDisabled,
    onSendMessage,
    fileManager,
    onAddSpecialContent,
}: UseInputControlsProps) {
    const dispatch = useAppDispatch();
    const { chatActions, chatSelectors, messageKey, conversationId } = useChatBasics();
    const messageMetadata = useAppSelector(chatSelectors.activeMessageMetadata);
    const conversationMetadata = useAppSelector(chatSelectors.activeConversationMetadata);
    const currentMode = useAppSelector(chatSelectors.currentMode) || "general";
    const models = useAppSelector(chatSelectors.aiModels);
    
    // Internal state management
    const [isListening, setIsListening] = useState<boolean>(false);
    const [isToolsSheetOpen, setIsToolsSheetOpen] = useState<boolean>(false);
    const [isBrokerSheetOpen, setIsBrokerSheetOpen] = useState<boolean>(false);
    const [hasUploadedFiles, setHasUploadedFiles] = useState<boolean>(false);
    const [settings, setSettings] = useState<InputControlsSettings>({
        searchEnabled: false,
        toolsEnabled: false,
        thinkEnabled: currentMode === "thinking",
        researchEnabled: currentMode === "research",
        recipesEnabled: currentMode === "recipes",
        planEnabled: currentMode === "plan",
        audioEnabled: false,
        enableAskQuestions: currentMode === "askQuestions",
        enableBrokers: false,
    });
    
    const prevSettingsRef = useRef(settings);
    const prevModeRef = useRef<ChatMode>(currentMode as ChatMode);
    
    // Sync Redux mode with our local settings state on initial load
    useEffect(() => {
        if (messageKey) {
            setSettings(prev => ({
                ...prev,
                thinkEnabled: currentMode === "thinking",
                researchEnabled: currentMode === "research",
                recipesEnabled: currentMode === "recipes",
                planEnabled: currentMode === "plan",
                enableAskQuestions: currentMode === "askQuestions"
            }));
        }
    }, [messageKey, currentMode]);
    
    // Update the mode when settings change
    const updateMode = useCallback((newSettings: Partial<InputControlsSettings>) => {
        const updatedSettings = { ...settings, ...newSettings };
        let newMode: ChatMode = "general";
        
        // Determine the new mode based on which settings are enabled
        // Priority matters here - items higher in the list take precedence
        if (updatedSettings.planEnabled) {
            newMode = "plan";
        } else if (updatedSettings.thinkEnabled) {
            newMode = "thinking";
        } else if (updatedSettings.enableAskQuestions) {
            newMode = "askQuestions";
        } else if (updatedSettings.researchEnabled) {
            newMode = "research"; 
        } else if (updatedSettings.recipesEnabled) {
            newMode = "recipes";
        }
        
        // Only update if the mode has changed
        if (newMode !== prevModeRef.current) {
            dispatch(chatActions.updateMode({ value: newMode }));
            prevModeRef.current = newMode;
        }
    }, [settings, dispatch, chatActions]);
    
    // Effect to sync settings with Redux
    useEffect(() => {
        const changedSettings = Object.entries(settings).reduce((acc: any[], [key, value]) => {
            if (prevSettingsRef.current[key as keyof InputControlsSettings] !== value) {
                acc.push({ field: "metadata", nestedKey: key, value });
            }
            return acc;
        }, []);
        
        if (changedSettings.length > 0) {
            dispatch(chatActions.updateMultipleNestedFields({ updates: changedSettings }));
            prevSettingsRef.current = settings;
            
            // Now update the mode based on the new settings
            updateMode(settings);
        }
    }, [settings, dispatch, chatActions, updateMode]);
    
    // Update tools status based on sheet state
    useEffect(() => {
        if (messageMetadata?.availableTools?.length > 0) {
            setSettings((prev) => ({ ...prev, toolsEnabled: true }));
        } else {
            setSettings((prev) => ({ ...prev, toolsEnabled: false }));
        }
    }, [isToolsSheetOpen, messageMetadata?.availableTools]);
    
    // Track file upload status
    useEffect(() => {
        if (!messageKey) return;
        setHasUploadedFiles(messageMetadata?.files?.length > 0);
    }, [messageMetadata?.files, messageKey]);
    
    // Update settings helper
    const updateSettings = useCallback((newSettings: Partial<InputControlsSettings>) => {
        setSettings((prev) => ({ ...prev, ...newSettings }));
    }, []);
    
    // Make sure only one mode is active at a time
    const ensureSingleMode = useCallback((key: keyof InputControlsSettings, value: boolean) => {
        // If turning a mode on, turn off all other mode-related settings
        if (value) {
            const modeKeys: (keyof InputControlsSettings)[] = [
                'thinkEnabled', 'planEnabled', 'enableAskQuestions', 
                'researchEnabled', 'recipesEnabled'
            ];
            
            const resetOtherModes = modeKeys.reduce((acc, modeKey) => {
                if (modeKey !== key) {
                    acc[modeKey] = false;
                }
                return acc;
            }, {} as Partial<InputControlsSettings>);
            
            // Set the requested key and reset others
            updateSettings({ ...resetOtherModes, [key]: value });
        } else {
            // Just turn off the requested mode
            updateSettings({ [key]: value });
        }
    }, [updateSettings]);
    
    // Handler functions with mode handling
    const handleToggleSearch = useCallback(() => {
        updateSettings({ searchEnabled: !settings.searchEnabled });
    }, [settings.searchEnabled, updateSettings]);
    
    const handleToggleTools = useCallback(() => {
        setIsToolsSheetOpen(!isToolsSheetOpen);
    }, [isToolsSheetOpen]);
    
    const handleToggleBrokers = useCallback(() => {
        setIsBrokerSheetOpen(!isBrokerSheetOpen);
        updateSettings({ enableBrokers: !settings.enableBrokers });
    }, [isBrokerSheetOpen, settings.enableBrokers, updateSettings]);
    
    const handleToggleThink = useCallback(() => {
        ensureSingleMode('thinkEnabled', !settings.thinkEnabled);
    }, [settings.thinkEnabled, ensureSingleMode]);
    
    const handleToggleResearch = useCallback(() => {
        ensureSingleMode('researchEnabled', !settings.researchEnabled);
    }, [settings.researchEnabled, ensureSingleMode]);
    
    const handleToggleRecipes = useCallback(() => {
        ensureSingleMode('recipesEnabled', !settings.recipesEnabled);
    }, [settings.recipesEnabled, ensureSingleMode]);
    
    const handleToggleAskQuestions = useCallback(() => {
        ensureSingleMode('enableAskQuestions', !settings.enableAskQuestions);
    }, [settings.enableAskQuestions, ensureSingleMode]);
    
    const handleToggleMicrophone = useCallback(() => {
        setIsListening(!isListening);
        updateSettings({ audioEnabled: !settings.audioEnabled });
    }, [isListening, settings.audioEnabled, updateSettings]);
    
    const handleModelSelect = useCallback(
        (modelKey: MatrxRecordId) => {
            dispatch(chatActions.updateModel({ value: modelKey }));
        },
        [dispatch, chatActions]
    );
    
    const handleTogglePlan = useCallback(() => {
        const newPlanEnabled = !settings.planEnabled;
        ensureSingleMode('planEnabled', newPlanEnabled);
        
        if (newPlanEnabled) {
            dispatch(chatActions.updateModel({ value: "7ad9fc2b-d910-4058-8a94-588ffa026695" }));
            if (onAddSpecialContent) {
                onAddSpecialContent("Please create a structured plan using this audio.");
            }
        }
    }, [settings.planEnabled, ensureSingleMode, dispatch, chatActions, onAddSpecialContent]);
    
    const modelId = messageMetadata?.currentModel || conversationMetadata?.currentModel || "";
    
    return {
        // State
        conversationId,
        settings,
        isListening,
        isToolsSheetOpen,
        isBrokerSheetOpen,
        hasUploadedFiles,
        modelId,
        models,
        currentMode,
        // Handlers
        updateSettings,
        handleToggleSearch,
        handleToggleTools,
        handleToggleBrokers,
        handleToggleThink,
        handleToggleResearch,
        handleToggleRecipes,
        handleToggleAskQuestions,
        handleToggleMicrophone,
        handleModelSelect,
        handleTogglePlan,
        // Sheet controls
        setIsToolsSheetOpen,
        setIsBrokerSheetOpen,
    };
}

export type UseInputControlsReturn = ReturnType<typeof useInputControls>;