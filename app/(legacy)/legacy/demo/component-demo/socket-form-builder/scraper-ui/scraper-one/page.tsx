"use client";
import { useState, useEffect } from "react";
import DynamicForm from "@/components/socket/form-builder/DynamicForm";
import { useScraperSocket } from "@/lib/redux/socket-io/hooks/useScraperSocket";
import { ChevronUp, ChevronDown } from "lucide-react";
import { ResponsiveSocketHeader } from "@/components/socket-io/headers/ResponsiveSocketHeader";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTaskStatus } from "@/lib/redux/socket-io/selectors/socket-task-selectors";
import ScraperResultsComponent from "@/features/scraper/ScraperResultsComponent";

const DEBUG_MODE = true;

export default function Page() {
    const { socketHook, taskSchema, handleChange, handleSubmit, clearResults } = useScraperSocket();
    const [controlsExpanded, setControlsExpanded] = useState(true);
    const { taskId, taskType } = socketHook;
    
    // Get task status from Redux
    const taskStatus = useAppSelector(state => taskId ? selectTaskStatus(state, taskId) : null);
    const isResponseActive = taskStatus === "submitted" || taskStatus === "completed";

    // Auto-collapse controls when response becomes active
    useEffect(() => {
        if (isResponseActive) {
            setControlsExpanded(false);
        }
    }, [isResponseActive]);

    return (
        <div className="flex flex-col min-h-dvh bg-gray-100 dark:bg-gray-900">
            {/* Controls Section */}
            <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    controlsExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
                }`}
            >
                <div className="p-4">
                    <ResponsiveSocketHeader 
                        debugMode={DEBUG_MODE} 
                    />
                    <div className="mt-4">
                        <DynamicForm 
                            taskType={taskType} 
                            onChange={handleChange} 
                            onSubmit={handleSubmit} 
                            minimalSpace={true} 
                        />
                    </div>
                </div>
            </div>

            {/* Toggle Bar */}
            <div className="sticky top-0 z-10 bg-textured border-b border-border shadow-sm">
                <div className="flex justify-between items-center px-4 py-2">
                    <div className="flex items-center">
                        <button
                            onClick={() => setControlsExpanded(!controlsExpanded)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            {controlsExpanded ? (
                                <>
                                    <span className="text-sm font-medium">Hide Form</span>
                                    <ChevronUp size={16} />
                                </>
                            ) : (
                                <>
                                    <span className="text-sm font-medium">Show Form</span>
                                    <ChevronDown size={16} />
                                </>
                            )}
                        </button>
                        
                        {isResponseActive && (
                            <button
                                onClick={clearResults}
                                className="ml-2 flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-800/30 transition-colors"
                            >
                                <span className="text-sm font-medium">Clear Results</span>
                            </button>
                        )}
                    </div>

                    {isResponseActive && (
                        <div className="text-sm text-blue-600 dark:text-blue-400">
                            <span>Results Available</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Results Section */}
            <div className="flex-1">
                <div className={`p-4 ${!controlsExpanded ? "pt-2" : ""}`}>
                    {taskId && <ScraperResultsComponent taskId={taskId} />}
                </div>
            </div>
        </div>
    );
}
