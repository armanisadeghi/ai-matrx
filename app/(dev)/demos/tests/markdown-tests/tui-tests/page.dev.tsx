"use client";

import React, { useState, useRef } from "react";
import TuiEditorContent from "@/components/mardown-display/chat-markdown/tui/TuiEditorContent";
import type { TuiEditorContentRef } from "@/components/mardown-display/chat-markdown/tui/TuiEditorContent";
import { HtmlCodeFilesTab } from "@/features/html-pages/components/tabs/HtmlCodeFilesTab";
import { SavePageTab } from "@/features/html-pages/components/tabs/SavePageTab";
import { useHtmlPreviewState } from "@/features/html-pages/hooks/useHtmlPreviewState";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FileText, FileCode, RefreshCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { SAMPLE_MARKDOWN } from "./constants";


export default function TuiTestPage() {
    const user = useAppSelector(selectUser);
    const [inputMarkdown, setInputMarkdown] = useState(SAMPLE_MARKDOWN);
    const [stagedMarkdown, setStagedMarkdown] = useState(SAMPLE_MARKDOWN);
    const [inputDialogOpen, setInputDialogOpen] = useState(false);
    const [outputDialogOpen, setOutputDialogOpen] = useState(false);
    const editorRef = useRef<TuiEditorContentRef>(null);

    // CRITICAL: Store publishedPageId at parent level to prevent creating multiple pages
    const [publishedPageId, setPublishedPageId] = useState<string | null>(null);
    const [hookResetKey, setHookResetKey] = useState(0);

    // Use the HTML preview hook to test markdown -> HTML conversion
    const htmlPreviewState = useHtmlPreviewState({
        markdownContent: inputMarkdown,
        htmlContent: "",
        user: user || undefined,
        isOpen: true,
        publishedPageId, // Pass the persisted ID
        onPageIdChange: (pageId) => {
            console.log("📌 Page ID created/updated:", pageId);
            setPublishedPageId(pageId); // Store ID at parent level
        },
        resetKey: hookResetKey,
    });

    const handleOpenInputDialog = () => {
        // Reset staged content to current content when opening
        setStagedMarkdown(htmlPreviewState.currentMarkdown);
        setInputDialogOpen(true);
    };

    const handleLoadMarkdown = () => {
        // Apply the staged content
        setInputMarkdown(stagedMarkdown);
        htmlPreviewState.setCurrentMarkdown(stagedMarkdown);
        setInputDialogOpen(false);
    };

    const handleResetTest = () => {
        // Simulate new task - clear page ID and increment reset key
        console.log("🔄 Resetting test - clearing page ID");
        setPublishedPageId(null);
        setHookResetKey(prev => prev + 1);
    };

    return (
        <div className="h-screen w-full bg-gray-50 dark:bg-gray-950 flex flex-col">
            {/* Status Bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-700">
                <div className="flex items-center gap-3">
                    {publishedPageId ? (
                        <>
                            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    Page Published
                                </span>
                                <span className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                    ID: {publishedPageId}
                                </span>
                            </div>
                        </>
                    ) : (
                        <>
                            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                No page published yet - Next publish will create NEW page
                            </span>
                        </>
                    )}
                </div>
                <Button
                    onClick={handleResetTest}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                >
                    <RefreshCcw className="w-4 h-4" />
                    Reset Test (Clear Page ID)
                </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup orientation="horizontal">
                {/* Left Panel - TUI Editor */}
                <ResizablePanel defaultSize={33} minSize={20}>
                    <div className="flex flex-col h-full border-r border-gray-300 dark:border-gray-700">
                        <div className="flex items-center justify-between px-4 py-2 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-gray-100">TUI Editor (Markdown)</h2>
                            <div className="flex gap-2">
                                <Dialog open={inputDialogOpen} onOpenChange={setInputDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="gap-2"
                                            onClick={handleOpenInputDialog}
                                        >
                                            <FileText className="w-4 h-4" />
                                            Load
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-3xl max-h-[80vh]">
                                        <DialogHeader>
                                            <DialogTitle>Load Markdown Content</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex flex-col gap-4">
                                            <textarea
                                                value={stagedMarkdown}
                                                onChange={(e) => setStagedMarkdown(e.target.value)}
                                                className="w-full h-96 p-4 font-mono text-sm resize-none bg-textured text-gray-900 dark:text-gray-100 border border-border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Paste your markdown here..."
                                            />
                                            <Button onClick={handleLoadMarkdown} className="w-full">
                                                Load to Editor
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                                
                                <Dialog open={outputDialogOpen} onOpenChange={setOutputDialogOpen}>
                                    <DialogTrigger asChild>
                                        <Button size="sm" variant="outline" className="gap-2">
                                            <FileCode className="w-4 h-4" />
                                            View Output
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-3xl max-h-[80vh]">
                                        <DialogHeader>
                                            <DialogTitle>Markdown Output</DialogTitle>
                                        </DialogHeader>
                                        <div className="overflow-auto max-h-[60vh]">
                                            <pre className="p-4 font-mono text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 rounded">
                                                {htmlPreviewState.currentMarkdown || "No content yet..."}
                                            </pre>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <TuiEditorContent
                                ref={editorRef}
                                content={htmlPreviewState.currentMarkdown}
                                onChange={(content) => htmlPreviewState.setCurrentMarkdown(content)}
                                editMode="markdown"
                                className="w-full h-full"
                            />
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Middle Panel - HTML Code Files */}
                <ResizablePanel defaultSize={33} minSize={20}>
                    <div className="flex flex-col h-full border-r border-gray-300 dark:border-gray-700">
                        <div className="px-4 py-2 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Generated HTML Files</h2>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <HtmlCodeFilesTab
                                state={htmlPreviewState}
                                actions={htmlPreviewState}
                                user={user}
                                isAgentSystem={false}
                            />
                        </div>
                    </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Right Panel - Save/Preview Tab */}
                <ResizablePanel defaultSize={34} minSize={20}>
                    <div className="flex flex-col h-full">
                        <div className="px-4 py-2 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700">
                            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Publish & Preview</h2>
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <SavePageTab
                                state={htmlPreviewState}
                                actions={htmlPreviewState}
                                user={user}
                            />
                        </div>
                    </div>
                </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}