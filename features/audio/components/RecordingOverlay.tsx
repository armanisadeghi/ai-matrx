"use client";

import { useState } from "react";
import { Mic, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDurationSeconds } from "@ai-matrx/kit/format";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RecordingOverlayProps {
    duration: number;
    audioLevel?: number;
    isPaused?: boolean;
    onStop: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onCancel?: () => void;
}

export function RecordingOverlay({ 
    duration, 
    audioLevel = 0, 
    isPaused = false,
    onStop,
    onPause,
    onResume,
    onCancel
}: RecordingOverlayProps) {
    const [showCancelDialog, setShowCancelDialog] = useState(false);

    const handleCancelClick = () => {
        if (onPause) onPause();
        setShowCancelDialog(true);
    };

    const handleCancelConfirm = () => {
        setShowCancelDialog(false);
        if (onCancel) onCancel();
    };

    const handleCancelAbort = () => {
        setShowCancelDialog(false);
        if (onResume) onResume();
    };

    const handleMicClick = () => {
        if (isPaused) {
            if (onResume) onResume();
        } else {
            if (onPause) onPause();
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-50" />

            {/* Recording Overlay - Centered */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-background/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl p-8 flex flex-col items-center gap-6 max-w-xs w-full">
                    {/* Animated Microphone - Clickable for pause/resume */}
                    <button
                        onClick={handleMicClick}
                        className="relative group cursor-pointer"
                    >
                        {/* Pulsing rings - only show when not paused */}
                        {!isPaused && (
                            <div className="absolute inset-0 -m-4">
                                <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse" />
                            </div>
                        )}
                        
                        {/* Mic icon */}
                        <div className={cn(
                            "relative p-6 rounded-full shadow-lg transition-all duration-200",
                            isPaused 
                                ? "bg-gradient-to-br from-gray-500 to-gray-600 group-hover:from-gray-600 group-hover:to-gray-700" 
                                : "bg-gradient-to-br from-red-500 to-red-600 group-hover:from-red-600 group-hover:to-red-700",
                            !isPaused && audioLevel > 0.5 && "scale-110"
                        )}>
                            {isPaused ? (
                                <Play className="h-10 w-10 text-white" />
                            ) : (
                                <Pause className="h-10 w-10 text-white" />
                            )}
                        </div>
                    </button>

                    {/* Duration */}
                    <div className="text-center">
                        <div className="text-3xl font-bold text-foreground tabular-nums">
                            {formatDurationSeconds(duration, { style: 'clock' })}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                            {isPaused ? "Paused" : "Recording..."}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="w-full space-y-2">
                        <Button
                            onClick={onStop}
                            className="w-full h-12 text-base font-semibold"
                            style={{ fontSize: '16px' }}
                        >
                            Stop & Transcribe
                        </Button>
                        <Button
                            onClick={handleCancelClick}
                            variant="outline"
                            className="w-full h-12 text-base font-semibold text-destructive hover:text-destructive"
                            style={{ fontSize: '16px' }}
                        >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                        </Button>
                    </div>
                </div>
            </div>

            {/* Cancel Confirmation Dialog */}
            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Recording?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to cancel? Your recording will be deleted and no transcription will be created.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleCancelAbort}>
                            Continue Recording
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleCancelConfirm}
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            Yes, Cancel Recording
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

