"use client";

import { useState, useMemo, useTransition } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Play, Pencil, Eye, Loader2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePromptsBasePath } from "../hooks/usePromptsBasePath";
import { filterAndSortBySearch } from "@/utils/search-scoring";

interface Prompt {
    id: string;
    name: string;
    description?: string;
}

interface PromptSearchDialogProps {
    isOpen: boolean;
    onClose: () => void;
    prompts: Prompt[];
}

export function PromptSearchDialog({ isOpen, onClose, prompts }: PromptSearchDialogProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [isPending, startTransition] = useTransition();
    const [navigatingId, setNavigatingId] = useState<string | null>(null);
    const router = useRouter();
    const basePath = usePromptsBasePath();

    const filteredPrompts = useMemo(() => {
        if (!searchQuery.trim()) {
            return prompts;
        }

        return filterAndSortBySearch(prompts, searchQuery, [
            { get: (p) => p.name, weight: "title" },
            { get: (p) => p.description, weight: "body" },
        ]);
    }, [prompts, searchQuery]);

    const handleNavigate = (id: string, path: string) => {
        setNavigatingId(id);
        startTransition(() => {
            router.push(path);
        });
    };

    const handleClose = () => {
        setSearchQuery("");
        setNavigatingId(null);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-2xl max-h-[80dvh] bg-textured border-slate-200 dark:border-slate-700">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                        Search Prompts
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                            placeholder="Search by name or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-12 text-base bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                            autoFocus
                        />
                    </div>

                    {/* Results Count */}
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        {filteredPrompts.length === prompts.length
                            ? `Showing all ${prompts.length} prompts`
                            : `Found ${filteredPrompts.length} of ${prompts.length} prompts`}
                    </div>

                    {/* Results List */}
                    <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-2">
                            {filteredPrompts.length === 0 ? (
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                    <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No prompts found matching your search.</p>
                                </div>
                            ) : (
                                filteredPrompts.map((prompt) => {
                                    const isNavigating = navigatingId === prompt.id;
                                    const isDisabled = navigatingId !== null;

                                    return (
                                        <div
                                            key={prompt.id}
                                            className={`relative group p-4 rounded-lg border transition-all duration-200 ${
                                                isDisabled
                                                    ? "opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700"
                                                    : "border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md bg-white dark:bg-slate-800"
                                            }`}
                                        >
                                            {/* Loading Overlay */}
                                            {isNavigating && (
                                                <div className="absolute inset-0 bg-slate-900/20 dark:bg-slate-950/40 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
                                                    <Loader2 className="w-6 h-6 text-blue-500 dark:text-blue-400 animate-spin" />
                                                </div>
                                            )}

                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <MessageSquare className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                                                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                            {prompt.name || "Untitled Prompt"}
                                                        </h3>
                                                    </div>
                                                    {prompt.description && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                                            {prompt.description}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex gap-1 flex-shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleNavigate(prompt.id, `${basePath}/run/${prompt.id}`)}
                                                        disabled={isDisabled}
                                                        className="h-8 w-8 p-0"
                                                        title="Run"
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleNavigate(prompt.id, `${basePath}/edit/${prompt.id}`)}
                                                        disabled={isDisabled}
                                                        className="h-8 w-8 p-0"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleNavigate(prompt.id, `${basePath}/view/${prompt.id}`)}
                                                        disabled={isDisabled}
                                                        className="h-8 w-8 p-0"
                                                        title="View"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}

