"use client";
import React, { useState, useEffect } from "react";
import { cn } from "@/styles/themes/utils";

interface QuestionnaireLoadingVisualizationProps {
    className?: string;
}

const QuestionnaireLoadingVisualization: React.FC<QuestionnaireLoadingVisualizationProps> = ({
    className
}) => {
    const messages = [
        "I'm reviewing your request...",
        "Analyzing what I already know...",
        "Looking for missing information...",
        "Coming up with some good questions...",
        "Identifying additional information gaps...",
        "Creating answer options to make this easier for you...",
        "Finalizing a simple & complete questionnaire..."
    ];

    const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

    useEffect(() => {
        // Don't change the final message
        if (currentMessageIndex >= messages.length - 1) {
            return undefined;
        }

        const interval = setInterval(() => {
            setCurrentMessageIndex(prev => {
                const nextIndex = prev + 1;
                // Stop at the final message
                return nextIndex >= messages.length - 1 ? messages.length - 1 : nextIndex;
            });
        }, 2000);

        return () => clearInterval(interval);
    }, [currentMessageIndex, messages.length]);
    return (
        <div className={cn(
            "w-full space-y-6 p-6 rounded-lg",
            "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30",
            "border border-blue-200 dark:border-blue-800/50",
            className
        )}>
            {/* Header */}
            <div className="space-y-2">
                <div className="h-4 bg-gradient-to-r from-blue-200 to-blue-300 dark:from-blue-700 dark:to-blue-600 rounded animate-pulse" />
                <div className="h-3 bg-gradient-to-r from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-700 rounded w-3/4 animate-pulse" />
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
                {/* Field 1 */}
                <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
                    <div className="h-10 bg-textured border border-gray-300 dark:border-gray-600 rounded-md animate-pulse" />
                </div>

                {/* Field 2 */}
                <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
                    <div className="h-10 bg-textured border border-gray-300 dark:border-gray-600 rounded-md animate-pulse" />
                </div>

                {/* Field 3 - Radio/Checkbox group */}
                <div className="space-y-3">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/5 animate-pulse" />
                    <div className="space-y-2 pl-4">
                        <div className="flex items-center space-x-3">
                            <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24 animate-pulse" />
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32 animate-pulse" />
                        </div>
                        <div className="flex items-center space-x-3">
                            <div className="h-4 w-4 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse" />
                        </div>
                    </div>
                </div>

                {/* Field 4 - Textarea */}
                <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse" />
                    <div className="h-20 bg-textured border border-gray-300 dark:border-gray-600 rounded-md animate-pulse" />
                </div>

                {/* Field 5 */}
                <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/5 animate-pulse" />
                    <div className="h-10 bg-textured border border-gray-300 dark:border-gray-600 rounded-md animate-pulse" />
                </div>

                {/* Field 6 - Select/Dropdown */}
                <div className="space-y-2">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
                    <div className="h-10 bg-textured border border-gray-300 dark:border-gray-600 rounded-md animate-pulse relative">
                        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading indicator with dynamic message */}
            <div className="flex items-center justify-center space-x-3 pt-4">
                <div className="flex space-x-1">
                    <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-sm text-blue-600 dark:text-blue-400 font-medium transition-all duration-300">
                    {messages[currentMessageIndex]}
                </span>
            </div>
        </div>
    );
};

export default QuestionnaireLoadingVisualization;
