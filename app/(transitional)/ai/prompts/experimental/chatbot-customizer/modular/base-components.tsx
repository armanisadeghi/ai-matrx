// components/ui/AICustomizationPanel.tsx
import React, { useState } from "react";
import { Save, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AICustomizationProps, ConfigState, SectionConfig } from "./types";
import { Card } from "@/components/ui/card";
import { SiMagic } from "react-icons/si";

// Section component
// Section component with collapsible functionality
const Section: React.FC<{
    section: SectionConfig;
    state: Record<string, ConfigState>;
    onChange: (sectionId: string, optionId: string, value: any) => void;
}> = ({ section, state, onChange }) => {
    const [isOpen, setIsOpen] = useState(true);

    const handleChange = (optionId: string, value: any) => {
        onChange(section.id, optionId, value);
    };

    const toggleSection = () => {
        setIsOpen(!isOpen);
    };

    return (
        <section className="mb-8 border border-zinc-300 dark:border-zinc-600 rounded-3xl overflow-hidden">
            <div
                className="flex flex-col py-3 px-4 bg-zinc-100 dark:bg-zinc-800 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={toggleSection}
                data-state={isOpen ? "open" : "closed"}
            >
                <div className="flex items-center">
                    <section.icon className="h-5 w-5 mr-2 text-primary flex-shrink-0" />
                    <h2 className="text-xl font-semibold flex-grow">{section.title}</h2>
                    <div className="flex-shrink-0">
                        <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="transform transition-transform duration-200 [data-state=open]:rotate-180"
                            data-state={isOpen ? "open" : "closed"}
                        >
                            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>

                {section.description && <p className="text-sm text-muted-foreground mt-2">{section.description}</p>}
            </div>

            <div
                className="overflow-hidden transition-all duration-300 ease-in-out"
                style={{
                    maxHeight: isOpen ? "2000px" : "0",
                    opacity: isOpen ? 1 : 0,
                    padding: isOpen ? "1rem" : "0 1rem",
                }}
                data-state={isOpen ? "open" : "closed"}
            >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                                <Card className="h-full bg-zinc-100 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-700 rounded-2xl">
                                    <div className="p-5">
                                        <div className="flex items-center mb-4 pb-2 border-b border-border">
                                            <div className="p-1.5 rounded-lg bg-primary/10 text-primary mr-2">
                                                <cardConfig.icon className="h-5 w-5" />
                                            </div>
                                            <h3 className="text-lg font-semibold text-foreground">{cardConfig.title}</h3>
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

// Main component
export const AICustomizationPanel: React.FC<AICustomizationProps> = ({ config, initialState = {}, onSave }) => {
    const [state, setState] = useState<Record<string, ConfigState>>(initialState);

    const handleChange = (sectionId: string, optionId: string, value: any) => {
        setState((prevState) => ({
            ...prevState,
            [sectionId]: {
                ...(prevState[sectionId] || {}),
                [optionId]: value,
            },
        }));
    };

    const handleSave = () => {
        if (onSave) onSave(state);
    };

    return (
        <div className="flex flex-col min-h-screen bg-background text-foreground">
            <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-4 shadow-sm">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center">
                        <Zap className="h-7 w-7 text-primary mr-2" />
                        <h1 className="text-xl font-bold">Customize Your AI Experience</h1>
                    </div>

                    <Button onClick={handleSave} className="flex items-center">
                        <Save className="h-4 w-4 mr-2" />
                        Save My Experience
                    </Button>
                </div>
            </header>

            <main className="flex-1 p-6">
                <div className="max-w-7xl mx-auto">
                    {/* Render all sections */}
                    {config.sections.map((section) => (
                        <Section key={section.id} section={section} state={state} onChange={handleChange} />
                    ))}
                </div>
            </main>
        </div>
    );
};
