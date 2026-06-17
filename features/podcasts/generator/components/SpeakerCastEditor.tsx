"use client";

// features/podcasts/generator/components/SpeakerCastEditor.tsx
//
// The studio's speaker cast editor: one card per host (exactly `hostCount`
// cards, always in sync with the count chosen above), each with a NAME, a
// GENDER, and a VOICE picked from the provider's catalog — with an audio
// SAMPLE you can play for any voice. Up to 20 hosts.
//
// Provider band follows the server's audio routing: ≤2 hosts → Google Gemini
// voices, ≥3 → ElevenLabs. The picker shows the right catalog for the current
// count, grouped by gender and searchable.
//
// Nothing here is "optional draft" anymore: whatever the user leaves untouched
// shows the exact DEFAULT the request will send (see buildCast / resolveSpeaker
// in ../voices), so the form always transmits a complete, explicit cast.

import { Check, ChevronsUpDown, Loader2, Play, Square } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  type SpeakerDraft,
  type VoiceGender,
  type VoiceOption,
  providerForHostCount,
  resolveSpeaker,
  sampleUrlFor,
  voiceByValue,
  voicesForHostCount,
} from "../voices";
import {
  useVoiceSamplePlayer,
  type VoiceSamplePlayer,
} from "../useVoiceSamplePlayer";

interface SpeakerCastEditorProps {
  hostCount: number;
  drafts: Record<number, SpeakerDraft>;
  onChange: (index: number, patch: SpeakerDraft) => void;
}

const GENDER_OPTIONS: { value: VoiceGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "neutral", label: "Neutral" },
];

// ── Sample play / stop button ───────────────────────────────────────────────

function SamplePlayButton({
  value,
  player,
  className,
}: {
  value: string;
  player: VoiceSamplePlayer;
  className?: string;
}) {
  const url = sampleUrlFor(value);
  const playing = player.playingValue === value;
  const loading = player.loadingValue === value;
  const disabled = !url;
  return (
    <button
      type="button"
      disabled={disabled}
      // stop the click reaching an enclosing CommandItem (which would select it)
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        player.toggle(value, url);
      }}
      aria-label={
        disabled ? "Preview not available yet" : playing ? "Stop sample" : "Play sample"
      }
      title={
        disabled ? "Preview not available yet" : playing ? "Stop sample" : "Play sample"
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
  voices: VoiceOption[];
  player: VoiceSamplePlayer;
  onSelect: (voiceValue: string, gender: VoiceGender) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = voiceByValue(value);

  const groups = (
    [
      { key: "female", label: "Female", items: voices.filter((v) => v.gender === "female") },
      { key: "male", label: "Male", items: voices.filter((v) => v.gender === "male") },
      { key: "neutral", label: "Neutral", items: voices.filter((v) => v.gender === "neutral") },
    ] satisfies { key: VoiceGender; label: string; items: VoiceOption[] }[]
  ).filter((g) => g.items.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className="truncate text-foreground">
            {selected?.label ?? "Select voice"}
          </span>
          {selected && (
            <span className="truncate text-xs text-muted-foreground">
              {selected.style}
            </span>
          )}
          <ChevronsUpDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search voices…" />
          <CommandList>
            <CommandEmpty>No voices found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.items.map((v) => (
                  <CommandItem
                    key={v.value}
                    value={`${v.label} ${v.style} ${v.gender}`}
                    onSelect={() => {
                      onSelect(v.value, v.gender);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        value === v.value ? "opacity-100 text-primary" : "opacity-0",
                      )}
                    />
                    <span className="text-sm text-foreground">{v.label}</span>
                    <span className="text-xs text-muted-foreground">{v.style}</span>
                    <SamplePlayButton
                      value={v.value}
                      player={player}
                      className="ml-auto h-7 w-7"
                    />
                  </CommandItem>
                ))}
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
  hostCount,
  draft,
  voices,
  player,
  onChange,
}: {
  index: number;
  hostCount: number;
  draft: SpeakerDraft;
  voices: VoiceOption[];
  player: VoiceSamplePlayer;
  onChange: (index: number, patch: SpeakerDraft) => void;
}) {
  // The effective (filled) speaker — what the request will actually send for
  // this slot if the user changes nothing further. Drives the shown defaults.
  const effective = resolveSpeaker(index, hostCount, draft);

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
            onValueChange={(g) => onChange(index, { gender: g as VoiceGender })}
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
            onSelect={(voiceValue, gender) =>
              // Picking a voice also adopts that voice's gender (kept in sync),
              // unless the user later overrides gender explicitly.
              onChange(index, { voice: voiceValue, gender })
            }
          />
        </div>

        <SamplePlayButton value={effective.voice} player={player} />
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export function SpeakerCastEditor({
  hostCount,
  drafts,
  onChange,
}: SpeakerCastEditorProps) {
  const player = useVoiceSamplePlayer();
  const voices = voicesForHostCount(hostCount);
  const provider = providerForHostCount(hostCount);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] text-muted-foreground">
          {hostCount} {hostCount === 1 ? "host" : "hosts"} ·{" "}
          {provider === "google"
            ? "Google Gemini voices"
            : "ElevenLabs voices"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Leave blank to use the default cast.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {Array.from({ length: hostCount }, (_, i) => (
          <HostCard
            key={i}
            index={i}
            hostCount={hostCount}
            draft={drafts[i] ?? {}}
            voices={voices}
            player={player}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}
