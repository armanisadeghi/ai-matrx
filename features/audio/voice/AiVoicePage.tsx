"use client";

import React, { useEffect } from "react";
import { aiAudioInitialState } from "./aiVoiceModuleConfig";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VoicesList from "./VoicesList";
import VoiceActions from "./VoiceActions";
import VoicePlayground from "./VoicePlayground";
import { createUseModuleHook } from "@/lib/hooks/useModule";
import { AiAudioSchema } from "@/types/aiAudioTypes";

export const useAiAudio = createUseModuleHook<AiAudioSchema>("aiAudio", aiAudioInitialState);

const AiVoicePage: React.FC = () => {
    const {
        initiated,
        data,
        configs,
        userPreferences,
        loading,
        error,
        setInitiated,
        setLoading,
        setError,
        setData,
        setConfigs,
        setUserPreferences,
        updateData,
        updateConfigs,
        updateUserPreferences,
    } = useAiAudio();

    useEffect(() => {
        const initializeModule = async () => {
            if (!initiated) {
                console.log("Initializing module");
                setLoading(true);
                try {
                    const savedData = localStorage.getItem("aiAudioData");
                    const savedConfigs = localStorage.getItem("aiAudioConfigs");
                    const savedPreferences = localStorage.getItem("aiAudioPreferences");

                    if (savedData) {
                        const parsedData = JSON.parse(savedData);
                        updateData(parsedData);
                    }
                    if (savedConfigs) {
                        const parsedConfigs = JSON.parse(savedConfigs);
                        updateConfigs(parsedConfigs);
                    }
                    if (savedPreferences) {
                        const parsedPreferences = JSON.parse(savedPreferences);
                        updateUserPreferences(parsedPreferences);
                    }

                    setInitiated(true);
                } catch (err) {
                    console.error("Error during initialization:", err);
                    setError(err instanceof Error ? err.message : "An error occurred during initialization");
                } finally {
                    setLoading(false);
                }
            }
        };

        initializeModule();
    }, [initiated, setInitiated, setLoading, setError, updateData, updateConfigs, updateUserPreferences]);

    useEffect(() => {
        if (initiated) {
            console.log("Module initiated, current data:", data);
            localStorage.setItem("aiAudioData", JSON.stringify(data));
            localStorage.setItem("aiAudioConfigs", JSON.stringify(configs));
            localStorage.setItem("aiAudioPreferences", JSON.stringify(userPreferences));
        }
    }, [initiated, data, configs, userPreferences]);

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-destructive">
                {error}
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-6 bg-background text-foreground">
            <Tabs defaultValue="playground" className="w-full">
                <TabsList className="mb-6">
                    <TabsTrigger value="playground">Voice Playground</TabsTrigger>
                    <TabsTrigger value="voices">Matrx Voices</TabsTrigger>
                    <TabsTrigger value="actions">Create Custom Voices</TabsTrigger>
                </TabsList>
                <TabsContent value="voices">
                    <div className="bg-card rounded-lg shadow-lg p-6">
                        <h2 className="text-2xl font-semibold mb-4">Available Matrx Voices</h2>
                        <VoicesList />
                    </div>
                </TabsContent>
                <TabsContent value="actions">
                    <div className="bg-card rounded-lg shadow-lg p-6">
                        <h2 className="text-2xl font-semibold mb-4">Custom Voice Creation</h2>
                        <VoiceActions />
                    </div>
                </TabsContent>
                <TabsContent value="playground">
                    <div className="bg-card rounded-lg shadow-lg p-6">
                        <h2 className="text-2xl font-semibold mb-4">Voice Playground</h2>
                        <VoicePlayground />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default AiVoicePage;
