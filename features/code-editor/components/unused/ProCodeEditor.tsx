'use client';

import {useState, useEffect} from 'react';
import { extractErrorMessage } from '@/utils/errors';
import Editor, {useMonaco, DiffEditor} from '@monaco-editor/react';
import {useMeasure} from "@uidotdev/usehooks";
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {ScrollArea} from '@/components/ui/scroll-area';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Toggle} from "@/components/ui/toggle";
import {
    Play,
    Loader2,
    Files,
    Terminal,
    GitCompare,
    Clipboard,
    Divide,
    RefreshCw,
    PanelLeftClose,
    FileCode2,
} from 'lucide-react';
import { useMonacoTheme } from '../../hooks/useMonacoTheme';

interface File {
    id: string;
    name: string;
    language: string;
    content: string;
}

interface DiffConfig {
    isEnabled: boolean;
    sourceContent: string;
    targetContent: string;
    sourceName: string;
    targetName: string;
}

const LANGUAGES = [
    {id: 'javascript', name: 'JavaScript', icon: '📜'},
    {id: 'typescript', name: 'TypeScript', icon: '💪'},
    {id: 'html', name: 'HTML', icon: '🌐'},
    {id: 'css', name: 'CSS', icon: '🎨'},
    {id: 'json', name: 'JSON', icon: '📋'},
    {id: 'python', name: 'Python', icon: '🐍'},
];


const ProCodeEditor = () => {
    const [ref, { width, height }] = useMeasure();
    const monaco = useMonaco();
    const isDark = useMonacoTheme();

    const [isDiffView, setIsDiffView] = useState(false);
    const [activeFile, setActiveFile] = useState<string>('main.js');
    const [files, setFiles] = useState<File[]>([{
        id: '1',
        name: 'main.js',
        language: 'javascript',
        content: '// Start coding here...'
    }]);
    const [output, setOutput] = useState<Array<{
        type: 'log' | 'error' | 'result' | 'info',
        content: string,
        timestamp: string
    }>>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [showOutput, setShowOutput] = useState(true);
    const [diffConfig, setDiffConfig] = useState<DiffConfig>({
        isEnabled: false,
        sourceContent: '',
        targetContent: '',
        sourceName: '',
        targetName: ''
    });
    const [clipboardContent, setClipboardContent] = useState<string>('');

    const getCurrentFile = () => files.find(f => f.name === activeFile) || files[0];

    // Configure editor themes based on system theme
    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme('customDark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#202124',
                    'editor.foreground': '#D4D4D4',
                    'editorLineNumber.foreground': '#858585',
                    'editor.selectionBackground': '#264F78',
                    'editor.lineHighlightBackground': '#2A2D2E',
                }
            });

            monaco.editor.defineTheme('customLight', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': '#FFFFFF',
                    'editor.foreground': '#000000',
                    'editorLineNumber.foreground': '#237893',
                    'editor.selectionBackground': '#ADD6FF',
                    'editor.lineHighlightBackground': '#F0F0F0',
                }
            });
        }
    }, [monaco]);


    const handleCompareWithClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setClipboardContent(text);
            setDiffConfig({
                isEnabled: true,
                sourceContent: getCurrentFile()?.content || '',
                targetContent: text,
                sourceName: getCurrentFile()?.name || 'Current File',
                targetName: 'Clipboard Content'
            });
        } catch (err) {
            addLogEntry('error', 'Failed to read clipboard content');
        }
    };

    const handleCompareFiles = (sourceId: string, targetId: string) => {
        const sourceFile = files.find(f => f.id === sourceId);
        const targetFile = files.find(f => f.id === targetId);

        if (sourceFile && targetFile) {
            setDiffConfig({
                isEnabled: true,
                sourceContent: sourceFile.content,
                targetContent: targetFile.content,
                sourceName: sourceFile.name,
                targetName: targetFile.name
            });
        }
    };

    const addLogEntry = (type: 'log' | 'error' | 'result' | 'info', content: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setOutput(prev => [...prev, {type, content, timestamp}]);
    };

    const runCode = async () => {
        setIsRunning(true);
        const startTime = performance.now();
        addLogEntry('info', 'Executing code...');

        const customConsole = {
            log: (...args: any[]) => {
                addLogEntry('log', args.map(arg =>
                    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                ).join(' '));
            }
        };

        try {
            const currentFile = getCurrentFile();
            const func = new Function('console', `
        try {
          ${currentFile.content}
        } catch (error) {
          console.log('Error:', error.message);
        }
      `);

            const result = func(customConsole);
            if (result !== undefined) {
                addLogEntry('result', `Returned: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : result}`);
            }
        } catch (error) {
            addLogEntry('error', `Runtime Error: ${extractErrorMessage(error)}`);
        }

        const executionTime = (performance.now() - startTime).toFixed(2);
        addLogEntry('info', `Execution completed in ${executionTime}ms`);
        setIsRunning(false);
    };

    const toggleDiffView = () => {
        setIsDiffView(!isDiffView);
    };

    const handleFileChange = (content: string | undefined) => {
        if (!content) return;
        setFiles(files.map(f =>
            f.name === activeFile ? {...f, content} : f
        ));
    };

    const formatCode = () => {
        if (monaco) {
            const editor = monaco.editor.getModels()[0];
            if (editor) {
                monaco.editor.getEditors()[0].getAction('editor.action.formatDocument').run();
            }
        }
    };
    const EditorComponent = diffConfig.isEnabled ? DiffEditor : Editor;
    const editorProps = diffConfig.isEnabled ? {
        original: diffConfig.sourceContent,
        modified: diffConfig.targetContent,
    } : {
        value: getCurrentFile()?.content,
        onChange: handleFileChange,
    };


    const addNewFile = () => {
        const newFile = {
            id: Date.now().toString(),
            name: `file${files.length + 1}.js`,
            language: 'javascript',
            content: '// New file',
            originalContent: '// Original content'
        };
        setFiles([...files, newFile]);
        setActiveFile(newFile.name);
    };


    return (
        <div ref={ref} className="flex flex-col w-full h-full">
            <Card className="flex flex-col w-full h-full border-none">
                <div className="flex items-center justify-between p-2 border-b bg-background">
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSidebar(!showSidebar)}
                        >
                            {showSidebar ? <PanelLeftClose size={18}/> : <Files size={18}/>}
                        </Button>

                        <Select value={getCurrentFile()?.language}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Select language"/>
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

                        <Toggle
                            pressed={isDiffView}
                            onPressedChange={toggleDiffView}
                            aria-label="Toggle diff view"
                            className="gap-2"
                        >
                            <GitCompare size={16}/>
                            Diff View
                        </Toggle>
                    </div>

                    <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={formatCode}
                            title="Format Code"
                        >
                            <Divide size={18}/>
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowOutput(!showOutput)}
                            title="Toggle Output"
                        >
                            <Terminal size={18}/>
                        </Button>

                        <Button
                            onClick={runCode}
                            disabled={isRunning}
                            className="flex items-center"
                        >
                            {isRunning ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                            ) : (
                                <Play className="mr-2 h-4 w-4"/>
                            )}
                            Run
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSidebar(!showSidebar)}
                        >
                            {showSidebar ? <PanelLeftClose size={18}/> : <Files size={18}/>}
                        </Button>

                        <Select value={getCurrentFile()?.language}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="Select language"/>
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

                        <Toggle
                            pressed={isDiffView}
                            onPressedChange={toggleDiffView}
                            aria-label="Toggle diff view"
                            className="gap-2"
                            onClick={handleCompareWithClipboard}
                            title="Compare with clipboard"
                        >
                            <Clipboard size={16}/>
                            Compare Clipboard
                        </Toggle>

                    </div>
                </div>

                <div className="flex flex-grow">
                    {showSidebar && (
                        <div className="w-48 border-r bg-muted/30 p-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-medium">Files</h3>
                                <Button variant="ghost" size="icon" onClick={addNewFile}>
                                    <FileCode2 size={16}/>
                                </Button>
                            </div>
                            <ScrollArea className="h-full">
                                {files.map((file) => (
                                    <div
                                        key={file.id}
                                        className={`flex items-center p-2 rounded-md cursor-pointer ${
                                            activeFile === file.name
                                                ? 'bg-muted'
                                                : 'hover:bg-muted/50'
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

                    <div className="flex-grow bg-background">
                        <EditorComponent
                            height={`${height - (showOutput ? 200 : 50)}px`}
                            defaultLanguage={getCurrentFile()?.language}
                            {...editorProps}
                            theme={isDark ? 'customDark' : 'customLight'}
                            options={{
                                minimap: {enabled: true},
                                fontSize: 14,
                                lineNumbers: 'on',
                                roundedSelection: false,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: {top: 10},
                                suggestOnTriggerCharacters: true,
                                formatOnPaste: true,
                                formatOnType: true,
                                diffWordWrap: 'on',
                                readOnly: diffConfig.isEnabled, // Make diff view read-only
                            }}
                        />
                    </div>
                </div>

                {showOutput && (
                    <div className="h-[200px] border-t bg-background">
                        <div className="flex items-center justify-between p-2 bg-muted/30">
                            <span className="text-sm font-medium">Console Output</span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setOutput([])}
                                title="Clear Console"
                            >
                                <RefreshCw size={16}/>
                            </Button>
                        </div>
                        <ScrollArea className="h-[160px] p-4">
                            {output.map((item, index) => (
                                <div
                                    key={index}
                                    className={`font-mono text-sm mb-1 ${
                                        item.type === 'error'
                                            ? 'text-destructive'
                                            : item.type === 'result'
                                                ? 'text-green-500'
                                                : item.type === 'info'
                                                    ? 'text-muted-foreground'
                                                    : ''
                                    }`}
                                >
                                      <span className="text-xs text-muted-foreground mr-2">
                                        [{item.timestamp}]
                                      </span>
                                    {item.type === 'log' && '> '}
                                    {item.type === 'error' && '⚠ '}
                                    {item.type === 'result' && '← '}
                                    {item.type === 'info' && 'ℹ '}
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

export default ProCodeEditor;