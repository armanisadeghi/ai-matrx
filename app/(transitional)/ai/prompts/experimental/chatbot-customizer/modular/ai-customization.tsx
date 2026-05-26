// pages/ai-customization.tsx
import React, { useState } from 'react';
import { AICustomizationPanel } from './base-components';
import { aiCustomizationConfig, defaultAICustomizationState } from './aiCustomizationConfig';
import { useToast } from "@/components/ui/use-toast";

export default function AICustomizationPage() {
  const { toast } = useToast();
  const [savedState, setSavedState] = useState(defaultAICustomizationState);
  
  const handleSave = (state: any) => {
    console.log('Saving configuration:', state);
    setSavedState(state);
    
    // Here you would typically send this to your backend
    // Example: sendToBackend(mapToSystemPrompt(state));
    
    toast({
      title: "Settings saved",
      description: "Your AI customization settings have been saved successfully.",
    });
  };
  
  // This function would convert the UI state to your system prompt format
  const mapToSystemPrompt = (state: any) => {
    // Example of how you might start transforming the settings
    const promptParts = [];
    
    // Personality and communication style
    if (state.communicationStyle?.personality) {
      const personalityMap = {
        friendly: "The assistant is friendly, warm, and approachable in its responses.",
        professional: "The assistant maintains a professional, precise, and concise tone.",
        enthusiastic: "The assistant is enthusiastic, energetic, and positive in its communication.",
        balanced: "The assistant keeps a balanced, neutral, and adaptable communication style.",
        academic: "The assistant uses an academic, detailed, and analytical approach to responses."
      };
      
      promptParts.push(personalityMap[state.communicationStyle.personality] || "");
    }
    
    // Verbosity
    if (state.communicationStyle?.verbosity !== undefined) {
      const verbosity = state.communicationStyle.verbosity;
      if (verbosity < 30) {
        promptParts.push("The assistant provides brief, concise responses.");
      } else if (verbosity > 70) {
        promptParts.push("The assistant provides detailed, comprehensive responses.");
      } else {
        promptParts.push("The assistant provides balanced responses with appropriate detail.");
      }
    }

    // Tone
    if (state.communicationStyle?.tone) {
      const toneMap = {
        neutral: "The assistant maintains a neutral tone.",
        casual: "The assistant uses a casual, conversational tone.",
        formal: "The assistant employs a formal tone.",
        humorous: "The assistant incorporates appropriate humor in its responses.",
        empathetic: "The assistant responds with empathy and understanding.",
        direct: "The assistant communicates in a direct, straightforward manner."
      };
      
      promptParts.push(toneMap[state.communicationStyle.tone] || "");
    }
    
    // Add more mappings here based on your desired system prompt structure
    
    // Personal information (if provided)
    if (state.personalInfo?.name) {
      promptParts.push(`The user's name is ${state.personalInfo.name}.`);
    }
    
    if (state.personalInfo?.occupation) {
      promptParts.push(`The user works as a ${state.personalInfo.occupation}.`);
    }
    
    if (state.personalInfo?.interests) {
      promptParts.push(`The user is interested in ${state.personalInfo.interests}.`);
    }
    
    // Join all parts into a complete system prompt
    return promptParts.join(" ");
  };
  
  return (
    <div>
      <AICustomizationPanel 
        config={aiCustomizationConfig} 
        initialState={savedState}
        onSave={handleSave}
      />
      
      {/* Optionally show a preview of how the settings translate to a system prompt */}
      {false && (
        <div className="max-w-7xl mx-auto mt-8 p-6 bg-card border border-border rounded-xl">
          <h2 className="text-xl font-bold mb-4">System Prompt Preview</h2>
          <pre className="bg-muted p-4 rounded-md overflow-auto">
            {mapToSystemPrompt(savedState)}
          </pre>
        </div>
      )}
    </div>
  );
}

