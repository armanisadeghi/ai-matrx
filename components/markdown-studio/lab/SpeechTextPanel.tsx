// components/markdown-studio/lab/SpeechTextPanel.tsx
//
// "Convert to audio transcript" — shows exactly the text the speech
// pipeline will read (`parseMarkdownToText`, the canonical markdown→speech
// cleaner), with play/pause/stop and the audio test dialog. Extracted from
// the admin Markdown Tester's Speech tab (2026-09-23, RC-B1).

"use client";

import React, { useState } from "react";
import { Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpeakerGroup } from "@/features/tts/components/SpeakerGroup";
import { AudioTestModal } from "@/components/admin/AudioTestModal";
import { parseMarkdownToText } from "@/utils/markdown-processors/parse-markdown-for-speech";

export interface SpeechTextPanelProps {
  content: string;
}

export function SpeechTextPanel({ content }: SpeechTextPanelProps) {
  const [audioTestOpen, setAudioTestOpen] = useState(false);
  const speechText = parseMarkdownToText(content);

  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SpeakerGroup text={content} />
        <Badge variant="secondary" className="text-xs">
          {speechText.length} speech chars
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAudioTestOpen(true)}
          className="ml-auto h-7 px-2.5 text-xs"
          disabled={!content.trim()}
        >
          <Volume2 className="mr-1.5 h-3.5 w-3.5" />
          Audio test
        </Button>
      </div>
      {speechText.trim() ? (
        <div className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
          {speechText}
        </div>
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Nothing to speak — load or type content first.
        </p>
      )}
      {/* Mounted only while open: its Cartesia hook connects on mount. */}
      {audioTestOpen && (
        <AudioTestModal
          open={audioTestOpen}
          onOpenChange={setAudioTestOpen}
          markdownContent={content}
        />
      )}
    </div>
  );
}
