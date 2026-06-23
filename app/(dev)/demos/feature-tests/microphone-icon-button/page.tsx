'use client';

import React, { useState } from 'react';
import { MicrophoneIconButton, MicVariant } from '@/features/audio/components/MicrophoneIconButton';
import { VoiceTextarea } from '@/components/official/VoiceTextarea';
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { VoiceInputButton } from '@/components/official/VoiceInputButton';
import { toast } from 'sonner';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3">{children}</div>
    </div>
  );
}

function ResultLog({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground/50 italic">No results yet</p>;
  return (
    <div className="space-y-1.5 max-h-40 overflow-y-auto">
      {items.map((text, i) => (
        <div key={i} className="text-xs bg-muted/40 rounded px-2.5 py-1.5 leading-relaxed">{text}</div>
      ))}
    </div>
  );
}

function MicIconVariants() {
  const [results, setResults] = useState<Record<MicVariant, string[]>>({
    'icon-only': [], 'inline-expand': [], 'modal-controls': [],
  });

  const append = (variant: MicVariant, text: string) =>
    setResults(prev => ({ ...prev, [variant]: [text, ...prev[variant]] }));

  return (
    <Section title="MicrophoneIconButton — 3 variants">
      <div className="grid gap-5">
        {(['icon-only', 'inline-expand', 'modal-controls'] as const).map(v => (
          <div key={v} className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-xs font-medium text-muted-foreground w-28 shrink-0">{v}</p>
              <MicrophoneIconButton
                variant={v}
                onTranscriptionComplete={(t) => append(v, t)}
                size="md"
              />
            </div>
            <ResultLog items={results[v]} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function VoiceTextareaDemo() {
  const [value, setValue] = useState('');
  return (
    <Section title="VoiceTextarea — streaming live transcript in textarea">
      <VoiceTextarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Click the mic icon to start speaking..."
        rows={3}
        onTranscriptionComplete={(text) => toast.success(`Transcription: ${text.slice(0, 60)}...`)}
      />
    </Section>
  );
}

function VoiceInputButtonDemo() {
  const [results, setResults] = useState<string[]>([]);
  return (
    <Section title="VoiceInputButton — inline and button variants">
      <div className="flex items-center gap-4">
        <VoiceInputButton
          variant="inline"
          onTranscriptionComplete={(t) => setResults(prev => [t, ...prev])}
        />
        <VoiceInputButton
          variant="button"
          buttonText="Speak"
          size="sm"
          onTranscriptionComplete={(t) => setResults(prev => [t, ...prev])}
        />
      </div>
      <ResultLog items={results} />
    </Section>
  );
}

function RawHookDemo() {
  const [results, setResults] = useState<string[]>([]);

  const {
    isRecording, isTranscribing, isPaused, duration, audioLevel,
    liveTranscript, failedChunkCount,
    startRecording, stopRecording, pauseRecording, resumeRecording, reset,
  } = useRecordAndTranscribe({
    onTranscriptionComplete: (result) => {
      if (result.success && result.text) setResults(prev => [result.text, ...prev]);
    },
    onError: (err) => toast.error('Hook error', { description: err }),
    streaming: true,
  });

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <Section title="useRecordAndTranscribe — raw hook, all controls exposed">
      <div className="flex items-center gap-2 flex-wrap">
        {!isRecording ? (
          <button onClick={startRecording} disabled={isTranscribing}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground disabled:opacity-50">
            Start
          </button>
        ) : (
          <>
            <button onClick={stopRecording}
              className="px-3 py-1.5 text-xs rounded-md bg-destructive text-destructive-foreground">
              Stop
            </button>
            {!isPaused ? (
              <button onClick={pauseRecording}
                className="px-3 py-1.5 text-xs rounded-md bg-muted text-foreground">
                Pause
              </button>
            ) : (
              <button onClick={resumeRecording}
                className="px-3 py-1.5 text-xs rounded-md bg-muted text-foreground">
                Resume
              </button>
            )}
          </>
        )}
        <button onClick={reset} className="px-3 py-1.5 text-xs rounded-md bg-muted text-muted-foreground">
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-muted/40 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground">State:</span>{' '}
          {isRecording ? (isPaused ? 'Paused' : 'Recording') : isTranscribing ? 'Transcribing' : 'Idle'}
        </div>
        <div className="bg-muted/40 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground">Duration:</span> {formatTime(duration)}
        </div>
        <div className="bg-muted/40 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground">Level:</span> {Math.round(audioLevel)}%
        </div>
        <div className="bg-muted/40 rounded px-2.5 py-1.5">
          <span className="text-muted-foreground">Failed:</span> {failedChunkCount}
        </div>
      </div>

      {liveTranscript && (
        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded px-2.5 py-1.5">
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">{liveTranscript}</p>
        </div>
      )}

      <ResultLog items={results} />
    </Section>
  );
}

export default function AudioTranscriptionDemoPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Audio Transcription</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All components use real-time streaming (2s chunks). Requires authentication.
          </p>
        </div>
        <VoiceTextareaDemo />
        <VoiceInputButtonDemo />
        <MicIconVariants />
        <RawHookDemo />
      </div>
    </div>
  );
}
