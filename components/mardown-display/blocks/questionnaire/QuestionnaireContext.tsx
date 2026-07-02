"use client";
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { QuestionOption, QuestionSection } from './QuestionnaireRenderer';

type FormState = Record<string, unknown>;

interface QuestionnaireContextType {
    getFormState: (questionnaireId: string) => FormState;
    setFormState: (questionnaireId: string, state: FormState) => void;
    updateFormData: (questionnaireId: string, questionTitle: string, value: unknown, questionType?: string, options?: QuestionOption[]) => void;
    initializeQuestions: (questionnaireId: string, sections: QuestionSection[]) => void;
    clearQuestionnaire: (questionnaireId: string) => void;
}

const QuestionnaireContext = createContext<QuestionnaireContextType | null>(null);

export const useQuestionnaireContext = () => {
    const context = useContext(QuestionnaireContext);
    if (!context) {
        throw new Error('useQuestionnaireContext must be used within a QuestionnaireProvider');
    }
    return context;
};

interface QuestionnaireProviderProps {
    children: React.ReactNode;
}

export const QuestionnaireProvider: React.FC<QuestionnaireProviderProps> = ({ children }) => {
    // Store form states for multiple questionnaires by ID
    const formStates = useRef<Map<string, FormState>>(new Map());
    const [, setForceUpdate] = useState({});

    // Force re-render when form state changes
    const forceUpdate = useCallback(() => {
        setForceUpdate({});
    }, []);

    // Helper functions for question processing
    const isOtherOption = useCallback((option: QuestionOption) => {
        if (!option || typeof option !== "object") return false;
        if (!option.name || typeof option.name !== "string") return false;
        const lowerName = option.name.toLowerCase();
        // Match "Other" exactly or anything starting with "other:"
        return lowerName === "other" || lowerName.startsWith("other:");
    }, []);

    const supportsOtherOption = useCallback((intro = "") => {
        return intro.toLowerCase().includes("with other");
    }, []);

    const extractType = useCallback((intro = "") => {
        const match = intro.match(/Type:\s*([^)]+)(?:\s*\([^)]*\))?/);
        return match ? match[1].trim() : "";
    }, []);

    const getQuestionType = useCallback((typeString = "") => {
        const TYPE_PATTERNS = {
            CHECKBOX: [/checkbox/i, /check.*box/i, /multiple.*choice/i],
            DROPDOWN: [/dropdown/i, /drop.*down/i, /select(?!\s+radio)/i],
            TOGGLE: [/toggle/i, /switch/i, /boolean/i],
            RADIO: [/radio/i, /radio.*button/i],
            SLIDER: [/slider/i, /range/i, /scale/i],
            TEXT: [/text.*area/i, /long.*text/i, /paragraph/i],
            INPUT: [/input/i, /short.*text/i, /single.*line/i],
        };

        for (const [type, patterns] of Object.entries(TYPE_PATTERNS)) {
            if (patterns.some((pattern) => pattern.test(typeString))) {
                return type;
            }
        }
        return "TEXT";
    }, []);

    const normalizeOptions = useCallback((options: QuestionOption[] = [], intro = "", questionType = "") => {
        if (!options || options.length === 0) return [];

        // Filter out any "Other" options provided by the model
        const filteredOptions = options.filter(option => !isOtherOption(option));

        // Determine question type if not provided
        const type = questionType || extractType(intro);
        const normalizedType = getQuestionType(type);

        // Always add "Other" for CHECKBOX and DROPDOWN types (default behavior)
        if (normalizedType === "CHECKBOX" || normalizedType === "DROPDOWN") {
            filteredOptions.push({ name: "Other" });
        }

        return filteredOptions;
    }, [isOtherOption, extractType, getQuestionType]);

    const findOptionsForQuestion = useCallback((sections: QuestionSection[], questionTitle: string) => {
        const questionIndex = sections.findIndex((section) => section.title === questionTitle);
        if (questionIndex === -1) return [];

        const currentSection = sections[questionIndex];

        // First, check if the question section itself has items (new format)
        if (currentSection.items && currentSection.items.length > 0) {
            return currentSection.items;
        }

        // Fall back to checking for a separate "Options:" section (old format)
        const nextSection = sections[questionIndex + 1];
        if (nextSection?.title === "Options:") {
            return nextSection.items || [];
        }

        return [];
    }, []);

    const processQuestionTitle = useCallback((title: string, questionIndex: number) => {
        // Extract existing question number if present
        const existingNumberMatch = title.match(/^Q(\d+):\s*/i);
        if (existingNumberMatch) {
            // Keep the existing number format
            return title;
        }
        
        // If no number exists, add one based on the index
        const cleanTitle = title.replace(/^Question:\s*/i, "");
        return `Q${questionIndex + 1}: ${cleanTitle}`;
    }, []);

    const extractSliderRange = useCallback((intro: string) => {
        if (!intro.includes("Type: Slider")) {
            return null;
        }

        const rangeMatch = intro.match(/Range:\s*([-]?\d+)(?:\s*\([^)]*\))?\s*-\s*([-]?\d+)(?:\s*\([^)]*\))?/);

        if (rangeMatch) {
            return {
                min: parseInt(rangeMatch[1]),
                max: parseInt(rangeMatch[2]),
            };
        }

        return { min: 0, max: 100 };
    }, []);

    const getFormState = useCallback((questionnaireId: string): FormState => {
        return formStates.current.get(questionnaireId) ?? {};
    }, []);

    const setFormState = useCallback((questionnaireId: string, state: FormState) => {
        formStates.current.set(questionnaireId, state);
        forceUpdate();
    }, [forceUpdate]);

    const updateCheckboxData = useCallback((questionTitle: string, options: QuestionOption[], selectedValues: unknown[]): FormState => {
        // Helper function to check if an option is an "Other" option
        const checkIfOtherOption = (option: QuestionOption) => {
            if (!option || typeof option !== "object") return false;
            if (!option.name || typeof option.name !== "string") return false;
            const lowerName = option.name.toLowerCase();
            // Match "Other" exactly or anything starting with "other:"
            return lowerName === "other" || lowerName.startsWith("other:");
        };

        // Create comprehensive checkbox data structure
        const checkboxData: FormState = {};

        // Process all regular options
        options.forEach(option => {
            const optionName = option.name;
            if (checkIfOtherOption(option)) {
                // Handle "Other" option - store the actual text value directly
                const otherValue = selectedValues.find((val): val is string =>
                    typeof val === "string" && val.startsWith("Other:")
                );
                if (otherValue) {
                    // Store the text after "Other: " directly in the "Other" key
                    checkboxData["Other"] = otherValue.replace("Other: ", "");
                } else {
                    checkboxData["Other"] = "Not Selected";
                }
            } else {
                checkboxData[optionName] = selectedValues.includes(optionName) ? "Selected" : "Not Selected";
            }
        });

        return checkboxData;
    }, []);

    const updateDropdownData = useCallback((questionTitle: string, options: QuestionOption[], selectedValue: string): FormState => {
        // Create comprehensive dropdown data structure
        const dropdownData: FormState = {};

        // Process all options
        options.forEach(option => {
            const optionName = option.name;
            if (isOtherOption(option)) {
                // Handle "Other" option - store the actual text value directly
                if (selectedValue && selectedValue.startsWith("Other:")) {
                    dropdownData["Other"] = selectedValue.replace("Other: ", "");
                } else {
                    dropdownData["Other"] = "Not Selected";
                }
            } else {
                dropdownData[optionName] = selectedValue === optionName ? "Selected" : "Not Selected";
            }
        });

        return dropdownData;
    }, [isOtherOption]);

    const updateFormData = useCallback((
        questionnaireId: string,
        questionTitle: string,
        value: unknown,
        questionType: string = 'TEXT',
        options: QuestionOption[] = []
    ) => {
        // Create a shallow copy to avoid mutating the original state object
        const currentState = { ...(formStates.current.get(questionnaireId) ?? {}) };

        if (questionType === "CHECKBOX") {
            const checkboxData = updateCheckboxData(questionTitle, options, value as unknown[]);
            currentState[questionTitle] = checkboxData;
        } else if (questionType === "DROPDOWN") {
            const dropdownData = updateDropdownData(questionTitle, options, value as string);
            currentState[questionTitle] = dropdownData;
        } else {
            currentState[questionTitle] = value;
        }

        formStates.current.set(questionnaireId, currentState);
        forceUpdate();
    }, [updateCheckboxData, updateDropdownData, forceUpdate]);

    const initializeQuestions = useCallback((questionnaireId: string, sections: QuestionSection[]) => {
        // Create a shallow copy to avoid mutating the original state object
        const currentState: FormState = { ...(formStates.current.get(questionnaireId) ?? {}) };
        let hasNewQuestions = false;
        let questionIndex = 0;

        // Process each section to initialize questions with default values
        sections.forEach(section => {
            if (section.intro?.includes("Type:")) {
                const type = extractType(section.intro);
                const questionType = getQuestionType(type);
                const numberedTitle = processQuestionTitle(section.title, questionIndex);
                const rawOptions = findOptionsForQuestion(sections, section.title);
                const options = normalizeOptions(rawOptions, section.intro);

                // Only initialize if question doesn't already exist
                if (!(numberedTitle in currentState)) {
                    hasNewQuestions = true;

                    switch (questionType) {
                        case "SLIDER": {
                            const range = extractSliderRange(section.intro);
                            currentState[numberedTitle] = range ? Math.floor(range.max / 2) : 50;
                            break;
                        }
                        case "TOGGLE":
                            currentState[numberedTitle] = false;
                            break;
                        case "CHECKBOX": {
                            // Initialize checkbox with all options as "Not Selected"
                            const checkboxData: FormState = {};
                            options.forEach(option => {
                                if (isOtherOption(option)) {
                                    checkboxData["Other"] = "Not Selected";
                                } else {
                                    checkboxData[option.name] = "Not Selected";
                                }
                            });
                            currentState[numberedTitle] = checkboxData;
                            break;
                        }
                        case "DROPDOWN": {
                            // Initialize dropdown with all options as "Not Selected"
                            const dropdownData: FormState = {};
                            options.forEach(option => {
                                if (isOtherOption(option)) {
                                    dropdownData["Other"] = "Not Selected";
                                } else {
                                    dropdownData[option.name] = "Not Selected";
                                }
                            });
                            currentState[numberedTitle] = dropdownData;
                            break;
                        }
                        case "RADIO":
                        case "TEXT":
                        case "INPUT":
                            currentState[numberedTitle] = "";
                            break;
                        default:
                            currentState[numberedTitle] = null;
                    }
                }
                questionIndex++;
            }
        });

        // Only update if we added new questions
        if (hasNewQuestions) {
            formStates.current.set(questionnaireId, currentState);
            forceUpdate();
        }
    }, [extractType, getQuestionType, processQuestionTitle, findOptionsForQuestion, normalizeOptions, extractSliderRange, isOtherOption, forceUpdate]);

    const clearQuestionnaire = useCallback((questionnaireId: string) => {
        formStates.current.delete(questionnaireId);
        forceUpdate();
    }, [forceUpdate]);

    const contextValue: QuestionnaireContextType = {
        getFormState,
        setFormState,
        updateFormData,
        initializeQuestions,
        clearQuestionnaire
    };

    return (
        <QuestionnaireContext.Provider value={contextValue}>
            {children}
        </QuestionnaireContext.Provider>
    );
};
