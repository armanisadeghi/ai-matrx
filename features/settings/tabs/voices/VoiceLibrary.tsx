"use client";

// features/settings/tabs/voices/VoiceLibrary.tsx
//
// Every catalogue voice (ai.voices) a builder can give to something they make,
// grouped by provider, each one playable. A recorded sample (sample_url) plays
// straight from the CDN; a voice without one gets a one-line sample rendered by
// the server for its model (useVoiceSample → speak({ sample })).

import { ChevronRight, Loader2, Play, Square } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { Button } from "@/components/ui/button";
import { useVoiceSample } from "@/features/audio/service/useVoiceSample";
import { SettingAnchor } from "@/features/settings/doors/SettingAnchor";
import { useVoiceSamplePlayer } from "@/features/podcasts/generator/useVoiceSamplePlayer";
import { useVoices } from "@/features/podcasts/generator/useVoices";
import type { Voice } from "@/features/podcasts/generator/voiceCatalog";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Gemini",
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  xai: "xAI",
  groq: "Groq Orpheus",
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function voiceDetail(voice: Voice): string {
  return [
    voice.gender !== "unknown" ? voice.gender : null,
    voice.accent,
    voice.language,
    voice.description ?? voice.style,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function VoiceLibrary() {
  const { voices, loading, error, reload } = useVoices();
  const recorded = useVoiceSamplePlayer();
  const rendered = useVoiceSample();

  const byProvider = new Map<string, Voice[]>();
  for (const voice of voices) {
    const list = byProvider.get(voice.provider) ?? [];
    list.push(voice);
    byProvider.set(voice.provider, list);
  }

  const play = (voice: Voice) => {
    if (voice.sample_url) {
      rendered.stop();
      recorded.toggle(voice.id, voice.sample_url);
      return;
    }
    const model = voice.metadata?.models?.[0];
    if (!model) return;
    recorded.stop();
    rendered.playCatalogVoice(model, voice.provider_voice_id, voice.name);
  };

  return (
    <SettingAnchor id="voice-library">
      <SettingsSection
        title="Voice library"
        description="Every voice you can give to something you build. Press play to hear one."
      >
        {loading && (
          <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading the voice library…
          </p>
        )}
        {error && (
          <SettingsCallout tone="error" title="The voice library could not load">
            {error}{" "}
            <Button variant="link" size="sm" className="h-auto p-0" onClick={reload}>
              Try again
            </Button>
          </SettingsCallout>
        )}
        {rendered.error && (
          <p className="py-1 text-xs text-destructive">
            The sample could not play: {rendered.error}
            <ErrorAlchemyMenu error={rendered.error} />
          </p>
        )}
        {[...byProvider.entries()].map(([provider, list]) => (
          <details key={provider} className="group border-b border-border last:border-b-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-sm font-medium text-foreground">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
              {providerLabel(provider)}
              <span className="text-xs font-normal text-muted-foreground">
                {list.length} {list.length === 1 ? "voice" : "voices"}
              </span>
            </summary>
            <ul className="pb-2">
              {list.map((voice) => {
                const renderedKey = `catalog:${voice.metadata?.models?.[0] ?? ""}:${voice.provider_voice_id}`;
                const loadingNow = voice.sample_url
                  ? recorded.loadingValue === voice.id
                  : rendered.playingKey === renderedKey && rendered.starting;
                const playing = voice.sample_url
                  ? recorded.playingValue === voice.id
                  : rendered.playingKey === renderedKey;
                const playable = Boolean(voice.sample_url || voice.metadata?.models?.[0]);
                const detail = voiceDetail(voice);
                return (
                  <li
                    key={voice.id}
                    className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-accent"
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      disabled={!playable}
                      aria-label={playing ? `Stop ${voice.name}` : `Play ${voice.name}`}
                      title={playable ? undefined : "This voice has no sample and no model to render one."}
                      onClick={() => play(voice)}
                    >
                      {loadingNow ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : playing ? (
                        <Square className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{voice.name}</p>
                      {detail && (
                        <p className="truncate text-xs text-muted-foreground">
                          {detail}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </SettingsSection>
    </SettingAnchor>
  );
}
