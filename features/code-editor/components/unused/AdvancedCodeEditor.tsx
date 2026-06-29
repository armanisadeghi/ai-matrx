"use client";

import { useState, useEffect } from "react";
import { extractErrorMessage } from "@/utils/errors";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useMeasure } from "@uidotdev/usehooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
    Play,
    Settings,
    Loader2,
    Files,
    Terminal,
    Laptop,
    Download,
    Upload,
    Divide,
    Maximize2,
    MinusSquare,
    PanelLeftClose,
    PanelRightClose,
    RefreshCw,
} from "lucide-react";
import { useMonacoTheme } from "../../hooks/useMonacoTheme";

const LANGUAGES = [
    { id: "javascript", name: "JavaScript", icon: "📜" },
    { id: "typescript", name: "TypeScript", icon: "💪" },
    { id: "html", name: "HTML", icon: "🌐" },
    { id: "css", name: "CSS", icon: "🎨" },
    { id: "json", name: "JSON", icon: "📋" },
    { id: "python", name: "Python", icon: "🐍" },
];

const defaultCode = `// Welcome to the Advanced Code Editor!
// Try out these features:
// - Real-time console output
// - Multiple file support
// - Dark/Light theme switching
// - Code formatting
// - And much more!

function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome to the editor, \${name}!\`;
}

// Test the function
greet("Developer");

// Try some array operations
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log("Doubled numbers:", doubled);

// Return a value to see it in the output
return doubled;`;

interface File {
    id: string;
    name: string;
    language: string;
    content: string;
}

const AdvancedCodeEditor = () => {
    const [ref, { width, height }] = useMeasure();
    const monaco = useMonaco();
    const [activeFile, setActiveFile] = useState<string>("main.js");
    const [files, setFiles] = useState<File[]>([
        { id: "1", name: "main.js", language: "javascript", content: defaultCode },
        { id: "2", name: "styles.css", language: "css", content: "/* Add your styles here */" },
    ]);
    const [output, setOutput] = useState<Array<{ type: "log" | "error" | "result"; content: string }>>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [showOutput, setShowOutput] = useState(true);
    const isDark = useMonacoTheme();

    const getCurrentFile = () => files.find((f) => f.name === activeFile) || files[0];

    const runCode = async () => {
        setIsRunning(true);
        setOutput([]);
        const logs: Array<{ type: "log" | "error" | "result"; content: string }> = [];

        const customConsole = {
            log: (...args: any[]) => {
                logs.push({
                    type: "log",
                    content: args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg))).join(" "),
                });
                setOutput([...logs]);
            },
        };

        try {
            const currentFile = getCurrentFile();
            const func = new Function(
                "console",
                `
        try {
          ${currentFile.content}
        } catch (error) {
          console.log('Error:', error.message);
        }
      `
            );

            const result = func(customConsole);
            if (result !== undefined) {
                logs.push({
                    type: "result",
                    content: `Returned: ${typeof result === "object" ? JSON.stringify(result, null, 2) : result}`,
                });
            }
        } catch (error) {
            logs.push({
                type: "error",
                content: `Error: ${extractErrorMessage(error)}`,
            });
        }

        setOutput(logs);
        setIsRunning(false);
    };

    const addNewFile = () => {
        const newFile = {
            id: Date.now().toString(),
            name: `file${files.length + 1}.js`,
            language: "javascript",
            content: "// New file",
        };
        setFiles([...files, newFile]);
        setActiveFile(newFile.name);
    };

    const handleFileChange = (content: string | undefined) => {
        if (!content) return;
        setFiles(files.map((f) => (f.name === activeFile ? { ...f, content } : f)));
    };

    const formatCode = () => {
        if (monaco) {
            const editor = monaco.editor.getModels()[0];
            if (editor) {
                editor.setValue(editor.getValue());
            }
        }
    };

    return (
        <div ref={ref} className="flex flex-col w-full h-full">
            <Card className="flex flex-col w-full h-full dark:bg-slate-900">
                <div className="flex items-center justify-between p-2 border-b dark:border-slate-700">
                    <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={() => setShowSidebar(!showSidebar)}>
                            {showSidebar ? <PanelLeftClose size={18} /> : <Files size={18} />}
                        </Button>

                        <Select value={getCurrentFile()?.language}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                {LANGUAGES.map((lang) => (
                                    <SelectItem key={lang.id} value={lang.id}>
                                        <span className="flex items-center">
                                            <span className="mr-2">{lang.icon}</span>
                                            {lang.name}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" onClick={formatCode} title="Format Code">
                            <Divide size={18} />
                        </Button>

                        <Button variant="ghost" size="icon" onClick={() => setShowOutput(!showOutput)} title="Toggle Output">
                            <Terminal size={18} />
                        </Button>

                        <Button onClick={runCode} disabled={isRunning} className="flex items-center">
                            {isRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                            Run
                        </Button>
                    </div>
                </div>

                <div className="flex flex-grow">
                    {showSidebar && (
                        <div className="w-48 border-r dark:border-slate-700 p-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium">Files</h3>
                                <Button variant="ghost" size="icon" onClick={addNewFile}>
                                    <Upload size={16} />
                                </Button>
                            </div>
                            <ScrollArea className="h-full">
                                {files.map((file) => (
                                    <div
                                        key={file.id}
                                        className={`flex items-center p-2 rounded-md cursor-pointer ${
                                            activeFile === file.name
                                                ? "bg-slate-200 dark:bg-slate-800"
                                                : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                        }`}
                                        onClick={() => setActiveFile(file.name)}
                                    >
                                        <span className="mr-2">📄</span>
                                        <span className="text-sm truncate">{file.name}</span>
                                    </div>
                                ))}
                            </ScrollArea>
                        </div>
                    )}

                    <div className="flex-grow">
                        <Editor
                            height={`${height - (showOutput ? 200 : 50)}px`}
                            defaultLanguage={getCurrentFile()?.language}
                            value={getCurrentFile()?.content}
                            onChange={handleFileChange}
                            theme={isDark ? "customDark" : "customLight"}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                lineNumbers: "on",
                                roundedSelection: false,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: { top: 10 },
                                suggestOnTriggerCharacters: true,
                                formatOnPaste: true,
                                formatOnType: true,
                            }}
                        />
                    </div>
                </div>

                {showOutput && (
                    <div className="h-[200px] border-t dark:border-slate-700">
                        <div className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800">
                            <span className="text-sm font-medium">Output</span>
                            <Button variant="ghost" size="icon" onClick={() => setOutput([])} title="Clear Console">
                                <RefreshCw size={16} />
                            </Button>
                        </div>
                        <ScrollArea className="h-[160px] p-4 dark:bg-slate-900">
                            {output.map((item, index) => (
                                <div
                                    key={index}
                                    className={`font-mono text-sm mb-1 ${
                                        item.type === "error"
                                            ? "text-red-500"
                                            : item.type === "result"
                                            ? "text-green-500"
                                            : "text-slate-700 dark:text-slate-300"
                                    }`}
                                >
                                    {item.type === "log" && "> "}
                                    {item.type === "error" && "⚠ "}
                                    {item.type === "result" && "← "}
                                    {item.content}
                                </div>
                            ))}
                        </ScrollArea>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default AdvancedCodeEditor;
