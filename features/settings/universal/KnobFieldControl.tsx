"use client";

// features/settings/universal/KnobFieldControl.tsx
//
// THE ONE control renderer for a scoped-configuration key, shared by every
// rung (settings-ladder rule 2). `KnobLadder.control` has declared
// `segmented` / `slider` / `model` / `voice` / `secret` since the resolver
// landed, and nothing consumed it: every key rendered as a free-text box, so
// a person picking their default AI model typed a string and a person picking
// a voice typed a voice id. This file is the consumer.
//
// It renders the CONTROL ONLY — no label, no description, no origin badge.
// Those belong to the row (`lib/scoped-config/KnobOverrideRow.tsx`), which
// states them once for every control type. A control here commits its own
// value the moment a person chooses it (a picker with a Save button beside it
// is two ways to say one thing); the free-text fallbacks keep their draft and
// Save, because a half-typed number is not a choice yet.
//
// Everything is reused, never re-made:
//   segmented → `SegmentedControl` (@ai-matrx/design-system)
//   slider    → `Slider` (same package, via components/ui/slider)
//   model     → `ModelListDropdown`, THE canonical model picker
//   voice     → the catalogue in `lib/cartesia/voices` played through
//               `useCartesia` — the same TTS path `VoiceSelectionModal` uses
//   secret    → state only, from `knob.secret`; the value never comes here
//               and is never asked for here (see the note on the case below).

import { useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Play, ShieldCheck, ShieldOff, Square } from "lucide-react";
import Link from "next/link";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  selectTriggerVariants,
  Slider,
  Switch,
} from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { useCartesia } from "@/hooks/tts/useCartesia";
import { VoiceSpeed } from "@/lib/cartesia/cartesia.types";
import { availableVoices } from "@/lib/cartesia/voices";
import {
  formatKnobValue,
  type KnobControl,
  type KnobLadder,
} from "@/lib/scoped-config/ladder";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/utils/errors";

/** The control kinds this file renders. Anything else keeps the row's own editor. */
const RENDERED: ReadonlySet<KnobControl> = new Set<KnobControl>([
  "switch",
  "segmented",
  "slider",
  "model",
  "voice",
  "secret",
  "json",
]);

export function hasFieldControl(control: KnobControl): boolean {
  return RENDERED.has(control);
}

export type KnobFieldControlProps = {
  knob: ScopedKnob;
  ladder: KnobLadder;
  /** A write is in flight, or this caller may not write here. */
  disabled?: boolean;
  /** Commit a chosen value at this rung. `null` is never sent from here. */
  onCommit: (value: unknown) => void | boolean | Promise<void | boolean>;
  /** Changes whenever this control points at a different persistence destination. */
  identityKey?: string;
  /** DOM id for the row's primary control when it has one. */
  inputId?: string;
  /** Row label id for composite or read-only controls. */
  labelId?: string;
};

/** "not_set" → "Not set", "auto_apply" → "Auto apply". Never a raw slug. */
function humanize(raw: string): string {
  const words = raw.replace(/[_-]+/g, " ").trim();
  if (words === "") return raw;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function KnobFieldControl(props: KnobFieldControlProps) {
  const { knob, ladder } = props;
  switch (ladder.control) {
    case "switch":
      return <SwitchField {...props} />;
    case "segmented":
      return <SegmentedField {...props} />;
    case "slider":
      return <SliderField {...props} />;
    case "model":
      return <ModelField {...props} />;
    case "voice":
      return <VoiceField {...props} />;
    case "secret":
      return <SecretField {...props} />;
    case "json":
      return <JsonField key={props.identityKey ?? knob.full_key} {...props} />;
    default:
      return null;
  }
}

/** Structured values are inspectable by default and editable only on intent. */
function JsonField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(() => JSON.stringify(ladder.value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setRaw(JSON.stringify(ladder.value, null, 2));
    setError(null);
    setEditing(false);
  };
  if (!editing) {
    return (
      <Button
        size="sm"
        variant="outline"
        aria-label={labelId ? undefined : `Edit structured value for ${knob.label}`}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => setEditing(true)}
      >
        Edit structured value
      </Button>
    );
  }
  return (
    <div className="w-full min-w-0 space-y-2">
      <Textarea
        id={inputId}
        aria-label={labelId ? undefined : `Structured value for ${knob.label}`}
        aria-labelledby={labelId}
        className="min-h-28 font-mono text-xs"
        value={raw}
        disabled={disabled}
        onChange={(event) => {
          setRaw(event.target.value);
          setError(null);
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            try {
              const parsed: unknown = JSON.parse(raw);
              if (parsed === null) {
                setError("Use the reset action to clear this value.");
                return;
              }
              setError(null);
              void Promise.resolve(onCommit(parsed)).then((saved) => {
                if (saved !== false) setEditing(false);
              });
            } catch {
              setError("Enter valid JSON before saving.");
            }
          }}
        >
          Save structured value
        </Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={reset}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SwitchField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  return (
    <div className="flex h-9 items-center">
      <Switch
        id={inputId}
        aria-label={labelId ? undefined : knob.label}
        aria-labelledby={labelId}
        checked={ladder.value === true}
        disabled={disabled}
        onCheckedChange={(next) => void onCommit(next)}
      />
    </div>
  );
}

/**
 * A small set of choices, shown as one row of buttons. Booleans read as
 * On / Off; an enum's own words are shown as words, never as slugs. The
 * committed value keeps the registry's own type (boolean stays boolean),
 * because `knob_override_set` validates the JSON type it is handed.
 */
function SegmentedField({
  knob,
  ladder,
  disabled,
  onCommit,
  labelId,
}: KnobFieldControlProps) {
  const choices: { raw: unknown; value: string; label: string }[] =
    knob.value_type === "boolean"
      ? [
          { raw: true, value: "true", label: "On" },
          { raw: false, value: "false", label: "Off" },
        ]
      : (knob.allowed_values ?? []).map((raw) => ({
          raw,
          value: String(raw),
          label: humanize(String(raw)),
        }));

  if (choices.length === 0) return null;
  const current = String(ladder.value ?? "");

  return (
    <div
      role="group"
      aria-label={labelId ? undefined : knob.label}
      aria-labelledby={labelId}
      className={cn("flex h-9 items-center", disabled && "opacity-50")}
    >
      <SegmentedControl
        size="sm"
        value={current}
        data={choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
        }))}
        onValueChange={(next) => {
          if (disabled) return;
          const chosen = choices.find((choice) => choice.value === next);
          if (chosen) void onCommit(chosen.raw);
        }}
      />
    </div>
  );
}

/**
 * A bounded number. The bounds come from the registry row (`min_value` /
 * `max_value` — the same pair `_knob_override_write` refuses a value outside
 * of), the reading carries its unit through the ONE formatter, and the
 * platform default is marked on the track so a person can see what they are
 * moving away from. The drag is local; the write happens once, on release.
 */
function SliderField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  const min = knob.min_value ?? 0;
  const max = knob.max_value ?? 100;
  const span = max - min;
  const step =
    knob.value_type === "integer" ? 1 : span <= 2 ? 0.05 : span <= 20 ? 0.1 : 1;
  const settled = typeof ladder.value === "number" ? ladder.value : min;
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? settled;

  return (
    <div className="w-56 max-w-full min-w-0 space-y-1.5 py-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tabular-nums">
          {formatKnobValue(shown, knob.unit)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatKnobValue(min, knob.unit)} – {formatKnobValue(max, knob.unit)}
        </span>
      </div>
      <Slider
        id={inputId}
        aria-label={labelId ? undefined : knob.label}
        aria-labelledby={labelId}
        size="sm"
        min={min}
        max={max}
        step={step}
        value={[shown]}
        disabled={disabled}
        onValueChange={(next) => setDragging(next[0])}
        onValueCommit={(next) => {
          setDragging(null);
          void onCommit(next[0]);
        }}
      />
    </div>
  );
}

/**
 * A model, from the AI catalogue — the maker and the model, the friendly way
 * ("Anthropic Sonnet 5"). `ModelListDropdown` IS the platform's model picker
 * (chat, the lab, every settings tab go through it); a second one here would
 * be a second catalogue to drift.
 */
function ModelField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  const value =
    typeof ladder.value === "string" && ladder.value !== ""
      ? ladder.value
      : null;
  return (
    <ModelListDropdown
      id={inputId}
      aria-label={labelId ? undefined : knob.label}
      aria-labelledby={labelId}
      value={value}
      onValueChange={(next) => {
        if (next) void onCommit(next);
      }}
      inputModalities={[]}
      outputModalities={["text"]}
      placeholder="Choose a model"
      disabled={disabled}
      triggerVariant="settings"
      className="w-full min-w-0 justify-between"
    />
  );
}

/** The line a voice sample speaks. Short, and the same one every time. */
const VOICE_SAMPLE_LINE =
  "Hi — this is how I sound. I can read anything back to you in this voice.";

/**
 * A voice, with a sample you hear before you keep it. The catalogue is
 * `lib/cartesia/voices` (what `VoiceTab` lists) and the sample plays through
 * `useCartesia` — the SAME TTS path `VoiceSelectionModal` uses. A second audio
 * path is how two surfaces start sounding different.
 */
function VoiceField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  const current = typeof ladder.value === "string" ? ladder.value : "";
  const [open, setOpen] = useState(false);
  const selected = availableVoices.find((voice) => voice.id === current);
  const selectedLabel = selected
    ? selected.name
    : current
      ? `Unknown voice: ${current}`
      : "Choose a voice";
  const handleSelect = (voiceId: string) => {
    void Promise.resolve(onCommit(voiceId))
      .then((result) => {
        if (result !== false) setOpen(false);
      })
      .catch(() => undefined);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={inputId}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={labelId ? undefined : knob.label}
          aria-labelledby={labelId}
          className={selectTriggerVariants({
            size: "default",
            className:
              "h-auto min-h-9 w-full min-w-0 max-w-full whitespace-normal text-left [&>span]:line-clamp-none",
          })}
        >
          <div className="min-w-0 flex-1 whitespace-normal break-words leading-tight">
            {selectedLabel}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          align="start"
          className="w-[20rem] max-h-[min(32rem,var(--radix-popover-content-available-height))] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        >
          <VoiceChooser
            current={current}
            disabled={disabled}
            onSelect={handleSelect}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

/** Mounted only while the chooser is open, so settings-page load opens no TTS socket. */
function VoiceChooser({
  current,
  disabled,
  onSelect,
}: {
  current: string;
  disabled?: boolean;
  onSelect: (voiceId: string) => void;
}) {
  const { sendMessage, stopPlayback, isConnected, error } = useCartesia();
  const [query, setQuery] = useState("");
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const playRequestId = useRef(0);
  const matchingVoices = availableVoices.filter((voice) => {
    const search = query.trim().toLocaleLowerCase();
    return (
      search === "" ||
      voice.name.toLocaleLowerCase().includes(search) ||
      voice.description.toLocaleLowerCase().includes(search)
    );
  });

  const play = async (voiceId: string) => {
    const requestId = ++playRequestId.current;
    if (playingVoiceId === voiceId) {
      await stopPlayback();
      if (requestId === playRequestId.current) setPlayingVoiceId(null);
      return;
    }
    if (playingVoiceId) await stopPlayback();
    if (requestId !== playRequestId.current) return;
    setFailure(null);
    setPlayingVoiceId(voiceId);
    try {
      await sendMessage(VOICE_SAMPLE_LINE, VoiceSpeed.NORMAL, {
        mode: "id",
        id: voiceId,
      });
    } catch (err) {
      setFailure(extractErrorMessage(err));
    } finally {
      if (requestId === playRequestId.current) setPlayingVoiceId(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search voices"
          aria-label="Search voices"
          className="h-8"
        />
      </div>
      <div className="max-h-[calc(min(32rem,var(--radix-popover-content-available-height))-5rem)] min-h-0 overflow-y-auto">
        {matchingVoices.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No voices match “{query}”.
          </p>
        ) : matchingVoices.map((voice) => (
          <div
            key={voice.id}
            className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-accent"
          >
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-2 py-1.5 text-left text-sm"
              disabled={disabled}
              onClick={() => onSelect(voice.id)}
            >
              <span className="min-w-0 flex-1 break-words">{voice.name}</span>
              {voice.id === current && <Check className="h-4 w-4 shrink-0" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              aria-label={playingVoiceId === voice.id ? "Stop voice sample" : `Play sample for ${voice.name}`}
              disabled={disabled || !isConnected}
              onClick={() => void play(voice.id)}
            >
              {playingVoiceId === voice.id ? (
                <Square className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        ))}
      </div>
      {!isConnected && !error && (
        <p className="flex shrink-0 items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Connecting to the speech service…
        </p>
      )}
      {(error || failure) && (
        <p className="shrink-0 px-2 py-1 text-[11px] text-destructive">
          {failure ?? `The sample could not play: ${error?.message}`}
        </p>
      )}
    </div>
  );
}

/**
 * A secret. Its state, and the name of the vault entry that holds it — never
 * the value, and never a box to type one into HERE: `knob_override_set` has no
 * secret branch, so anything typed here would land in `platform.knob_override`
 * in the clear. The vault is where a secret is set and rotated, so this is a
 * door to the vault, not a pretend editor (a control is absent or honest).
 */
function SecretField({
  knob,
  labelId,
}: Pick<KnobFieldControlProps, "knob" | "labelId">) {
  const state = knob.secret?.state ?? "unknown";
  const vaultKey = knob.secret?.vault_key ?? null;
  const isSet = state === "set";
  const isUnknown = state === "unknown";
  return (
    <div
      role="group"
      aria-label={labelId ? undefined : knob.label}
      aria-labelledby={labelId}
      className="flex w-56 max-w-full min-w-0 flex-col items-stretch gap-1.5 @[40rem]/settings:items-end"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={isSet ? "default" : "outline"}
          className="gap-1 text-xs"
        >
          {isSet ? (
            <ShieldCheck className="h-3 w-3" />
          ) : (
            <ShieldOff className="h-3 w-3" />
          )}
          {isSet ? "Set" : isUnknown ? "State unavailable" : "Not set"}
        </Badge>
        <Button size="sm" variant="outline" asChild>
          <Link href="/vault">
            {isSet ? "Rotate in the vault" : "Check in the vault"}
          </Link>
        </Button>
      </div>
      <p className="break-words text-[11px] text-muted-foreground @[40rem]/settings:text-right">
        {isUnknown ? (
          <>
            The platform register does not include vault state. Check Vault
            before changing this secret.
          </>
        ) : vaultKey ? (
          <>
            Held in the vault as <code>{vaultKey}</code>. The value is never
            shown or stored here.
          </>
        ) : (
          <>No vault entry is named for this one yet, so nothing can be set.</>
        )}
      </p>
    </div>
  );
}
