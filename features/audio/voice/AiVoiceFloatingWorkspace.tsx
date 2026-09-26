"use client";

import React, { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import VoicesList from "./VoicesList";
import VoiceActions from "./VoiceActions";
import VoicePlayground from "./VoicePlayground";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useAiAudio } from "./AiVoicePage"; // We'll share the hook from here or should it be separated?

const AiVoiceFloatingWorkspace: React.FC = () => {
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
        updateData,
        updateConfigs,
        updateUserPreferences,
    } = useAiAudio();

    useEffect(() => {
        const initializeModule = async () => {
            if (!initiated) {
                setLoading(true);
                try {
                    const savedData = localStorage.getItem("aiAudioData");
                    const savedConfigs = localStorage.getItem("aiAudioConfigs");
                    const savedPreferences = localStorage.getItem("aiAudioPreferences");

                    if (savedData) updateData(JSON.parse(savedData));
                    if (savedConfigs) updateConfigs(JSON.parse(savedConfigs));
                    if (savedPreferences) updateUserPreferences(JSON.parse(savedPreferences));

                    setInitiated(true);
                } catch (err) {
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
            localStorage.setItem("aiAudioData", JSON.stringify(data));
            localStorage.setItem("aiAudioConfigs", JSON.stringify(configs));
            localStorage.setItem("aiAudioPreferences", JSON.stringify(userPreferences));
        }
    }, [initiated, data, configs, userPreferences]);

    if (loading) {
        return (
            <div className="flex w-full h-full items-center justify-center text-muted-foreground p-6">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                <span className="text-sm font-medium">Initializing Voice Engine...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex w-full h-full items-center justify-center p-6 text-sm text-destructive text-center">
                <span className="font-semibold">{error}</span>
              <ErrorAlchemyMenu error={error} />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full min-h-0 bg-background text-foreground">
            <Tabs defaultValue="playground" className="flex flex-col h-full flex-1 min-h-0">
                <div className="shrink-0 px-3 py-2 border-b border-border bg-muted/20">
                    <TabsList className="w-full grid grid-cols-3 h-8 text-[11px]">
                        <TabsTrigger value="playground" className="text-[11px] h-6 py-0">Playground</TabsTrigger>
                        <TabsTrigger value="voices" className="text-[11px] h-6 py-0">Voices</TabsTrigger>
                        <TabsTrigger value="actions" className="text-[11px] h-6 py-0">Custom</TabsTrigger>
                    </TabsList>
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <TabsContent value="playground" className="h-full m-0 p-3">
                        <VoicePlayground />
                    </TabsContent>
                    <TabsContent value="voices" className="h-full m-0 p-3">
                        <VoicesList />
                    </TabsContent>
                    <TabsContent value="actions" className="h-full m-0 p-3">
                        <VoiceActions />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};

export default AiVoiceFloatingWorkspace;
