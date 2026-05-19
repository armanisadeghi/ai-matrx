// hooks/useUserPreferences.ts
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
    AssistantPreferences,
    CodingPreferences,
    DisplayPreferences,
    PlaygroundPreferences,
    setModulePreferences,
    setPreference,
    VoicePreferences,
} from '@/lib/redux/preferences/userPreferencesSlice';

export const useUserPreferences = () => {
    const dispatch = useAppDispatch();
    const preferences = useAppSelector((state) => state.userPreferences);

    // Playground preferences
    const setPlaygroundPreference = <K extends keyof PlaygroundPreferences>(preference: K, value: PlaygroundPreferences[K]) => {
        dispatch(
            setPreference({
                module: 'playground',
                preference,
                value,
            })
        );
    };

    const updatePlayground = (updates: Partial<PlaygroundPreferences>) => {
        dispatch(
            setModulePreferences({
                module: 'playground',
                preferences: updates,
            })
        );
    };

    // Coding preferences
    const setCodingPreference = <K extends keyof CodingPreferences>(preference: K, value: CodingPreferences[K]) => {
        dispatch(
            setPreference({
                module: 'coding',
                preference,
                value,
            })
        );
    };

    const updateCoding = (updates: Partial<CodingPreferences>) => {
        dispatch(
            setModulePreferences({
                module: 'coding',
                preferences: updates,
            })
        );
    };

    // Display preferences
    const setDisplayPreference = <K extends keyof DisplayPreferences>(preference: K, value: DisplayPreferences[K]) => {
        dispatch(
            setPreference({
                module: 'display',
                preference,
                value,
            })
        );
    };

    const updateDisplay = (updates: Partial<DisplayPreferences>) => {
        dispatch(
            setModulePreferences({
                module: 'display',
                preferences: updates,
            })
        );
    };

    // Voice preferences
    const setVoicePreference = <K extends keyof VoicePreferences>(preference: K, value: VoicePreferences[K]) => {
        dispatch(
            setPreference({
                module: 'voice',
                preference,
                value,
            })
        );
    };

    const updateVoice = (updates: Partial<VoicePreferences>) => {
        dispatch(
            setModulePreferences({
                module: 'voice',
                preferences: updates,
            })
        );
    };

    // Assistant preferences
    const setAssistantPreference = <K extends keyof AssistantPreferences>(preference: K, value: AssistantPreferences[K]) => {
        dispatch(
            setPreference({
                module: 'assistant',
                preference,
                value,
            })
        );
    };

    const updateAssistant = (updates: Partial<AssistantPreferences>) => {
        dispatch(
            setModulePreferences({
                module: 'assistant',
                preferences: updates,
            })
        );
    };

    return {
        preferences,
        // Playground
        setPlaygroundPreference,
        updatePlayground,
        // Coding
        setCodingPreference,
        updateCoding,
        // Display
        setDisplayPreference,
        updateDisplay,
        // Voice
        setVoicePreference,
        updateVoice,
        // Assistant
        setAssistantPreference,
        updateAssistant,
    };
};
