// DownloadEndpointCard.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Download, Check, AlertCircle } from "lucide-react";
import { EndpointCardProps as DownloadEndpointCardProps } from './types';
import { DirectoryStructureForm, DirectoryStructureParams } from './directory-structure';

export const DownloadEndpointCard = ({ endpoint, baseUrl }: DownloadEndpointCardProps) => {
    const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const handleDownload = async (params?: DirectoryStructureParams) => {
        try {
            setDownloadStatus('downloading');
            setProgress(0);
            setError(null);

            // Construct URL with parameters if they exist
            let url = endpoint.url;
            if (params) {
                const urlParams = new URLSearchParams({
                    root_directory: params.root_directory,
                    project_root: params.project_root
                });

                if (params.common_configs) {
                    urlParams.append(
                        'common_configs',
                        typeof params.common_configs === 'string'
                            ? params.common_configs
                            : JSON.stringify(params.common_configs)
                    );
                }
                url = `${url}?${urlParams.toString()}`;
            }

            const response = await fetch(`${baseUrl}${url}`, {
                method: endpoint.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Get filename from Content-Disposition header if present
            const contentDisposition = response.headers.get('content-disposition');
            let filename = 'downloaded_file';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (filenameMatch && filenameMatch[1]) {
                    filename = filenameMatch[1].replace(/['"]/g, '');
                }
            }

            // Handle streaming download with progress
            const reader = response.body?.getReader();
            const contentLength = +(response.headers.get('Content-Length') ?? '0');

            if (!reader) {
                throw new Error('Unable to read response');
            }

            // Read the data
            const chunks = [];
            let receivedLength = 0;

            while(true) {
                const {done, value} = await reader.read();

                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                if (contentLength) {
                    setProgress((receivedLength / contentLength) * 100);
                }
            }

            // Combine chunks into a single Blob
            const blob = new Blob(chunks);

            // Create and click download link
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);

            setDownloadStatus('success');
            setTimeout(() => setDownloadStatus('idle'), 2000);
        } catch (err) {
            setDownloadStatus('error');
            setError(err instanceof Error ? err.message : 'Download failed');
        }
    };

    return (
        <Card className="mt-4">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{endpoint.name}</CardTitle>
                    <Badge variant="outline">{endpoint.method}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{endpoint.description}</p>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {endpoint.id.startsWith('generateStructure') ? (
                        <>
                            <DirectoryStructureForm
                                onSubmit={handleDownload}
                                loading={downloadStatus === 'downloading'}
                            />

                            {downloadStatus === 'downloading' && (
                                <Progress value={progress} className="w-full" />
                            )}
                        </>
                    ) : (
                        <Button
                            onClick={() => handleDownload()}
                            disabled={downloadStatus === 'downloading'}
                            className="w-full"
                            variant={downloadStatus === 'success' ? 'outline' : 'default'}
                        >
                            {downloadStatus === 'downloading' && (
                                <>
                                    <Download className="mr-2 h-4 w-4 animate-bounce" />
                                    Downloading...
                                </>
                            )}
                            {downloadStatus === 'success' && (
                                <>
                                    <Check className="mr-2 h-4 w-4 text-green-500" />
                                    Downloaded
                                </>
                            )}
                            {downloadStatus === 'error' && (
                                <>
                                    <AlertCircle className="mr-2 h-4 w-4 text-red-500" />
                                    Retry Download
                                </>
                            )}
                            {downloadStatus === 'idle' && (
                                <>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download File
                                </>
                            )}
                        </Button>
                    )}

                    {error && (
                        <Alert variant="destructive">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </div>
            </CardContent>
        </Card>
    );
};