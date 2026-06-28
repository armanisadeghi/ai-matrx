"use client";

// features/podcasts/generator/components/SpeakerCastEditor.tsx
//
// The studio's speaker cast editor: one card per host (exactly `hostCount`
// cards, always in sync with the count chosen above), each with a NAME, a
// GENDER, and a VOICE chosen from the LIVE catalog (Supabase `ai.voices`),
// with an audio SAMPLE you can play for any voice (the row's CDN `sample_url`).
// Up to 20 hosts.
//
// Provider band follows the server's audio routing: ≤2 hosts → Google, ≥3 →
// ElevenLabs. The caller passes the band-filtered live voices + loading/error.
//
// Nothing here is "optional draft": whatever the user leaves untouched shows the
// exact DEFAULT the request will send (see resolveSpeaker / buildCast in
// ../voices), so the form always transmits a complete, explicit cast.

import { useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Loader2,
  Play,
  RefreshCw,
  Square,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PodcastSpeakerGender } from "../types";
import type { Voice, VoiceProvider } from "../voiceCatalog";
import {
  type SpeakerDraft,
  PROVIDER_LABEL,
  resolveSpeaker,
  voiceByValue,
} from "../voices";
import {
  useVoiceSamplePlayer,
  type VoiceSamplePlayer,
} from "../useVoiceSamplePlayer";

interface SpeakerCastEditorProps {
  hostCount: number;
  drafts: Record<number, SpeakerDraft>;
  onChange: (index: number, patch: SpeakerDraft) => void;
  /** Live voices for the current provider band (already filtered by host count). */
  voices: Voice[];
  provider: VoiceProvider;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

const GENDER_OPTIONS: { value: PodcastSpeakerGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "neutral", label: "Neutral" },
];

const GENDER_GROUPS: { key: Voice["gender"]; label: string }[] = [
  { key: "female", label: "Female" },
  { key: "male", label: "Male" },
  { key: "neutral", label: "Neutral" },
  { key: "unknown", label: "Other" },
];

/** A short descriptor for a voice row: style, else accent, else first tag. */
function voiceHint(v: Voice): string {
  return v.style || v.accent || v.tags[0] || "";
}

// ── Sample play / stop button ───────────────────────────────────────────────

function SamplePlayButton({
  id,
  url,
  player,
  className,
}: {
  id: string;
  url: string | null | undefined;
  player: VoiceSamplePlayer;
  className?: string;
}) {
  const playing = player.playingValue === id;
  const loading = player.loadingValue === id;
  const disabled = !url;
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        player.toggle(id, url ?? undefined);
      }}
      aria-label={
        disabled ? "Preview not available" : playing ? "Stop sample" : "Play sample"
      }
      title={
        disabled ? "Preview not available" : playing ? "Stop sample" : "Play sample"
      }
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:bg-accent hover:text-foreground",
        playing && "border-primary/50 bg-primary/10 text-primary",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : playing ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ── Voice picker (searchable, grouped by gender, with per-row samples) ───────

function VoicePicker({
  value,
  voices,
  player,
  onSelect,
}: {
  value: string;
  voices: Voice[];
  player: VoiceSamplePlayer;
  onSelect: (voice: Voice) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = voiceByValue(voices, value);
  const hint = selected ? voiceHint(selected) : "";

  const groups = GENDER_GROUPS.map((g) => ({
    ...g,
    items: voices.filter((v) => v.gender === g.key),
  })).filter((g) => g.items.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="truncate text-foreground">
            {selected?.name ?? "Select voice"}
          </span>
          {hint && (
            <span className="truncate text-xs text-muted-foreground">{hint}</span>
          )}
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search voices…" />
          <CommandList>
            <CommandEmpty>No voices found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.items.map((v) => {
                  const hintText = voiceHint(v);
                  return (
                    <CommandItem
                      key={v.id}
                      value={`${v.name} ${v.style ?? ""} ${v.accent ?? ""} ${v.tags.join(" ")} ${v.gender}`}
                      onSelect={() => {
                        onSelect(v);
                        setOpen(false);
                      }}
                      className="gap-2"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          value === v.provider_voice_id
                            ? "opacity-100 text-primary"
                            : "opacity-0",
                        )}
                      />
                      <span className="text-sm text-foreground">{v.name}</span>
                      {hintText && (
                        <span className="truncate text-xs text-muted-foreground">
                          {hintText}
                        </span>
                      )}
                      {v.voice_type !== "builtin" && (
                        <Badge
                          variant="secondary"
                          className="px-1 py-0 text-[9px] uppercase"
                        >
                          {v.voice_type === "user_created" ? "Yours" : "Matrx"}
                        </Badge>
                      )}
                      <SamplePlayButton
                        id={v.provider_voice_id}
                        url={v.sample_url ?? v.preview_url}
                        player={player}
                        className="ml-auto h-7 w-7"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── One host card ───────────────────────────────────────────────────────────

function HostCard({
  index,
  draft,
  voices,
  provider,
  player,
  onChange,
}: {
  index: number;
  draft: SpeakerDraft;
  voices: Voice[];
  provider: VoiceProvider;
  player: VoiceSamplePlayer;
  onChange: (index: number, patch: SpeakerDraft) => void;
}) {
  const effective = resolveSpeaker(index, draft, voices, provider);
  const selectedVoice = voiceByValue(voices, effective.voice);

  return (
    <div className="space-y-2.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Host {index + 1}
        </span>
        <span className="text-[10px] capitalize text-muted-foreground">
          {effective.gender}
        </span>
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Name</Label>
        <Input
          value={draft.name ?? ""}
          onChange={(e) => onChange(index, { name: e.target.value })}
          placeholder={effective.name}
          className="text-base"
        />
      </div>

      <div className="flex items-end gap-2">
        <div className="w-28 shrink-0 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Gender</Label>
          <Select
            value={effective.gender}
            onValueChange={(g) =>
              onChange(index, { gender: g as PodcastSpeakerGender })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDER_OPTIONS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-[11px] text-muted-foreground">Voice</Label>
          <VoicePicker
            value={effective.voice}
            voices={voices}
            player={player}
            onSelect={(v) =>
              // Picking a voice adopts that voice's gender too (kept in sync),
              // unless the user later overrides gender explicitly.
              onChange(index, {
                voice: v.provider_voice_id,
                gender:
                  v.gender === "male" || v.gender === "female" ? v.gender : undefined,
              })
            }
          />
        </div>

        <SamplePlayButton
          id={effective.voice}
          url={selectedVoice?.sample_url ?? selectedVoice?.preview_url}
          player={player}
        />
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function SpeakerCastEditor({
  hostCount,
  drafts,
  onChange,
  voices,
  provider,
  loading,
  error,
  onReload,
}: SpeakerCastEditorProps) {
  const player = useVoiceSamplePlayer();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] text-muted-foreground">
          {hostCount} {hostCount === 1 ? "host" : "hosts"} ·{" "}
          {PROVIDER_LABEL[provider] ?? provider} voices
          {!loading && !error ? ` · ${voices.length} available` : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Leave blank to use the default cast.
        </p>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
            Couldn&apos;t load voices. You can still set names &amp; genders; the
            server will pick voices.
          </span>
          <button
            type="button"
            onClick={onReload}
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {loading && voices.length === 0
          ? Array.from({ length: Math.min(hostCount, 4) }, (_, i) => (
              <Skeleton key={i} className="h-[136px] w-full rounded-xl" />
            ))
          : Array.from({ length: hostCount }, (_, i) => (
              <HostCard
                key={i}
                index={i}
                draft={drafts[i] ?? {}}
                voices={voices}
                provider={provider}
                player={player}
                onChange={onChange}
              />
            ))}
      </div>
    </div>
  );
}
