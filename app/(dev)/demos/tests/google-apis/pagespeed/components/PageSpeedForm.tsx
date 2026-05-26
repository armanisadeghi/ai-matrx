"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, Smartphone, Monitor, Loader2 } from "lucide-react";

interface PageSpeedFormProps {
    onAnalyze: (url: string, categories: string[]) => void;
    loading: boolean;
}

const CATEGORIES = [
    { id: "PERFORMANCE", label: "Performance", description: "Speed and optimization metrics" },
    { id: "ACCESSIBILITY", label: "Accessibility", description: "A11y best practices" },
    { id: "BEST_PRACTICES", label: "Best Practices", description: "Web development standards" },
    { id: "SEO", label: "SEO", description: "Search engine optimization" },
];

export function PageSpeedForm({ onAnalyze, loading }: PageSpeedFormProps) {
    const [url, setUrl] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>(["PERFORMANCE", "ACCESSIBILITY", "BEST_PRACTICES", "SEO"]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) return;
        
        // Ensure at least one category is selected
        const categoriesToUse = selectedCategories.length > 0 ? selectedCategories : ["PERFORMANCE"];
        onAnalyze(url, categoriesToUse);
    };

    const toggleCategory = (categoryId: string) => {
        setSelectedCategories((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId]
        );
    };

    return (
        <Card className="bg-textured border-gray-200 dark:border-gray-700">
            <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Configure Analysis
                </CardTitle>
                <CardDescription className="text-gray-600 dark:text-gray-400">
                    Test your website's performance, accessibility, and SEO across devices
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* URL Input */}
                    <div className="space-y-2">
                        <Label htmlFor="url" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Website URL
                        </Label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                            <Input
                                id="url"
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://example.com"
                                required
                                className="pl-11 h-12 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                            />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Enter any publicly accessible website URL
                        </p>
                    </div>

                    {/* Info about both analyses */}
                    <div className="relative overflow-hidden p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm">
                                <Monitor className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                    Dual Analysis Mode
                                </p>
                                <p className="text-xs text-blue-700 dark:text-blue-300">
                                    Analyzes both desktop & mobile simultaneously
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Categories Selection */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                Analysis Categories
                            </Label>
                            <button
                                type="button"
                                onClick={() => {
                                    if (selectedCategories.length === CATEGORIES.length) {
                                        setSelectedCategories(["PERFORMANCE"]);
                                    } else {
                                        setSelectedCategories(CATEGORIES.map(c => c.id));
                                    }
                                }}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                {selectedCategories.length === CATEGORIES.length ? "Deselect All" : "Select All"}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {CATEGORIES.map((category) => {
                                const isSelected = selectedCategories.includes(category.id);
                                return (
                                    <div
                                        key={category.id}
                                        className={`flex items-start space-x-3 p-4 rounded-lg border-2 transition-all cursor-pointer ${
                                            isSelected
                                                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-500 dark:border-blue-400 shadow-sm"
                                                : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                                        }`}
                                        onClick={() => toggleCategory(category.id)}
                                    >
                                        <Checkbox
                                            id={category.id}
                                            checked={isSelected}
                                            onCheckedChange={() => toggleCategory(category.id)}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1">
                                            <Label
                                                htmlFor={category.id}
                                                className="font-semibold cursor-pointer text-gray-900 dark:text-gray-100"
                                            >
                                                {category.label}
                                            </Label>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                                {category.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {selectedCategories.length === 0 && (
                            <p className="text-xs text-orange-600 dark:text-orange-400">
                                ⚠️ Please select at least one category
                            </p>
                        )}
                    </div>

                    {/* Submit Button */}
                    <Button
                        type="submit"
                        disabled={loading || !url.trim() || selectedCategories.length === 0}
                        className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Running Analysis...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <Monitor className="w-5 h-5" />
                                <Smartphone className="w-5 h-5" />
                                Analyze Desktop & Mobile
                            </span>
                        )}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

