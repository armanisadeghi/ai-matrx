"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2, FileJson, FileText } from "lucide-react";
import { useState } from "react";
import type { LLMAnalysisData } from "../utils/formatForLLM";
import { formatAsMarkdown, formatAsJSON } from "../utils/formatForLLM";

interface LLMDataModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    data: LLMAnalysisData;
}

export function LLMDataModal({ open, onOpenChange, data }: LLMDataModalProps) {
    const [copied, setCopied] = useState(false);
    const [format, setFormat] = useState<"markdown" | "json">("markdown");

    const formattedData = format === "markdown" ? formatAsMarkdown(data) : formatAsJSON(data);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(formattedData);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const criticalCount = data.issues.filter((i) => i.severity === "critical").length;
    const warningCount = data.issues.filter((i) => i.severity === "warning").length;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col bg-textured">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        LLM Analysis Data - {data.strategy.toUpperCase()}
                    </DialogTitle>
                    <DialogDescription className="text-gray-600 dark:text-gray-400">
                        Structured data for AI analysis. Only includes items that need improvement.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-2 pb-3 border-b border-border">
                    <div className="flex-1 flex items-center gap-2">
                        {criticalCount > 0 && (
                            <Badge className="bg-red-500 text-white">
                                {criticalCount} Critical
                            </Badge>
                        )}
                        {warningCount > 0 && (
                            <Badge className="bg-orange-500 text-white">
                                {warningCount} Warnings
                            </Badge>
                        )}
                        {data.issues.length === 0 && (
                            <Badge className="bg-green-500 text-white">
                                ✓ All Checks Passed
                            </Badge>
                        )}
                    </div>

                    <Tabs value={format} onValueChange={(v) => setFormat(v as any)} className="w-auto">
                        <TabsList className="h-8">
                            <TabsTrigger value="markdown" className="text-xs gap-1">
                                <FileText className="w-3 h-3" />
                                Markdown
                            </TabsTrigger>
                            <TabsTrigger value="json" className="text-xs gap-1">
                                <FileJson className="w-3 h-3" />
                                JSON
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>

                    <Button
                        size="sm"
                        onClick={handleCopy}
                        className="gap-2"
                        variant={copied ? "default" : "outline"}
                    >
                        {copied ? (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4" />
                                Copy
                            </>
                        )}
                    </Button>
                </div>

                <div className="flex-1 overflow-auto">
                    <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border-border whitespace-pre-wrap break-words">
                        {formattedData}
                    </pre>
                </div>

                <div className="pt-3 border-t border-border text-xs text-gray-500 dark:text-gray-400">
                    <p>
                        💡 <strong>Tip:</strong> Copy this data and paste it into any AI workflow for analysis and
                        improvement suggestions.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}

