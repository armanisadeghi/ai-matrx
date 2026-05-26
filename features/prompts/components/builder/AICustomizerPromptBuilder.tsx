/**
 * AI Customizer Prompt Builder Wrapper
 * 
 * Wraps the modular AI customization panel with prompt creation functionality
 */

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Check } from "lucide-react";
import { usePromptBuilder } from "@/features/prompts/services/promptBuilderService";
import { aiCustomizationConfig } from "@/app/(transitional)/ai/prompts/experimental/chatbot-customizer/modular/aiCustomizationConfig";
import { ConfigState, SectionConfig } from "@/app/(transitional)/ai/prompts/experimental/chatbot-customizer/modular/types";

interface AICustomizerPromptBuilderProps {
    onClose: () => void;
}

// Lightweight Section component that captures changes in real-time
const Section: React.FC<{
    section: SectionConfig;
    state: Record<string, ConfigState>;
    onChange: (sectionId: string, optionId: string, value: any) => void;
}> = ({ section, state, onChange }) => {
    const [isOpen, setIsOpen] = useState(true);

    const handleChange = (optionId: string, value: any) => {
        onChange(section.id, optionId, value);
    };

    return (
        <section className="mb-6 border border-zinc-300 dark:border-zinc-600 rounded-2xl overflow-hidden">
            <div
                className="flex flex-col py-2 px-3 bg-zinc-100 dark:bg-zinc-800 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center">
                    <section.icon className="h-4 w-4 mr-2 text-primary flex-shrink-0" />
                    <h2 className="text-sm font-semibold flex-grow">{section.title}</h2>
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                {section.description && <p className="text-xs text-muted-foreground mt-1">{section.description}</p>}
            </div>

            <div
                className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2000px] opacity-100 p-3' : 'max-h-0 opacity-0 p-0'} overflow-hidden`}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {section.cards.map((cardConfig) => {
                        const CardComponent = cardConfig.component;
                        const sizeClasses = {
                            small: "col-span-1",
                            normal: "col-span-1 md:col-span-1",
                            medium: "col-span-1 md:col-span-2",
                            large: "col-span-1 md:col-span-3",
                        };

                        return (
                            <div key={cardConfig.id} className={sizeClasses[cardConfig.size || "normal"]}>
                                <Card className="h-full bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                                    <div className="p-3">
                                        <div className="flex items-center mb-3 pb-2 border-b border-border">
                                            <div className="p-1 rounded-lg bg-primary/10 text-primary mr-2">
                                                <cardConfig.icon className="h-4 w-4" />
                                            </div>
                                            <h3 className="text-sm font-semibold text-foreground">{cardConfig.title}</h3>
                                        </div>
                                        <CardComponent config={cardConfig} state={state[section.id] || {}} onChange={handleChange} />
                                    </div>
                                </Card>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default function AICustomizerPromptBuilder({ onClose }: AICustomizerPromptBuilderProps) {
    const router = useRouter();
    const { createPrompt } = usePromptBuilder(router, onClose);
    const [isSaving, setIsSaving] = useState(false);
    const [customizationState, setCustomizationState] = useState<Record<string, ConfigState>>({});

    // Generate system message from customization state
    const generateSystemMessage = (state: Record<string, ConfigState>): string => {
        let prompt = "You are an AI assistant with the following characteristics:\n\n";

        // Communication Style
        if (state.communicationStyle) {
            const comm = state.communicationStyle;
            prompt += "**Communication Style:**\n";
            
            if (comm.personality) {
                prompt += `- Personality: ${comm.personality}\n`;
            }
            if (comm.tone) {
                prompt += `- Tone: ${comm.tone}\n`;
            }
            if (comm.verbosity !== undefined) {
                const verbosityLevel = parseInt(comm.verbosity as string) < 30 ? "concise" : parseInt(comm.verbosity as string) > 70 ? "detailed" : "balanced";
                prompt += `- Verbosity: ${verbosityLevel}\n`;
            }
            if (comm.formality !== undefined) {
                const formalityLevel = parseInt(comm.formality as string) < 30 ? "casual" : parseInt(comm.formality as string) > 70 ? "formal" : "balanced";
                prompt += `- Formality: ${formalityLevel}\n`;
            }
            if (comm.emoji) {
                prompt += "- Use emojis appropriately\n";
            }
            if (comm.citations) {
                prompt += "- Provide citations and sources when applicable\n";
            }
            prompt += "\n";
        }

        // Intelligence Capabilities
        if (state.intelligenceCapabilities) {
            const intel = state.intelligenceCapabilities;
            prompt += "**Intelligence & Capabilities:**\n";
            
            if (intel.reasoning !== undefined) {
                const reasoningLevel = parseInt(intel.reasoning as string) < 30 ? "quick and practical" : parseInt(intel.reasoning as string) > 70 ? "deep and thorough" : "balanced";
                prompt += `- Reasoning approach: ${reasoningLevel}\n`;
            }
            if (intel.creativity !== undefined) {
                const creativityLevel = parseInt(intel.creativity as string) < 30 ? "conventional" : parseInt(intel.creativity as string) > 70 ? "innovative and creative" : "balanced";
                prompt += `- Creativity level: ${creativityLevel}\n`;
            }
            if (intel.memory) {
                prompt += "- Remember context from this conversation\n";
            }
            if (intel.expertise && Array.isArray(intel.expertise) && intel.expertise.length > 0) {
                prompt += `- Areas of expertise: ${intel.expertise.join(", ")}\n`;
            }
            prompt += "\n";
        }

        // Output Preferences
        if (state.outputPreferences) {
            const output = state.outputPreferences;
            prompt += "**Output Formatting:**\n";
            
            if (output.stepByStep) {
                prompt += "- Break down complex topics into step-by-step explanations\n";
            }
            if (output.examples) {
                prompt += "- Provide relevant examples when appropriate\n";
            }
            if (output.bulletPoints) {
                prompt += "- Use bullet points for lists and key information\n";
            }
            if (output.codeBlocks) {
                prompt += "- Format code in proper code blocks with syntax highlighting\n";
            }
            if (output.imageGen) {
                prompt += "- Suggest or describe visualizations when helpful\n";
            }
            prompt += "\n";
        }

        // Personal Information
        if (state.personalInfo) {
            const personal = state.personalInfo;
            const hasPersonalInfo = personal.name || personal.city || personal.occupation || personal.interests;
            
            if (hasPersonalInfo) {
                prompt += "**User Context:**\n";
                if (personal.name) {
                    prompt += `- User's name: ${personal.name}\n`;
                }
                if (personal.city) {
                    prompt += `- Location: ${personal.city}\n`;
                }
                if (personal.occupation) {
                    prompt += `- Occupation: ${personal.occupation}\n`;
                }
                if (personal.interests) {
                    prompt += `- Interests: ${personal.interests}\n`;
                }
                prompt += "\n";
            }
        }

        return prompt.trim();
    };

    // Capture state changes in real-time (called whenever user changes anything)
    const handleStateChange = (sectionId: string, optionId: string, value: any) => {
        setCustomizationState((prevState) => ({
            ...prevState,
            [sectionId]: {
                ...(prevState[sectionId] || {}),
                [optionId]: value,
            },
        }));
    };

    const handleCreatePrompt = async () => {
        setIsSaving(true);
        
        try {
            // Generate system message from current state
            let systemMessage = "You are a helpful AI assistant.";
            let autoName = "AI Assistant";

            // If we have customization state, use it
            if (Object.keys(customizationState).length > 0) {
                systemMessage = generateSystemMessage(customizationState);
                
                // Auto-generate name based on personality
                if (customizationState.communicationStyle?.personality) {
                    autoName = `${customizationState.communicationStyle.personality} Assistant`;
                }
            }

            // Use the prompt builder service
            await createPrompt({
                name: autoName,
                systemMessage,
                userMessage: "",
                variableDefaults: [],
            });
            
        } catch (error) {
            console.error('Error in handleCreatePrompt:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Customization Sections - No header, state captured in real-time */}
            <div className="flex-1 overflow-auto p-3">
                <div className="max-w-7xl mx-auto">
                    {aiCustomizationConfig.sections.map((section) => (
                        <Section 
                            key={section.id} 
                            section={section} 
                            state={customizationState} 
                            onChange={handleStateChange} 
                        />
                    ))}
                </div>
            </div>

            {/* Create Button - Single action */}
            <div className="flex-shrink-0 p-3 border-t bg-muted/30">
                <Button
                    onClick={handleCreatePrompt}
                    disabled={isSaving}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                        </>
                    ) : (
                        <>
                            <Check className="h-4 w-4 mr-2" />
                            Create Prompt
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

