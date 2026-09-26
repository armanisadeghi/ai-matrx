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
 *
 * Turns reorder by dragging the grip (keyboard: focus the grip, Space, arrows),
 * the same @dnd-kit pattern as the Questions editor. Each concrete voice has a
 * play button that plays the model's own sample of that voice through the one
 * audio entry point, `speak({ sample })`.
 */

import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  GripVertical,
  Plus,
  Trash2,
  Volume2,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { speak } from "@/features/audio/service/speak";
import { primeAudioOutput } from "@/features/audio/unlock";
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
  modelName,
}: {
  value: string;
  options: VoiceOption[];
  onChange: (voice: string | null) => void;
  index: number;
  modelName: string | null;
}) {
  const isVariable = value.includes("{{");
  const known = options.some((o) => o.value === value);
  const label = options.find((o) => o.value === value)?.label ?? value;
  // A preview exists only for a concrete voice of a known model; the Voice
  // setting and a {{variable}} have no single voice to play, so no button.
  const canPreview = Boolean(modelName && value && !isVariable);
  const preview = () => {
    if (!modelName || !value) return;
    primeAudioOutput();
    speak({
      text: `Voice sample: ${label}`,
      label: `Voice sample: ${label}`,
      sample: { model: modelName, voice: value },
    });
  };
  const selectValue = !value
    ? SETTING_VOICE
    : isVariable
      ? VARIABLE_VOICE
      : value;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Select
          value={selectValue}
          onValueChange={(next) => {
            if (next === SETTING_VOICE) onChange(null);
            else if (next === VARIABLE_VOICE)
              onChange(isVariable ? value : "{{voice}}");
            else onChange(next);
          }}
        >
          <SelectTrigger
            className="h-7 text-xs flex-1 min-w-0"
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
            {(options.length > 0 || (!known && value && !isVariable)) && (
              <SelectSeparator />
            )}
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
        {canPreview && (
          <button
            type="button"
            onClick={preview}
            aria-label={`Play a sample of ${label}`}
            title={`Play a sample of ${label}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
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

function SortableTurn({
  id,
  index,
  children,
}: {
  id: string;
  index: number;
  children: (grip: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const grip = (
    <button
      type="button"
      className="inline-flex h-5 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground hover:bg-accent hover:text-foreground active:cursor-grabbing"
      aria-label={`Reorder turn ${index + 1}`}
      title="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <span className="group-hover/turn:hidden">{index + 1}</span>
      <GripVertical className="hidden h-3 w-3 group-hover/turn:block" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group/turn rounded-md border border-border bg-background p-2",
        isDragging && "relative z-10 opacity-90 shadow-lg",
      )}
      data-testid="speech-turn"
    >
      {children(grip)}
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
    onChange(
      turns.map((t, i) =>
        i === index || t.speaker === speaker ? { ...t, voice } : t,
      ),
    );
  };

  const setSpeaker = (index: number, name: string) => {
    const existing = turns.find(
      (t, i) => i !== index && t.speaker === name && t.voice,
    );
    update(
      index,
      existing ? { speaker: name, voice: existing.voice } : { speaker: name },
    );
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const ids = turns.map((_, i) => `speech-turn-${i}`);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onChange(arrayMove(turns, from, to));
  };

  return (
    <div
      className={cn(
        "@container/ss flex flex-col gap-2 w-full",
        refused && "opacity-60",
        className,
      )}
      data-testid="speech-script-editor"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium">Speech script</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {turns.length} {turns.length === 1 ? "turn" : "turns"} ·{" "}
          {speakers.length}
          {cap !== null ? `/${cap}` : ""} {cap === 1 ? "speaker" : "speakers"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2"
            onClick={() => onChange([...turns, newSpeechTurn(turns)])}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
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
          data-testid="speech-script-banner"
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {turns.map((turn, index) => (
                <SortableTurn key={ids[index]} id={ids[index]} index={index}>
                  {(grip) => (
                    <div className="flex flex-col gap-1.5">
                      {/* Who speaks, in which voice */}
                      <div className="flex items-start gap-2">
                        <span className="mt-1">{grip}</span>
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 @sm/ss:grid-cols-[10rem_minmax(0,1fr)]">
                          <Input
                            value={turn.speaker}
                            onChange={(e) => setSpeaker(index, e.target.value)}
                            aria-label={`Turn ${index + 1} speaker`}
                            placeholder="Speaker"
                            className={cn(
                              "h-7 text-xs font-medium",
                              (!turn.speaker.trim() ||
                                conflicts.has(turn.speaker)) &&
                                "border-destructive",
                            )}
                          />
                          <VoiceCell
                            value={turn.voice ?? ""}
                            options={options}
                            onChange={(voice) => setVoice(index, voice)}
                            index={index}
                            modelName={model?.name ?? null}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onChange(turns.filter((_, i) => i !== index))
                          }
                          disabled={turns.length === 1}
                          aria-label={`Remove turn ${index + 1}`}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* What they say — the line leads */}
                      <div className="min-w-0 @sm/ss:pl-7">
                        <ProTextarea
                          value={turn.text}
                          onChange={(e) =>
                            update(index, { text: e.target.value })
                          }
                          placeholder="What this speaker says. {{variables}} work."
                          aria-label={`Turn ${index + 1} text`}
                          autoGrow
                          minHeight={44}
                          maxHeight={200}
                          className={cn(
                            "text-sm",
                            !turn.text.trim() && "border-destructive/60",
                          )}
                        />
                        {turn.text.includes("{{") && (
                          <div className="mt-0.5 text-[11px] leading-snug">
                            <HighlightedText
                              text={turn.text}
                              validVariables={validVariables}
                            />
                          </div>
                        )}
                      </div>

                      {/* How — quiet, secondary */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @sm/ss:pl-7">
                        <label className="flex min-w-[12rem] flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
                          Direction
                          <Input
                            value={turn.direction ?? ""}
                            onChange={(e) =>
                              update(index, {
                                direction: e.target.value || null,
                              })
                            }
                            placeholder="e.g. warm, a little amused"
                            aria-label={`Turn ${index + 1} direction`}
                            className="h-7 flex-1 text-xs italic"
                          />
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          Pause after
                          <Input
                            value={
                              turn.pause_after_ms == null
                                ? ""
                                : String(turn.pause_after_ms)
                            }
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const parsed = raw === "" ? null : Number(raw);
                              update(index, {
                                pause_after_ms:
                                  parsed != null && Number.isFinite(parsed)
                                    ? Math.max(
                                        0,
                                        Math.min(
                                          MAX_PAUSE_MS,
                                          Math.round(parsed),
                                        ),
                                      )
                                    : null,
                              });
                            }}
                            inputMode="numeric"
                            placeholder="0"
                            aria-label={`Turn ${index + 1} pause after, milliseconds`}
                            className="h-7 w-16 text-center text-xs tabular-nums"
                          />
                          ms
                        </label>
                      </div>
                    </div>
                  )}
                </SortableTurn>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
