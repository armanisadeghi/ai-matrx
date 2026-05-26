"use client";

import React from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PromptSettings } from "@/features/prompts/types/core";


interface ModelConfigurationProps {
    model: string;
    models: any[];
    onModelChange: (value: string) => void;
    modelConfig: PromptSettings;
    onSettingsClick: () => void;
}

export function ModelConfiguration({ model, models, onModelChange, modelConfig, onSettingsClick }: ModelConfigurationProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Model</Label>
                <Select value={model} onValueChange={onModelChange}>
                    <SelectTrigger className="h-8 bg-transparent text-gray-700 dark:text-gray-500 border-none hover:bg-gray-200 dark:hover:bg-gray-700 w-auto min-w-[180px] text-xs focus-none">
                        <SelectValue>
                            {models.find(m => m.id === model)?.common_name || model}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="max-h-[400px]">
                        {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.common_name || m.id}
                                {m.is_deprecated && <span className="text-xs text-gray-400 ml-2">(deprecated)</span>}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    onClick={onSettingsClick}
                >
                    <Settings2 className="w-3.5 h-3.5 mr-1" />
                </Button>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
                {modelConfig.response_format && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        format: <span className="text-green-600 dark:text-green-400">{typeof modelConfig.response_format === 'object' ? (modelConfig.response_format as any).type : modelConfig.response_format}</span>
                    </span>
                )}
                {typeof modelConfig.temperature === 'number' && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        temp: <span className="text-green-600 dark:text-green-400">{modelConfig.temperature.toFixed(2)}</span>
                    </span>
                )}
                {typeof modelConfig.max_output_tokens === 'number' && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        tokens: <span className="text-green-600 dark:text-green-400">{modelConfig.max_output_tokens}</span>
                    </span>
                )}
                {typeof modelConfig.top_p === 'number' && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        top_p: <span className="text-green-600 dark:text-green-400">{modelConfig.top_p.toFixed(2)}</span>
                    </span>
                )}
                {typeof modelConfig.top_k === 'number' && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        top_k: <span className="text-green-600 dark:text-green-400">{modelConfig.top_k}</span>
                    </span>
                )}
                {modelConfig.tools && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 rounded font-mono">
                        tools
                    </span>
                )}
                {typeof modelConfig.store === 'boolean' && (
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
                        store: <span className="text-green-600 dark:text-green-400">{modelConfig.store.toString()}</span>
                    </span>
                )}

                {/* Image/Video Model Settings */}
                {typeof modelConfig.steps === 'number' && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 rounded font-mono">
                        steps: <span className="text-purple-700 dark:text-purple-300">{modelConfig.steps}</span>
                    </span>
                )}
                {typeof modelConfig.guidance_scale === 'number' && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 rounded font-mono">
                        guidance: <span className="text-purple-700 dark:text-purple-300">{modelConfig.guidance_scale.toFixed(1)}</span>
                    </span>
                )}
                {typeof modelConfig.width === 'number' && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400 rounded font-mono">
                        {modelConfig.width}x{modelConfig.height ?? '?'}
                    </span>
                )}
            </div>
        </div>
    );
}
