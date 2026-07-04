"use client";

import { useEffect, useState } from "react";
import {
  Headphones,
  ChevronDown,
  ChevronRight,
  Volume2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AudioDevicesPanel } from "@/features/audio/components/devices/AudioDevicesPanel";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  generateSpokenFront,
  getCachedSpokenFrontFileId,
} from "../spoken-front/generateSpokenFront.thunk";

export interface VoiceTestAudioSetupProps {
  card: { id: string; front: string };
  initialSpokenFrontFileId?: string | null;
  onStart: (spokenFrontFileId: string | null) => void;
  starting: boolean;
  startError: string | null;
  answerSeconds: number;
}

export function VoiceTestAudioSetup({
  card,
  initialSpokenFrontFileId,
  onStart,
  starting,
  startError,
  answerSeconds,
}: VoiceTestAudioSetupProps) {
  const dispatch = useAppDispatch();
  const [showDevices, setShowDevices] = useState(false);
  const [spokenFrontFileId, setSpokenFrontFileId] = useState<string | null>(
    initialSpokenFrontFileId ?? null,
  );
  const [checkingCache, setCheckingCache] = useState(!initialSpokenFrontFileId);
  const [prepping, setPrepping] = useState(false);
  const [prepError, setPrepError] = useState(false);

  useEffect(() => {
    if (initialSpokenFrontFileId) {
      setSpokenFrontFileId(initialSpokenFrontFileId);
      setCheckingCache(false);
      return undefined;
    }

    let cancelled = false;
    setCheckingCache(true);
    void (async () => {
      const cached = await getCachedSpokenFrontFileId(card.id);
      if (cancelled) return;
      if (cached) setSpokenFrontFileId(cached);
      setCheckingCache(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [card.id, initialSpokenFrontFileId]);

  const prepareAudio = (): void => {
    void (async () => {
      setPrepping(true);
      setPrepError(false);
      const fileId = await dispatch(generateSpokenFront(card, 0, 1));
      setPrepping(false);
      if (fileId) {
        setSpokenFrontFileId(fileId);
      } else {
        setPrepError(true);
      }
    })();
  };

  const audioReady = !!spokenFrontFileId;
  const canStart = !starting && !checkingCache;

  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Voice test</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;ll have {answerSeconds} seconds to answer after the question.
        </p>
      </div>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left text-sm font-medium leading-snug text-foreground">
        {card.front}
      </p>

      {startError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {startError}
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        disabled={!canStart}
        onClick={() => onStart(spokenFrontFileId)}
      >
        {starting ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Starting…
          </>
        ) : checkingCache ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </>
        ) : (
          <>
            <Mic className="h-5 w-5" />
            Start
          </>
        )}
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-3">
        {!audioReady && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground"
            disabled={prepping || checkingCache}
            onClick={prepareAudio}
          >
            {prepping ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            {prepping
              ? "Preparing…"
              : prepError
                ? "Retry prepare"
                : "Prepare audio"}
          </Button>
        )}
        {audioReady && (
          <span className="inline-flex h-8 items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Audio ready
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs",
            showDevices ? "text-foreground" : "text-muted-foreground",
          )}
          onClick={() => setShowDevices((v) => !v)}
        >
          <Headphones className="h-3.5 w-3.5" />
          Audio settings
          {showDevices ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </div>

      {showDevices && (
        <section className="overflow-hidden rounded-xl border border-border bg-background">
          <AudioDevicesPanel />
        </section>
      )}
    </div>
  );
}
