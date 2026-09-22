"use client";

import { cloneVoiceFromFile } from "@/lib/cartesia/cartesiaUtils";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload/file-upload";
import { Input } from "@ai-matrx/design-system";
import { useAiAudio } from "@/features/audio/voice/AiVoicePage";
import { Language } from "@/lib/cartesia/cartesia.types";
import { useState } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";

const VoiceActions = () => {
    const { loading, error, setLoading, setError, smartSetData, smartGetData } = useAiAudio();

    const customVoiceName = smartGetData("customVoiceName") || "";
    const customVoiceDescription = smartGetData("customVoiceDescription") || "";
    const customVoiceFile = smartGetData("customVoiceFile") || null;

    const [language, setLanguage] = useState<Language>(Language.EN);

    const handleCloneVoice = async () => {
        if (!customVoiceFile) {
            setError("Please upload a voice file first");
            return;
        }

        if (!customVoiceName) {
            setError("Voice name is required");
            return;
        }

        try {
            setLoading(true);
            const clonedVoice = await cloneVoiceFromFile(customVoiceFile, {
                name: customVoiceName,
                description: customVoiceDescription,
                language: language,
            });
            smartSetData("customVoices", clonedVoice);
            setLoading(false);
            console.log(clonedVoice);
        } catch (error) {
            setError("Error cloning aiAudio: " + error);
            setLoading(false);
            console.error("Error cloning aiAudio:", error);
        }
    };

    const handleFileUpload = (files: File[]) => {
        setLoading(true);
        smartSetData("customVoiceFile", files[0]);
        setLoading(false);
        console.log("File uploaded:", files[0]);
    };

    const languageOptions = Object.entries(Language).map(([key, value]) => ({
        label: key,
        value,
    }));

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="space-y-4">
                <Input
                    placeholder="Voice Name"
                    value={customVoiceName}
                    onChange={(e) => smartSetData("customVoiceName", e.target.value)}
                    className="w-full"
                    autoComplete="off"
                    required
                />
                <ProTextarea
                    placeholder="Voice Description"
                    value={customVoiceDescription}
                    onChange={(e) => smartSetData("customVoiceDescription", e.target.value)}
                    className="w-full"
                />
            </div>

            <div className="border p-4 rounded-md">
                <h3 className="text-lg font-medium mb-4">Clone a voice from audio</h3>

                <FileUpload onChange={handleFileUpload} />

                <div className="mt-4 space-y-4">
                    <div>
                        <h4 className="font-medium mb-2">Language</h4>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value as Language)}
                            className="w-full p-2 border rounded-md"
                        >
                            {languageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                </div>
            </div>

            <div className="flex justify-center">
                <Button
                    onClick={handleCloneVoice}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!customVoiceFile || !customVoiceName || loading}
                >
                    {loading ? "Cloning..." : "Clone Voice"}
                </Button>
            </div>

            {error && <div className="p-3 bg-destructive/10 text-destructive rounded-md">{error}</div>}

            {smartGetData("clonedVoice") && (
                <div className="text-center">
                    <h2 className="text-xl font-semibold">New Voice Created:</h2>
                    <p className="text-muted-foreground">{smartGetData("clonedVoice")?.name}</p>
                </div>
            )}
        </div>
    );
};

export default VoiceActions;
