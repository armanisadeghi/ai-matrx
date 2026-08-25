// components/screenshot/ScreenshotDemo.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useScreenshot } from '@/hooks/useScreenshot';
import { Loader2, Download } from 'lucide-react';
import type { ProcessedScreenshotData } from '@/types/screenshot';

export default function ScreenshotDemo() {
    const [preview, setPreview] = useState<ProcessedScreenshotData | null>(null);
    const [activeTab, setActiveTab] = useState('full');

    const { captureScreen, isCapturing, error } = useScreenshot({
        excludeSelectors: ['.no-capture'] // Example: elements with this class won't be captured
    });

    const handleCapture = async () => {
        try {
            const data = await captureScreen();
            setPreview(data);
        } catch (err) {
            console.error('Failed to capture:', err);
        }
    };

    const handleDownload = (imageData: string, quality: string) => {
        const link = document.createElement('a');
        link.href = imageData;
        link.download = `screenshot-${quality}-${new Date().toISOString()}.png`;
        link.click();
    };

    return (
        <div className="p-6 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Screenshot Test</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-4 items-center">
                        <Button
                            onClick={handleCapture}
                            disabled={isCapturing}
                        >
                            {isCapturing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Capture Screenshot
                        </Button>
                        <div className="no-capture text-sm text-muted-foreground">
                            (This text won't be captured)
                        </div>
                    </div>

                    {error && (
                        <div className="text-sm text-destructive">
                            Error: {error.message}
                        </div>
                    )}

                    {preview && (
                        <div className="space-y-4">
                            <Tabs value={activeTab} onValueChange={setActiveTab}>
                                <div className="flex justify-between items-center">
                                    <TabsList>
                                        <TabsTrigger value="full">Full Resolution</TabsTrigger>
                                        <TabsTrigger value="compressed">Compressed</TabsTrigger>
                                        <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
                                        <TabsTrigger value="api">API Format</TabsTrigger>
                                        <TabsTrigger value="metadata">Metadata</TabsTrigger>
                                    </TabsList>
                                    {activeTab !== 'api' && activeTab !== 'metadata' && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleDownload(
                                                preview[activeTab as keyof Pick<ProcessedScreenshotData, 'fullSize' | 'compressed' | 'thumbnail'>],
                                                activeTab
                                            )}
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Download
                                        </Button>
                                    )}
                                </div>

                                <TabsContent value="full" className="mt-4">
                                    <div className="border rounded-lg overflow-hidden">
                                        <img
                                            src={preview.fullSize}
                                            alt="Full resolution preview"
                                            className="max-w-full h-auto"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="compressed" className="mt-4">
                                    <div className="border rounded-lg overflow-hidden">
                                        <img
                                            src={preview.compressed}
                                            alt="Compressed preview"
                                            className="max-w-full h-auto"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="thumbnail" className="mt-4">
                                    <div className="border rounded-lg overflow-hidden">
                                        <img
                                            src={preview.thumbnail}
                                            alt="Thumbnail preview"
                                            className="max-w-full h-auto"
                                        />
                                    </div>
                                </TabsContent>

                                <TabsContent value="api" className="mt-4">
                                    <div className="border rounded-lg p-4 bg-muted">
                                        <pre className="whitespace-pre-wrap overflow-auto max-h-[500px]">
                                            {JSON.stringify(preview.imageDataForAPI, null, 2)}
                                        </pre>
                                    </div>
                                </TabsContent>

                                <TabsContent value="metadata" className="mt-4">
                                    <div className="border rounded-lg p-4 bg-muted">
                                        <pre className="whitespace-pre-wrap">
                                            {JSON.stringify(preview.metadata, null, 2)}
                                        </pre>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
