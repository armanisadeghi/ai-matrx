'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, AlertCircle } from 'lucide-react';
import { useAudioStore } from '@/hooks/idb/useAudioStore';
import { Recording } from '@/types/audioRecording.types';

export default function RecordingManagerPage() {
    const audioStore = useAudioStore();
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null);
    const [audioElements, setAudioElements] = useState<{ [key: number]: HTMLAudioElement | null }>({});

    useEffect(() => {
        loadRecordings();
    }, []);

    const loadRecordings = async () => {
        try {
            const result = await audioStore.getAllRecordings();
            if (result.error) throw new Error(result.error);
            setRecordings(result.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load recordings');
        }
    };

    const playRecording = async (recordingId: number) => {
        try {
            if (currentPlayingId === recordingId) {
                audioElements[recordingId]?.pause();
                setCurrentPlayingId(null);
                return;
            }

            // Stop any currently playing audio
            if (currentPlayingId && audioElements[currentPlayingId]) {
                audioElements[currentPlayingId].pause();
            }

            // If we haven't loaded this recording's audio yet
            if (!audioElements[recordingId]) {
                const result = await audioStore.getRecordingWithChunks(recordingId);
                if (result.error) throw new Error(result.error);
                if (!result.data || !result.data.chunks) {
                    throw new Error('No recording data found');
                }

                const chunks = result.data.chunks;
                const blob = new Blob(chunks.map(chunk => chunk.blob), { type: 'audio/webm;codecs=opus' });
                const url = URL.createObjectURL(blob);

                const audio = new Audio(url);
                audio.addEventListener('ended', () => {
                    setCurrentPlayingId(null);
                });

                setAudioElements(prev => ({
                    ...prev,
                    [recordingId]: audio
                }));

                audio.play();
            } else {
                audioElements[recordingId]?.play();
            }

            setCurrentPlayingId(recordingId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to play recording');
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Saved Recordings</CardTitle>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <ScrollArea className="h-[500px] pr-4">
                        <div className="space-y-2">
                            {recordings.map(recording => (
                                <Card key={recording.id} className="p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-medium">{recording.title}</h3>
                                            <div className="text-sm text-muted-foreground">
                                                {new Date(recording.created_at).toLocaleString()}
                                            </div>
                                            <div className="flex gap-2 mt-1">
                                                <Badge variant="outline">
                                                    {recording.status}
                                                </Badge>
                                                <Badge variant="outline">
                                                    {(recording.size / 1024).toFixed(1)} KB
                                                </Badge>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => playRecording(recording.id)}
                                        >
                                            {currentPlayingId === recording.id ? (
                                                <Pause className="h-4 w-4" />
                                            ) : (
                                                <Play className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}