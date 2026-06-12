"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Save, X } from "lucide-react";
import { PromptSettings } from "@/features/prompts/types/core";

interface SettingsJsonEditorProps {
    isOpen: boolean;
    onClose: () => void;
    settings: PromptSettings;
    onSave: (settings: PromptSettings) => void;
}

/**
 * Modal for editing settings as raw JSON
 * Allows manual overrides and testing of any configuration
 * No validation - user is responsible for valid configurations
 */
export function SettingsJsonEditor({
    isOpen,
    onClose,
    settings,
    onSave,
}: SettingsJsonEditorProps) {
    const [jsonText, setJsonText] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Initialize JSON text when modal opens or settings change
    useEffect(() => {
        if (isOpen) {
            setJsonText(JSON.stringify(settings, null, 2));
            setError(null);
        }
    }, [isOpen, settings]);

    const handleSave = () => {
        try {
            const parsed = JSON.parse(jsonText);
            setError(null);
            onSave(parsed);
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid JSON");
        }
    };

    const handleCancel = () => {
        setError(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleCancel}>
            <DialogContent className="max-w-3xl max-h-[80dvh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Edit Settings as JSON</DialogTitle>
                </DialogHeader>

                <div className="flex-1 flex flex-col gap-3 overflow-hidden">

                    {/* JSON editor */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                        <Textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            className="flex-1 font-mono text-xs resize-none"
                            rows={30}
                            placeholder='{"temperature": 0.7, "max_output_tokens": 1024}'
                        />
                    </div>

                    {/* Error display */}
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
                            <strong>JSON Parse Error:</strong> {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

