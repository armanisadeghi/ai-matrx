'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Mic,
    Pause,
    Play,
    StopCircle,
    Volume2,
    VolumeX,
    RefreshCcw
} from 'lucide-react';
import { useRecorder } from '@/app/(dev)/demos/tests/audio-recorder-test/hooks/useRecorder';
import { useAudioStore } from '@/hooks/idb/useAudioStore';
import { Recording } from '@/types/audioRecording.types';
import { useToast } from '@/components/ui/use-toast';

export default function AudioRecorderPage() {
    const { toast } = useToast();
    const audioStore = useAudioStore();
    const [logs, setLogs] = useState<string[]>([]);
    const [audioLevel, setAudioLevel] = useState<number>(0);
    const [permissionStatus, setPermissionStatus] = useState<PermissionState>('prompt');
    const [recordings, setRecordings] = useState<Recording[]>([]);
    const [currentPlayingId, setCurrentPlayingId] = useState<number | null>(null);
    const [audioElements, setAudioElements] = useState<{ [key: number]: HTMLAudioElement | null }>({});
    const [error, setError] = useState<string | null>(null);

    const addLog = (message: string) => {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp}: ${message}`;
        console.log(logMessage);
        setLogs(prev => [...prev, logMessage]);
    };

    const {
        isRecording,
        isPaused,
        duration,
        formattedDuration,
        error: recorderError,
        startRecording,
        stopRecording,
        pauseRecording,
        resumeRecording,
        currentRecording,
        previewStream,
        loading
    } = useRecorder({
        onRecordingStart: () => {
            addLog('Recording started');
            toast({
                title: 'Recording Started',
                description: 'The recording has begun successfully.',
            });
        },
        onRecordingStop: (recording) => {
            addLog(`Recording stopped. ID: ${recording.id}`);
            loadRecordings();
            toast({
                title: 'Recording Stopped',
                description: `Recording saved: ${recording.filename}`,
            });
        }
    });

    useEffect(() => {
        const checkPermissions = async () => {
            try {
                const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                setPermissionStatus(permission.state);

                permission.addEventListener('change', () => {
                    setPermissionStatus(permission.state);
                });
            } catch (err) {
                setError('Failed to check microphone permissions');
            }
        };

        checkPermissions();
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

            if (currentPlayingId && audioElements[currentPlayingId]) {
                audioElements[currentPlayingId].pause();
            }

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
            toast({
                variant: 'destructive',
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to play recording'
            });
        }
    };

    return (
        <div className="space-y-4">
            <Tabs defaultValue="record" className="w-full">
                <TabsList>
                    <TabsTrigger value="record">Record</TabsTrigger>
                    <TabsTrigger value="library">Library</TabsTrigger>
                </TabsList>

                <TabsContent value="record">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>New Recording</span>
                                <div className="flex gap-2">
                                    {loading && <Badge variant="secondary">Loading...</Badge>}
                                    <Badge variant={isRecording ? "destructive" : "secondary"}>
                                        {isRecording ? "Recording" : "Idle"}
                                    </Badge>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Status Display */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Permission</div>
                                    <Badge variant={
                                        permissionStatus === 'granted' ? 'success' :
                                            permissionStatus === 'denied' ? 'destructive' :
                                                'secondary'
                                    }>
                                        {permissionStatus}
                                    </Badge>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Stream</div>
                                    <Badge variant="outline">
                                        {previewStream ? (
                                            <span className="flex items-center gap-1">
                                                <Volume2 className="w-3 h-3" />
                                                Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1">
                                                <VolumeX className="w-3 h-3" />
                                                None
                                            </span>
                                        )}
                                    </Badge>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Status</div>
                                    <Badge variant={isRecording ? "destructive" : "secondary"}>
                                        {isRecording ? (isPaused ? "Paused" : "Recording") : "Ready"}
                                    </Badge>
                                </div>

                                <div className="space-y-1">
                                    <div className="text-sm font-medium">Duration</div>
                                    <Badge variant="outline">{formattedDuration}</Badge>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    onClick={startRecording}
                                    disabled={isRecording || loading || permissionStatus === 'denied'}
                                    variant="default"
                                >
                                    <Mic className="w-4 h-4 mr-2" />
                                    Start Recording
                                </Button>

                                {isRecording && !isPaused && (
                                    <Button onClick={pauseRecording} variant="secondary">
                                        <Pause className="w-4 h-4 mr-2" />
                                        Pause
                                    </Button>
                                )}

                                {isPaused && (
                                    <Button onClick={resumeRecording} variant="secondary">
                                        <Play className="w-4 h-4 mr-2" />
                                        Resume
                                    </Button>
                                )}

                                {isRecording && (
                                    <Button onClick={stopRecording} variant="destructive">
                                        <StopCircle className="w-4 h-4 mr-2" />
                                        Stop Recording
                                    </Button>
                                )}
                            </div>

                            {/* Debug Logs */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm">Debug Log</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ScrollArea className="h-[200px] w-full rounded-md border">
                                        <div className="p-4 space-y-1">
                                            {logs.map((log, index) => (
                                                <div key={index} className="text-xs font-mono">
                                                    {log}
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </CardContent>
                            </Card>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="library">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between">
                                <span>Saved Recordings</span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={loadRecordings}
                                >
                                    <RefreshCcw className="w-4 h-4 mr-2" />
                                    Refresh
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[500px]">
                                <div className="space-y-2 pr-4">
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
                </TabsContent>
            </Tabs>
        </div>
    );
}