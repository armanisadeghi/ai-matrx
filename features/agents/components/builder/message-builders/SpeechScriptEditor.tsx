"use client";

/**
 * The `speech_script` part editor — a table of spoken turns.
 *
 * One row per turn: speaker (a name bound to a voice of the selected model, the
 * agent's Voice setting, or a `{{variable}}`), the text, a free-text direction
 * for that turn, and the pause after it. Every leader in text to speech
 * (ElevenLabs v3, Gemini, OpenAI, Hume) takes direction as natural language, so
 * direction is a text cell, never a dropdown; the server places it where each
 * vendor wants it.
 *
 * Contract: `common-docs/systems/agents/typed-messages/FEATURE.md` (Text to
 * speech). The speaker cap comes from the model's catalog controls, and the
 * banner says plainly when the script cannot be performed as written.
 */

import { useMemo } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import type { AIModelRecord } from "@/features/ai-models/redux/modelRegistrySlice";
import { useVoices } from "@/features/podcasts/generator/useVoices";
import { voicesForModel } from "@/features/podcasts/generator/voiceCatalog";
import {
  MAX_PAUSE_MS,
  conflictingSpeakers,
  distinctSpeakers,
  newSpeechTurn,
  speakerCapFor,
  type ScriptCompatibility,
  type SpeechTurnSpec,
} from "@/features/agents/speech-script/types";

const SETTING_VOICE = "__setting__";
const VARIABLE_VOICE = "__variable__";

export interface SpeechScriptEditorProps {
  turns: SpeechTurnSpec[];
  onChange: (next: SpeechTurnSpec[]) => void;
  model: AIModelRecord | null | undefined;
  validVariables?: string[];
  compatibility?: ScriptCompatibility;
  onRemovePart?: () => void;
  className?: string;
}

interface VoiceOption {
  value: string;
  label: string;
}

function VoiceCell({
  value,
  options,
  onChange,
  index,
}: {
  value: string;
  options: VoiceOption[];
  onChange: (voice: string | null) => void;
  index: number;
}) {
  const isVariable = value.includes("{{");
  const known = options.some((o) => o.value === value);
  const selectValue = !value
    ? SETTING_VOICE
    : isVariable
      ? VARIABLE_VOICE
      : value;
  return (
    <div className="flex flex-col gap-1">
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (next === SETTING_VOICE) onChange(null);
          else if (next === VARIABLE_VOICE) onChange(isVariable ? value : "{{voice}}");
          else onChange(next);
        }}
      >
        <SelectTrigger
          className="h-6 text-[11px]"
          aria-label={`Turn ${index + 1} voice`}
        >
          <SelectValue placeholder="Voice" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SETTING_VOICE} className="text-xs">
            Voice setting
          </SelectItem>
          <SelectItem value={VARIABLE_VOICE} className="text-xs">
            Bind to variable
          </SelectItem>
          {(options.length > 0 || (!known && value && !isVariable)) && <SelectSeparator />}
          {!known && value && !isVariable && (
            <SelectItem value={value} className="text-xs font-mono">
              {value}
            </SelectItem>
          )}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isVariable && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Turn ${index + 1} voice variable`}
          placeholder="{{voice}}"
          className="h-6 text-[11px] font-mono"
        />
      )}
    </div>
  );
}

export function SpeechScriptEditor({
  turns,
  onChange,
  model,
  validVariables = [],
  compatibility,
  onRemovePart,
  className,
}: SpeechScriptEditorProps) {
  const { voices } = useVoices();
  const options = useMemo<VoiceOption[]>(
    () =>
      voicesForModel(voices, model?.name).map((v) => ({
        value: v.provider_voice_id,
        label: [v.name, v.gender && v.gender !== "unknown" ? v.gender : null]
          .filter(Boolean)
          .join(" · "),
      })),
    [voices, model?.name],
  );

  const speakers = distinctSpeakers(turns);
  const cap = speakerCapFor(model);
  const conflicts = new Set(conflictingSpeakers(turns));
  const refused = compatibility?.verdict === "refused";

  const update = (index: number, patch: Partial<SpeechTurnSpec>) =>
    onChange(turns.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  // A speaker keeps one voice: choosing a voice on one turn moves every turn
  // of that speaker with it, so the table can never hold a split speaker.
  const setVoice = (index: number, voice: string | null) => {
    const speaker = turns[index]?.speaker;
    onChange(turns.map((t, i) => (i === index || t.speaker === speaker ? { ...t, voice } : t)));
  };

  const setSpeaker = (index: number, name: string) => {
    const existing = turns.find((t, i) => i !== index && t.speaker === name && t.voice);
    update(index, existing ? { speaker: name, voice: existing.voice } : { speaker: name });
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= turns.length) return;
    const next = [...turns];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div
      className={cn(
        "@container/ss flex flex-col gap-2 w-full rounded-lg border border-border bg-card p-2",
        refused && "border-destructive/40",
        className,
      )}
      data-testid="speech-script-editor"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">Speech script</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {turns.length} {turns.length === 1 ? "turn" : "turns"} · {speakers.length}
          {cap !== null ? `/${cap}` : ""} {cap === 1 ? "speaker" : "speakers"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 text-[11px] px-2"
            onClick={() => onChange([...turns, newSpeechTurn(turns)])}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add turn
          </Button>
          {onRemovePart && (
            <button
              type="button"
              onClick={onRemovePart}
              aria-label="Remove speech script"
              className="p-1 rounded text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {compatibility && compatibility.verdict !== "native" && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px]",
            compatibility.verdict === "refused"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{compatibility.reason}</span>
        </div>
      )}

      <div className="text-xs">
        <div className="hidden @[44rem]/ss:grid grid-cols-[1.25rem_9.5rem_1fr_12rem_4.5rem_3.5rem] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground pb-1">
          <span>#</span>
          <span>Speaker</span>
          <span>Text</span>
          <span>Direction</span>
          <span>Pause ms</span>
          <span />
        </div>

        {turns.map((turn, index) => (
          <div key={`turn-${index}`} className="border-t border-border/60 py-1.5">
            <div className="grid grid-cols-1 @[44rem]/ss:grid-cols-[1.25rem_9.5rem_1fr_12rem_4.5rem_3.5rem] gap-2 items-start">
              <span className="hidden @[44rem]/ss:block pt-1 text-right font-mono text-[10px] text-muted-foreground">
                {index + 1}
              </span>

              <div className="flex flex-col gap-1">
                <Input
                  value={turn.speaker}
                  onChange={(e) => setSpeaker(index, e.target.value)}
                  aria-label={`Turn ${index + 1} speaker`}
                  placeholder="Speaker"
                  className={cn(
                    "h-6 text-[11px]",
                    (!turn.speaker.trim() || conflicts.has(turn.speaker)) && "border-destructive",
                  )}
                />
                <VoiceCell
                  value={turn.voice ?? ""}
                  options={options}
                  onChange={(voice) => setVoice(index, voice)}
                  index={index}
                />
              </div>

              <div className="min-w-0">
                <ProTextarea
                  value={turn.text}
                  onChange={(e) => update(index, { text: e.target.value })}
                  placeholder="What this speaker says. {{variables}} work."
                  aria-label={`Turn ${index + 1} text`}
                  autoGrow
                  minHeight={44}
                  maxHeight={200}
                  className={cn("text-[11px]", !turn.text.trim() && "border-destructive/60")}
                />
                {turn.text.includes("{{") && (
                  <div className="mt-0.5 text-[10px] leading-snug">
                    <HighlightedText text={turn.text} validVariables={validVariables} />
                  </div>
                )}
              </div>

              <ProTextarea
                value={turn.direction ?? ""}
                onChange={(e) => update(index, { direction: e.target.value || null })}
                placeholder="e.g. warm, a little amused"
                aria-label={`Turn ${index + 1} direction`}
                autoGrow
                minHeight={44}
                maxHeight={120}
                className="text-[11px]"
              />

              <Input
                value={turn.pause_after_ms == null ? "" : String(turn.pause_after_ms)}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const parsed = raw === "" ? null : Number(raw);
                  update(index, {
                    pause_after_ms:
                      parsed != null && Number.isFinite(parsed)
                        ? Math.max(0, Math.min(MAX_PAUSE_MS, Math.round(parsed)))
                        : null,
                  });
                }}
                inputMode="numeric"
                placeholder="0"
                aria-label={`Turn ${index + 1} pause after, milliseconds`}
                className="h-6 text-[11px] font-mono"
              />

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={`Move turn ${index + 1} up`}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === turns.length - 1}
                  aria-label={`Move turn ${index + 1} down`}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onChange(turns.filter((_, i) => i !== index))}
                  disabled={turns.length === 1}
                  aria-label={`Remove turn ${index + 1}`}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
