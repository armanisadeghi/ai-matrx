"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PageSpeedResponse, LighthouseCategoryV5 } from "../types";
import { CategoryDetails } from "./CategoryDetails";
import { MetricsOverview } from "./MetricsOverview";
import { ScoreProgress } from "./ScoreProgress";
import { LLMDataModal } from "./LLMDataModal";
import { formatPageSpeedForLLM } from "../utils/formatForLLM";
import { ExternalLink, Calendar, Globe, Stars } from "lucide-react";

interface PageSpeedResultsProps {
    data: PageSpeedResponse;
    strategy: "desktop" | "mobile";
}

export function PageSpeedResults({ data, strategy }: PageSpeedResultsProps) {
    const [llmModalOpen, setLlmModalOpen] = useState(false);
    const { lighthouseResult, analysisUTCTimestamp } = data;
    const { categories, audits, finalUrl, fetchTime } = lighthouseResult;

    const llmData = formatPageSpeedForLLM(data, strategy);

    const getScoreColor = (score: number | null) => {
        if (score === null) return "bg-gray-500 dark:bg-gray-400";
        if (score >= 0.9) return "bg-green-500 dark:bg-green-400";
        if (score >= 0.5) return "bg-orange-500 dark:bg-orange-400";
        return "bg-red-500 dark:bg-red-400";
    };

    const getScoreLabel = (score: number | null) => {
        if (score === null) return "N/A";
        if (score >= 0.9) return "Good";
        if (score >= 0.5) return "Needs Improvement";
        return "Poor";
    };

    const formatScore = (score: number | null) => {
        return score !== null ? Math.round(score * 100) : 0;
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="space-y-4">
            {/* Compact URL Info with LLM Button */}
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 pb-3 border-b border-border">
                <a
                    href={finalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline flex items-center gap-1.5 text-blue-600 dark:text-blue-400"
                >
                    <Globe className="w-3.5 h-3.5" />
                    {finalUrl}
                    <ExternalLink className="w-3 h-3" />
                </a>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(analysisUTCTimestamp)}
                    </div>
                    <Button
                        size="sm"
                        onClick={() => setLlmModalOpen(true)}
                        className="h-7 gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                    >
                        <Stars className="w-3.5 h-3.5" />
                        View AI Data
                        {llmData.issues.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs bg-white/20">
                                {llmData.issues.length}
                            </Badge>
                        )}
                    </Button>
                </div>
            </div>

            <LLMDataModal open={llmModalOpen} onOpenChange={setLlmModalOpen} data={llmData} />

            {/* Score Overview - Compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(categories).map(([key, category]) => {
                    if (!category) return null;
                    const score = formatScore(category.score);
                    const scoreColor = getScoreColor(category.score);
                    const scoreLabel = getScoreLabel(category.score);

                    return (
                        <div
                            key={key}
                            className="bg-textured border-border rounded-lg p-4"
                        >
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                {category.title}
                            </div>
                            <div className="flex items-baseline justify-between mb-2">
                                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                    {score}
                                </span>
                                <Badge
                                    className={`${scoreColor} text-white border-none text-xs`}
                                >
                                    {scoreLabel}
                                </Badge>
                            </div>
                            <ScoreProgress value={score} className="h-1.5" />
                        </div>
                    );
                })}
            </div>

            {/* Detailed Results */}
            <div className="bg-textured border-border rounded-lg p-4">
                <Tabs defaultValue="metrics" className="w-full">
                    <TabsList className="grid w-full grid-cols-5 bg-gray-100 dark:bg-gray-700 h-9">
                        <TabsTrigger value="metrics" className="text-xs">Metrics</TabsTrigger>
                        {Object.entries(categories).map(([key, category]) => {
                            if (!category) return null;
                            return (
                                <TabsTrigger key={key} value={key} className="text-xs">
                                    {category.title.replace(/\s+/g, ' ')}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>

                    <TabsContent value="metrics" className="mt-4">
                        <MetricsOverview audits={audits} />
                    </TabsContent>

                    {Object.entries(categories).map(([key, category]) => {
                        if (!category) return null;
                        return (
                            <TabsContent key={key} value={key} className="mt-4">
                                <CategoryDetails category={category} audits={audits} />
                            </TabsContent>
                        );
                    })}
                </Tabs>
            </div>
        </div>
    );
}

