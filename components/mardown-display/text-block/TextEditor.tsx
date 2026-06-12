import React, { useState, useEffect } from "react";
import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExpandIcon, MinimizeIcon, Copy, Download, Edit, Eye, Moon, Sun } from "lucide-react";
import dynamic from 'next/dynamic';

// Dynamic import of ReactMarkdown to avoid SSR issues
const ReactMarkdown = dynamic(
  () => import('react-markdown'),
  { ssr: false }
);

interface TextBlockHeaderProps {
    wordCount: number;
    charCount: number;
    isEditing: boolean;
    isExpanded: boolean;
    content: string;
    handleCopy: (e: React.MouseEvent) => void;
    handleDownload: (e: React.MouseEvent) => void;
    toggleEdit: (e: React.MouseEvent) => void;
    toggleExpand: (e: React.MouseEvent) => void;
    toggleCollapse: (e: React.MouseEvent) => void;
    isCopied: boolean;
}

export const EditButton = ({
    isEditing,
    toggleEdit,
}: {
    isEditing: boolean;
    toggleEdit: (e: React.MouseEvent) => void;
}) => {
    return (
        <Button
            variant="ghost"
            size="sm"
            className="absolute top-2 right-2 z-10 bg-neutral-100 dark:bg-neutral-800 opacity-50 hover:opacity-100"
            onClick={toggleEdit}
        >
            {isEditing ? <Eye className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
            {isEditing ? "Preview" : "Edit"}
        </Button>
    );
};

const TextBlockHeader: React.FC<TextBlockHeaderProps> = ({
    wordCount,
    charCount,
    isEditing,
    isExpanded,
    content,
    handleCopy,
    handleDownload,
    toggleEdit,
    toggleExpand,
    toggleCollapse,
    isCopied,
}) => {
    return (
        <div className="flex justify-between items-center px-4 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center space-x-2 text-sm text-neutral-500 dark:text-neutral-400">
                <span className="font-medium">{isEditing ? "Editing" : "Viewing"}</span>
                <span>•</span>
                <span>{wordCount} words</span>
                <span>•</span>
                <span>{charCount} characters</span>
            </div>
            <div className="flex items-center space-x-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="text-xs"
                >
                    <Copy className="h-3.5 w-3.5" />
                    {isCopied ? "Copied!" : "Copy"}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    className="text-xs"
                >
                    <Download className="h-3.5 w-3.5" />
                    Save
                </Button>
                {!isEditing && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleCollapse}
                        className="text-xs"
                    >
                        {isExpanded ? "Collapse" : "Expand"}
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleExpand}
                    className="text-xs"
                >
                    {isExpanded ? (
                        <MinimizeIcon className="h-3.5 w-3.5" />
                    ) : (
                        <ExpandIcon className="h-3.5 w-3.5" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleEdit}
                    className="text-xs"
                >
                    {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Edit className="h-3.5 w-3.5" />}
                    {isEditing ? "Preview" : "Edit"}
                </Button>
            </div>
        </div>
    );
};

interface TextEditorProps {
    content: string;
    onChange: (value: string) => void;
    isExpanded: boolean;
}

const TextEditor: React.FC<TextEditorProps> = ({ content, onChange, isExpanded }) => {
    const [activeTab, setActiveTab] = useState<string>("write");
    
    return (
        <div className={cn("w-full", isExpanded ? "h-[calc(100dvh-8rem)]" : "min-h-[200px]")}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full">
                <div className="border-b border-neutral-200 dark:border-neutral-700">
                    <TabsList className="bg-transparent">
                        <TabsTrigger value="write" className="data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
                            Write
                        </TabsTrigger>
                        <TabsTrigger value="preview" className="data-[state=active]:bg-white dark:data-[state=active]:bg-neutral-800">
                            Preview
                        </TabsTrigger>
                    </TabsList>
                </div>
                <TabsContent value="write" className="h-full mt-0">
                    <textarea
                        className="w-full h-full p-4 outline-none resize-none bg-white dark:bg-neutral-900 dark:text-white"
                        value={content}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder="Start writing..."
                    />
                </TabsContent>
                <TabsContent value="preview" className="h-full mt-0 overflow-auto">
                    <div className="prose dark:prose-invert p-4 max-w-none">
                        {typeof window !== 'undefined' && <ReactMarkdown>{content}</ReactMarkdown>}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

interface MarkdownBlockProps {
    content: string;
    className?: string;
    onContentChange?: (newContent: string) => void;
    initialEditMode?: boolean;
}

const MarkdownBlock: React.FC<MarkdownBlockProps> = ({
    content: initialContent,
    className,
    onContentChange,
    initialEditMode = false,
}) => {
    const [content, setContent] = useState(initialContent);
    const [isCopied, setIsCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isEditing, setIsEditing] = useState(initialEditMode);
    const [isDark, setIsDark] = useState(false);

    const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
    const charCount = content.length;

    useEffect(() => {
        const updateTheme = () => {
            setIsDark(document.documentElement.classList.contains("dark"));
        };
        updateTheme();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === "class") {
                    updateTheme();
                }
            });
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation();
        const blob = new Blob([content], { type: "text/markdown" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `document.md`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
        if (isCollapsed) setIsCollapsed(false);
    };

    const toggleCollapse = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (isEditing) return;
        setIsCollapsed(!isCollapsed);
        if (isExpanded) setIsExpanded(false);
    };

    const toggleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(!isEditing);
        if (!isEditing) {
            setIsExpanded(true);
            setIsCollapsed(false);
        } else {
            setIsExpanded(false);
        }
    };

    const handleContentChange = (newContent: string) => {
        setContent(newContent);
        onContentChange?.(newContent);
    };

    // Calculate a reasonable height for collapsed view (about 6-8 lines)
    const collapsedHeight = 160;

    return (
        <div
            className={cn(
                "my-4 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 transition-all duration-200",
                isExpanded && "fixed inset-4 z-50 bg-white dark:bg-neutral-900",
                className
            )}
        >
            <TextBlockHeader
                wordCount={wordCount}
                charCount={charCount}
                isEditing={isEditing}
                isExpanded={isExpanded}
                content={content}
                handleCopy={handleCopy}
                handleDownload={handleDownload}
                toggleEdit={toggleEdit}
                toggleExpand={toggleExpand}
                toggleCollapse={toggleCollapse}
                isCopied={isCopied}
            />
            <div className="relative">
                <EditButton isEditing={isEditing} toggleEdit={toggleEdit} />
                {isEditing ? (
                    <TextEditor content={content} onChange={handleContentChange} isExpanded={isExpanded} />
                ) : (
                    <div className="relative">
                        <div 
                            className={cn(
                                "overflow-hidden transition-all duration-200", 
                                isCollapsed ? `max-h-[${collapsedHeight}px]` : "max-h-none"
                            )}
                            style={{ maxHeight: isCollapsed ? collapsedHeight : 'none' }}
                        >
                            <div className="prose dark:prose-invert p-4 max-w-none">
                                <ReactMarkdown>{content}</ReactMarkdown>
                            </div>
                        </div>
                        {isCollapsed && (
                            <div
                                className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-neutral-900 to-transparent opacity-80 cursor-pointer"
                                onClick={toggleCollapse}
                            >
                                <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-neutral-400 text-sm">
                                    Click to expand more content
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MarkdownBlock;