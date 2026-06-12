"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createTaskFromPresetQuick } from "@/lib/redux/socket-io/thunks/createTaskFromPreset";
import { getPresetsForTask, getAvailablePresets } from "@/components/socket-io/presets/socket-task-presets";
import { Play, Zap, Settings } from "lucide-react";

interface NodeSocketIntegrationProps {
    stepData: any; // Your workflow step or node data
    onTaskCreated?: (taskId: string) => void;
}

/**
 * Example integration component showing how to add socket functionality
 * to any component with data that can be transformed into socket tasks
 */
const NodeSocketIntegration: React.FC<NodeSocketIntegrationProps> = ({
    stepData,
    onTaskCreated
}) => {
    const dispatch = useAppDispatch();
    const [isOpen, setIsOpen] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [lastTaskId, setLastTaskId] = useState<string | null>(null);
    const [results, setResults] = useState<any>(null);

    const availablePresets = getAvailablePresets();

    const handleExecuteWithPreset = async (presetName: string) => {
        setIsExecuting(true);
        try {
            console.log(`🚀 Executing ${presetName} with data:`, stepData);

            const taskId = await dispatch(createTaskFromPresetQuick({
                presetName,
                sourceData: stepData
            })).unwrap();

            setLastTaskId(taskId);
            setResults({ taskId, preset: presetName, timestamp: new Date().toISOString() });

            // Notify parent component
            onTaskCreated?.(taskId);

            console.log(`✅ Task created successfully: ${taskId}`);
        } catch (error) {
            console.error(`❌ Failed to create task with preset ${presetName}:`, error);
            setResults({ error: error.message, preset: presetName });
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <>
            {/* Trigger Button - This would go in your NodeWrapper or similar component */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0 hover:from-blue-600 hover:to-purple-700"
                    >
                        <Zap className="h-4 w-4" />
                        Execute via Socket
                    </Button>
                </DialogTrigger>

                <DialogContent className="max-w-2xl max-h-[80dvh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Execute Step via Socket.IO
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6">
                        {/* Current Step Data Preview */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Source Data Preview</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-auto max-h-32">
                                    {JSON.stringify(stepData, null, 2)}
                                </pre>
                            </CardContent>
                        </Card>

                        {/* Preset Options */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm">Available Execution Presets</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button
                                    onClick={() => handleExecuteWithPreset("workflow_step_to_execute_single_step")}
                                    disabled={isExecuting}
                                    className="w-full justify-start"
                                    variant="outline"
                                >
                                    <Play className="h-4 w-4 mr-2" />
                                    {isExecuting ? "Executing..." : "Execute Single Step (Full Control)"}
                                </Button>

                                <Button
                                    onClick={() => handleExecuteWithPreset("workflow_step_to_execute_step_quick")}
                                    disabled={isExecuting}
                                    className="w-full justify-start"
                                    variant="outline"
                                >
                                    <Zap className="h-4 w-4 mr-2" />
                                    {isExecuting ? "Executing..." : "Execute Step Quick (Fast)"}
                                </Button>

                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    💡 Presets automatically handle field mapping, validation, and type conversion
                                </div>
                            </CardContent>
                        </Card>

                        {/* Results */}
                        {results && (
                            <Card className={lastTaskId ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}>
                                <CardHeader>
                                    <CardTitle className="text-sm">
                                        {lastTaskId ? "✅ Success" : "❌ Error"}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {lastTaskId ? (
                                        <div>
                                            <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                                                Task ID: <code className="bg-green-100 dark:bg-green-800 px-2 py-1 rounded">{lastTaskId}</code>
                                            </p>
                                            <p className="text-xs text-green-600 dark:text-green-400">
                                                Preset: {results.preset} | Created: {new Date(results.timestamp).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-red-700 dark:text-red-300">
                                            {results.error}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Quick Info */}
                        <Card className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <CardContent className="pt-4">
                                <div className="text-blue-700 dark:text-blue-300 text-sm space-y-1">
                                    <p><strong>🎯 What happens:</strong></p>
                                    <p>• Your step data is automatically transformed</p>
                                    <p>• Socket task is created with proper validation</p>
                                    <p>• You get back a task ID for tracking</p>
                                    <p>• Results can be displayed in a second column</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};

export default NodeSocketIntegration;

// ===== USAGE EXAMPLE =====

/**
 * Example of how to integrate into NodeWrapper.tsx:
 * 
 * ```tsx
 * import NodeSocketIntegration from "@/components/socket-io/presets/NodeSocketIntegration";
 * 
 * // Inside your NodeWrapper component:
 * const handleTaskCreated = (taskId: string) => {
 *     console.log("Task created:", taskId);
 *     // You could:
 *     // - Update node status
 *     // - Show results in second column
 *     // - Track execution state
 *     // - Update workflow state
 * };
 * 
 * // In your JSX:
 * <div className="node-actions">
 *     <NodeSocketIntegration 
 *         stepData={step} 
 *         onTaskCreated={handleTaskCreated}
 *     />
 * </div>
 * ```
 */ 