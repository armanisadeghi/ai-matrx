// components/AIHelpDialog.tsx
import {useEffect, useState} from 'react';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {Button} from '@/components/ui/button';
import {Cuboid, Code, Copy, Download, FileJson, Image, Loader2} from 'lucide-react';
import type {AIHelpContext} from '@/types/contextCollection';
import type {ImageQuality} from '@/types/screenshot';
import {AI_HELP_PROMPTS} from '@/constants/aiHelp';
import { highlightElements, removeHighlights } from '@/utils/highlighting';

interface AIHelpDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isCollecting: boolean;
    lastContext: AIHelpContext | null;
    onCopy: (text: string) => void;
    onSaveImage: (quality: ImageQuality) => void;
    onSaveContext: () => void;
    suggestedActions?: {
        label: string;
        action: string;
    }[];
    relevantElements?: string[];
}

export function AIHelpDialog(
    {
        isOpen,
        onOpenChange,
        isCollecting,
        lastContext,
        onCopy,
        onSaveImage,
        onSaveContext,
        relevantElements,
    }: AIHelpDialogProps) {
    const [imageQuality, setImageQuality] = useState<ImageQuality>('compressed');
    const [activeTab, setActiveTab] = useState('ai-ready');

    const getCurrentImageData = () => {
        if (!lastContext?.screenshot) return '';
        switch (imageQuality) {
            case 'full':
                return lastContext.screenshot.fullSize;
            case 'compressed':
                return lastContext.screenshot.compressed;
            case 'thumbnail':
                return lastContext.screenshot.thumbnail;
            default:
                return lastContext.screenshot.compressed;
        }
    };

    const getAPIReadyFormat = () => {
        if (!lastContext?.screenshot?.imageDataForAPI) return '';

        const apiData = {
            context: {
                ...lastContext,
                screenshot: undefined
            },
            image: lastContext.screenshot.imageDataForAPI
        };

        return JSON.stringify(apiData, null, 2);
    };

    useEffect(() => {
        if (isOpen && relevantElements && relevantElements.length > 0) {
            highlightElements(relevantElements);
            return () => {
                removeHighlights();
            };
        }
        return undefined;
    }, [isOpen, relevantElements]);

    const getAIReadyFormat = () => {
        if (!lastContext) return '';

        const {helpDocuments} = lastContext;
        const {screenshot, ...contextWithoutScreenshot} = lastContext;

        return [
            AI_HELP_PROMPTS.INITIAL_CONTEXT,
            '\n\n--- Help Documentation ---\n',
            JSON.stringify(helpDocuments, null, 2),
            '\n\n--- Screenshot (Base64) ---\n',
            screenshot.compressed,
            '\n\n--- Context Data ---\n',
            JSON.stringify(contextWithoutScreenshot, null, 2),
            '\n\n',
            AI_HELP_PROMPTS.FINAL_INSTRUCTION
        ].join('\n');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-[80vw] h-[85dvh] sm:h-[80dvh] max-w-[95vw] sm:max-w-[80vw] max-h-[85dvh] sm:max-h-[80dvh] flex flex-col">
                <DialogHeader className="px-6 pt-6">
                    <DialogTitle>Page Context & Help</DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-hidden px-6 pb-6">
                    {isCollecting ? (
                        <div className="flex items-center justify-center h-full">
                            <Loader2 className="h-8 w-8 animate-spin"/>
                        </div>
                    ) : lastContext ? (
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                            <TabsList className="flex w-full overflow-x-auto sm:grid sm:grid-cols-5">
                                <TabsTrigger value="ai-ready">
                                    <Cuboid className="h-4 w-4 mr-2"/>
                                    AI Ready
                                </TabsTrigger>
                                <TabsTrigger value="api-ready">
                                    <Code className="h-4 w-4 mr-2"/>
                                    API Format
                                </TabsTrigger>
                                <TabsTrigger value="screenshot">
                                    <Image className="h-4 w-4 mr-2"/>
                                    Screenshot
                                </TabsTrigger>
                                <TabsTrigger value="context">
                                    <FileJson className="h-4 w-4 mr-2"/>
                                    Context
                                </TabsTrigger>
                                <TabsTrigger value="export">
                                    <Download className="h-4 w-4 mr-2"/>
                                    Export
                                </TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-hidden mt-4">
                                {/* Existing AI Ready tab content remains the same */}
                                <TabsContent value="ai-ready" className="h-full">
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-end mb-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onCopy(getAIReadyFormat())}
                                            >
                                                <Copy className="h-4 w-4 mr-2"/>
                                                Copy AI Format
                                            </Button>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                <pre className="p-4 rounded-lg bg-muted h-full whitespace-pre-wrap">
                    {getAIReadyFormat()}
                </pre>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="api-ready" className="h-full">
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-end mb-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onCopy(getAPIReadyFormat())}
                                            >
                                                <Copy className="h-4 w-4 mr-2"/>
                                                Copy API Format
                                            </Button>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                      <pre className="p-4 rounded-lg bg-muted h-full whitespace-pre-wrap">
                                                {getAPIReadyFormat()}
                      </pre>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* Update the screenshot tab to use the new data structure */}
                                <TabsContent value="screenshot" className="h-full">
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-between items-center mb-2">
                                            <Select
                                                value={imageQuality}
                                                onValueChange={(value: ImageQuality) => setImageQuality(value)}
                                            >
                                                <SelectTrigger className="w-[180px]">
                                                    <SelectValue placeholder="Select quality"/>
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="thumbnail">Thumbnail</SelectItem>
                                                    <SelectItem value="compressed">Compressed</SelectItem>
                                                    <SelectItem value="full">Full Resolution</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onSaveImage(imageQuality)}
                                            >
                                                <Download className="h-4 w-4 mr-2"/>
                                                Save Current View
                                            </Button>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                                            <div className="border rounded-lg h-full">
                                                <img
                                                    src={lastContext.screenshot[imageQuality]}
                                                    alt="Page screenshot"
                                                    className="max-w-full h-auto"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="context" className="h-full">
                                    <div className="flex flex-col h-full">
                                        <div className="flex justify-end mb-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => onCopy(JSON.stringify(lastContext, null, 2))}
                                            >
                                                <Copy className="h-4 w-4 mr-2"/>
                                                Copy Context
                                            </Button>
                                        </div>
                                        <div className="flex-1 overflow-auto">
                      <pre className="p-4 rounded-lg bg-muted h-full whitespace-pre-wrap">
                        {JSON.stringify(lastContext, null, 2)}
                      </pre>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="export" className="h-full">
                                    <div className="flex flex-col gap-4 items-start">
                                        {lastContext?.screenshot?.thumbnail && (
                                            <div className="w-full p-4 border rounded-lg mb-2">
                                                <img
                                                    src={lastContext.screenshot.thumbnail}
                                                    alt="Preview"
                                                    className="max-w-[200px] h-auto mx-auto"
                                                />
                                            </div>
                                        )}
                                        <Button className="w-auto" onClick={() => onSaveImage('full')}>
                                            <Image className="h-4 w-4 mr-2"/>
                                            Save Full Resolution Screenshot
                                        </Button>
                                        <Button className="w-auto" onClick={onSaveContext}>
                                            <FileJson className="h-4 w-4 mr-2"/>
                                            Save Context Data
                                        </Button>
                                        <Button
                                            className="w-auto"
                                            onClick={() => {
                                                onSaveImage('full');
                                                onSaveContext();
                                            }}
                                        >
                                            <Download className="h-4 w-4 mr-2"/>
                                            Save All
                                        </Button>
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    ) : null}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default AIHelpDialog;
