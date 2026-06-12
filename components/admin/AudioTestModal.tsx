'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { parseMarkdownToText } from '@/utils/markdown-processors/parse-markdown-for-speech';
import { useCartesiaWithPreferences } from '@/hooks/tts/simple/useCartesiaWithPreferences';
import {
  Play,
  Pause,
  Square,
  Volume2,
  FileText,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface AudioTestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  markdownContent: string;
}

export function AudioTestModal({
  open,
  onOpenChange,
  markdownContent,
}: AudioTestModalProps) {
  const [speechText, setSpeechText] = useState('');
  const [copied, setCopied] = useState(false);

  // Convert markdown to speech text when modal opens or content changes
  useEffect(() => {
    if (open && markdownContent) {
      const converted = parseMarkdownToText(markdownContent);
      setSpeechText(converted);
    }
  }, [open, markdownContent]);

  // Early return if modal is not open - don't initialize audio hook
  if (!open) {
    return null;
  }

  return <AudioTestModalContent 
    open={open}
    onOpenChange={onOpenChange}
    speechText={speechText}
    setCopied={setCopied}
    copied={copied}
  />;
}

// Separate component that only mounts when modal is open
function AudioTestModalContent({
  open,
  onOpenChange,
  speechText,
  copied,
  setCopied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  speechText: string;
  copied: boolean;
  setCopied: (copied: boolean) => void;
}) {
  const {
    connectionState,
    playerState,
    speak,
    pause,
    resume,
    stop,
  } = useCartesiaWithPreferences({
    processMarkdown: false, // Already processed in speechText
    onError: (error) => {
      toast.error('Audio playback failed', { description: error });
    },
  });

  const handlePlay = async () => {
    if (!speechText.trim()) {
      toast.error('No content to play');
      return;
    }

    if (connectionState !== 'ready') {
      toast.error('Audio system not ready. Please wait...');
      return;
    }

    try {
      await speak(speechText);
    } catch (error) {
      console.error('Error playing audio:', error);
      toast.error('Failed to play audio');
    }
  };

  const handlePause = async () => {
    try {
      await pause();
    } catch (error) {
      console.error('Error pausing audio:', error);
    }
  };

  const handleResume = async () => {
    try {
      await resume();
    } catch (error) {
      console.error('Error resuming audio:', error);
    }
  };

  const handleStop = async () => {
    try {
      await stop();
    } catch (error) {
      console.error('Error stopping audio:', error);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(speechText);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const getConnectionStatusBadge = () => {
    const statusMap = {
      idle: { variant: 'secondary' as const, text: 'Initializing' },
      'fetching-token': { variant: 'secondary' as const, text: 'Connecting...' },
      connecting: { variant: 'secondary' as const, text: 'Connecting...' },
      ready: { variant: 'default' as const, text: 'Ready' },
      disconnected: { variant: 'destructive' as const, text: 'Disconnected' },
    };
    
    const status = statusMap[connectionState] || statusMap.idle;
    return (
      <Badge variant={status.variant} className="text-xs">
        {status.text}
      </Badge>
    );
  };

  const getPlayerStatusBadge = () => {
    const statusMap = {
      idle: { variant: 'outline' as const, text: 'Idle' },
      playing: { variant: 'default' as const, text: 'Playing' },
      paused: { variant: 'secondary' as const, text: 'Paused' },
    };
    
    const status = statusMap[playerState] || statusMap.idle;
    return (
      <Badge variant={status.variant} className="text-xs">
        {status.text}
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Audio Preview & Testing
          </DialogTitle>
          <DialogDescription>
            Test how your markdown content sounds when converted to speech
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Connection:</span>
          {getConnectionStatusBadge()}
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">Player:</span>
          {getPlayerStatusBadge()}
          <Separator orientation="vertical" className="h-4" />
          <Badge variant="secondary" className="text-xs">
            {speechText.length} chars
          </Badge>
        </div>

        <Separator />

        {/* Audio Controls */}
        <div className="flex items-center gap-2">
          {playerState === 'idle' && (
            <Button
              onClick={handlePlay}
              disabled={connectionState !== 'ready' || !speechText.trim()}
              size="sm"
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Play Audio
            </Button>
          )}

          {playerState === 'playing' && (
            <Button onClick={handlePause} size="sm" variant="secondary" className="gap-2">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          {playerState === 'paused' && (
            <Button onClick={handleResume} size="sm" className="gap-2">
              <Play className="h-4 w-4" />
              Resume
            </Button>
          )}

          {(playerState === 'playing' || playerState === 'paused') && (
            <Button onClick={handleStop} size="sm" variant="destructive" className="gap-2">
              <Square className="h-4 w-4" />
              Stop
            </Button>
          )}

          <Button onClick={handleCopy} size="sm" variant="outline" className="gap-2 ml-auto">
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Text
              </>
            )}
          </Button>
        </div>

        <Separator />

        {/* Converted Speech Text */}
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Audio-Ready Text</h4>
            <Badge variant="outline" className="text-xs">
              What the TTS will speak
            </Badge>
          </div>

          <div className="flex-1 overflow-auto border rounded-lg bg-textured p-4">
            <div className="font-mono text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-gray-100">
              {speechText || (
                <span className="text-muted-foreground italic">
                  No content to convert. Enter some markdown content first.
                </span>
              )}
            </div>
          </div>
        </div>

        {connectionState === 'disconnected' && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            Audio system disconnected. Please close and reopen this dialog to reconnect.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}