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

import { useModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Loader2,
  Play,
  ShieldCheck,
  ShieldOff,
  Square,
} from "lucide-react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  selectTriggerVariants,
  Slider,
  Switch, Button as SurfaceButton, } from "@ai-matrx/design-system";
import { Input, SegmentedControl } from "@ai-matrx/design-system/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { useVoiceSample } from "@/features/audio/service/useVoiceSample";
import {
  voiceDisplayName,
  voiceOptions,
  voiceSetDefaultLabel,
  voiceSetOf,
  type VoiceSetId,
} from "@/lib/voices/voiceSets";
import {
  formatKnobValue,
  type KnobControl,
  type KnobLadder,
} from "@/lib/scoped-config/ladder";
import { knobChoices } from "@/lib/scoped-config/choices";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectPlatformDefaultTextModelId } from "@/features/ai-models/redux/platformDefaultModel";
import { useModels } from "@/features/ai-models/hooks/useModels";
import { getModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import {
  DECISION_DEFAULT_MODEL_KNOB,
  firstDecisionModelId,
} from "@/features/ai-models/preferredDecisionModel";
import { getSystemShortcut } from "@ai-matrx/chat/agents/constants/system-shortcuts";
import { ensureShortcutLoaded } from "@ai-matrx/chat/agents/redux/agent-shortcuts/thunks";
import { fetchAgentExecutionFull } from "@/features/agents/redux/builder-tier.thunks";
import { selectAgentCustomExecutionPayload } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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

const AGENT_GENERATOR_SHORTCUT_ID = getSystemShortcut("agent-generator-01").id;

/**
 * The builder's default is the generator shortcut's actual agent model, not
 * a generic catalog default. These are the same read thunks AgentGenerator
 * uses to load its shortcut; neither runs the agent nor writes configuration.
 */
function useAgentBuilderDefaultModel(enabled: boolean): {
  modelId: string | null;
  unavailable: boolean;
} {
  const dispatch = useAppDispatch();
  const shortcut = useAppSelector(
    (state) =>
      state.agentShortcut.shortcuts[AGENT_GENERATOR_SHORTCUT_ID] ?? null,
  );
  const agentId = shortcut?.agentId ?? null;
  const execution = useAppSelector((state) =>
    agentId ? selectAgentCustomExecutionPayload(state, agentId) : null,
  );
  const [failedIdentity, setFailedIdentity] = useState<string | null>(null);
  const readIdentity = agentId ?? "shortcut";

  useEffect(() => {
    if (!enabled || shortcut) return;
    let cancelled = false;
    void dispatch(ensureShortcutLoaded(AGENT_GENERATOR_SHORTCUT_ID))
      .unwrap()
      .catch(() => {
        if (!cancelled) setFailedIdentity(readIdentity);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, enabled, shortcut, readIdentity]);

  useEffect(() => {
    if (!enabled || !agentId || execution?.isReady) return;
    let cancelled = false;
    void dispatch(fetchAgentExecutionFull(agentId))
      .unwrap()
      .catch(() => {
        if (!cancelled) setFailedIdentity(readIdentity);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, enabled, agentId, execution?.isReady, readIdentity]);

  // Do not leave a broken or incomplete reader looking like a perpetual
  // loading state. A loaded shortcut without an agent, or an execution record
  // without a model, is an honest unavailable default. The identity-qualified
  // failure vanishes when a newly loaded shortcut points to another agent.
  const unavailable =
    enabled &&
    (failedIdentity === readIdentity ||
      (Boolean(shortcut) && !agentId) ||
      Boolean(execution?.isReady && !execution.modelId));

  return { modelId: execution?.modelId ?? null, unavailable };
}

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
  /**
   * A model key's CLASS, carried by its row at the same rung
   * (`lib/scoped-config/modelClassCompanion`). Present → the picker shows one
   * row per class and `onPick` commits the model and its class together.
   */
  modelClass?: {
    pinnedOfferingId: string | undefined;
    onPick: (
      modelId: string,
      offeringId: string | undefined,
    ) => void | boolean | Promise<void | boolean>;
  };
};

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
        variant="outline"
        aria-label={
          labelId ? undefined : `Edit structured value for ${knob.label}`
        }
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
      <Textarea mono minHeight={112}
        id={inputId}
        aria-label={labelId ? undefined : `Structured value for ${knob.label}`}
        aria-labelledby={labelId}
        value={raw}
        disabled={disabled}
        onChange={(event) => {
          setRaw(event.target.value);
          setError(null);
        }}
      />
      {error && (
        <p className="text-xs text-destructive">
          {error} <ErrorAlchemyMenu error={error} />
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
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
        <Button variant="quiet" disabled={disabled} onClick={reset}>
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
  // The words come from the registry (`platform.feature_knob.ui.options`),
  // through the ONE function that owns them. This file used to prettify the
  // stored token itself, which is why "Fast (recommended)" — written into the
  // registry by the person who owns that setting — was never what anyone read.
  const choices = knobChoices(knob);

  if (choices.length === 0) return null;
  const current = String(ladder.value ?? "");

  return (
    <div
      role="group"
      aria-label={labelId ? undefined : knob.label}
      aria-labelledby={labelId}
      className={cn("flex h-9 items-center", disabled && "opacity-50")}
    >
      <SegmentedControl aria-label="Setting"
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
 * The decision knob's runtime default when unset: the catalog's first
 * decision model — the same fallback `DecisionPlayground` applies, read from
 * the same model registry. `unavailable` is true only once the catalog is
 * loaded and holds no decision model, so the row says so instead of spinning.
 */
function useCatalogDecisionDefaultModel(enabled: boolean): {
  modelId: string | null;
  unavailable: boolean;
  /** The catalog read failed — "no decision model" would be a false claim. */
  error: string | null;
} {
  const { models, isReady, error } = useModels();
  if (!enabled) return { modelId: null, unavailable: false, error: null };
  const modelId = firstDecisionModelId(models);
  return {
    modelId,
    unavailable: !error && isReady && modelId === null,
    error: modelId === null && error ? String(error) : null,
  };
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
  modelClass,
}: KnobFieldControlProps) {
  const isBuilderKey =
    knob.full_key === "agents.model_prefs.agent_authoring_default_model";
  // The decision knob picks from the DECISION contract only — offering chat
  // models here would let a person save a default the decision surface
  // cannot run. Same filter the Decision playground's picker uses.
  const isDecisionKey = knob.full_key === DECISION_DEFAULT_MODEL_KNOB;
  const configuredValue =
    typeof ladder.value === "string" && ladder.value !== ""
      ? ladder.value
      : null;
  // Basic chat has a canonical, catalog-backed runtime default. Show that
  // concrete model when the ladder's stored answer deliberately means
  // "platform default". The authoring key reads its generator's configured
  // model through the same read path that prepares the generator itself.
  const platformTextModelId = useModelRecords(selectPlatformDefaultTextModelId);
  const builderDefault = useAgentBuilderDefaultModel(
    isBuilderKey && !configuredValue,
  );
  const decisionDefault = useCatalogDecisionDefaultModel(
    isDecisionKey && !configuredValue,
  );
  const value =
    configuredValue ??
    (knob.full_key === "agents.model_prefs.chat_default_model"
      ? platformTextModelId
      : isBuilderKey
        ? builderDefault.modelId
        : isDecisionKey
          ? decisionDefault.modelId
          : null);
  const isBuilderDefault = !configuredValue && isBuilderKey;
  const dispatch = useAppDispatch();
  // The dropdown reports a class pick BEFORE the model pick of the same
  // gesture (pin, then value), and reports a class-only change (same model)
  // with no value call at all. Hold the pin for one microtask so one gesture
  // commits ONE (model, class) pair; a pin nobody claimed commits alone.
  const pendingPin = useRef<{ offeringId: string | undefined } | null>(null);
  const classSelection = modelClass
    ? {
        pinnedOfferingId: modelClass.pinnedOfferingId,
        onOfferingPinChange: (offeringId: string | undefined) => {
          const held = { offeringId };
          pendingPin.current = held;
          queueMicrotask(() => {
            if (pendingPin.current !== held) return;
            pendingPin.current = null;
            if (value) void modelClass.onPick(value, offeringId);
          });
        },
      }
    : // No class carrier (a caller that renders the control without its row):
      // one row per model, never a class choice that would be dropped on save.
      ({ modelOnly: true } as const);
  return (
    <>
      <ModelListDropdown
        id={inputId}
        aria-label={labelId ? undefined : knob.label}
        aria-labelledby={labelId}
        value={value}
        onValueChange={(next) => {
          const pin = pendingPin.current;
          pendingPin.current = null;
          if (modelClass && pin) {
            if (next) void modelClass.onPick(next, pin.offeringId);
            return;
          }
          // A rendered runtime default is already the effective choice. Picking
          // that same catalog row must not materialize a redundant user override.
          if (!next || next === value) return;
          if (modelClass) {
            void modelClass.onPick(next, modelClass.pinnedOfferingId);
          } else {
            void onCommit(next);
          }
        }}
        {...classSelection}
        inputModalities={[]}
        outputModalities={isDecisionKey ? ["decision"] : ["text"]}
        selectionPurpose={isDecisionKey ? "decision" : undefined}
        placeholder={
          builderDefault.unavailable
            ? "Agent builder model is unavailable"
            : decisionDefault.error
              ? "The model catalog could not be read"
              : decisionDefault.unavailable
                ? "No decision model in the catalog"
                : isBuilderDefault
                  ? "Loading agent builder's model…"
                  : "Loading current model…"
        }
        disabled={disabled}
        triggerVariant="settings"
        className="w-full min-w-0 justify-between"
      />
      {decisionDefault.error ? (
        <ReadFailure
          error={decisionDefault.error}
          what="the model catalog"
          onRetry={() => getModelRecords().loadOptions()}
          className="mt-2"
        />
      ) : null}
    </>
  );
}

/**
 * A voice, with a sample you hear before you keep it. Which voices a knob
 * lists is its `ui.preview` voice set (lib/voices/voiceSets): read-aloud
 * (Cartesia) or live conversation (xAI). Samples play through the ONE queue
 * (`useVoiceSample` → speak()), the same path every other sound takes.
 */
function VoiceField({
  knob,
  ladder,
  disabled,
  onCommit,
  inputId,
  labelId,
}: KnobFieldControlProps) {
  const set = voiceSetOf(knob.ui?.preview);
  const current = typeof ladder.value === "string" ? ladder.value : "";
  const [open, setOpen] = useState(false);
  const selectedLabel = voiceDisplayName(set, current);
  const defaultLabel = voiceSetDefaultLabel(set);
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
        <SurfaceButton
          id={inputId}
          type="button"
          variant="outline"
          disabled={disabled}
          title={current ? undefined : defaultLabel}
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
        </SurfaceButton>
      </PopoverTrigger>
      {open && (
        <PopoverContent
          sizing="content"
          align="start"
          className="overflow-hidden p-0"
        >
          <VoiceChooser
            set={set}
            current={current}
            disabled={disabled}
            onSelect={handleSelect}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}

/** Mounted only while the chooser is open, so a settings page plays nothing until asked. */
function VoiceChooser({
  set,
  current,
  disabled,
  onSelect,
}: {
  set: VoiceSetId;
  current: string;
  disabled?: boolean;
  onSelect: (voiceId: string) => void;
}) {
  const sample = useVoiceSample();
  const [query, setQuery] = useState("");
  const voices = voiceOptions(set);
  const matchingVoices = voices.filter((voice) => {
    const search = query.trim().toLocaleLowerCase();
    return (
      search === "" ||
      voice.name.toLocaleLowerCase().includes(search) ||
      (voice.description ?? "").toLocaleLowerCase().includes(search)
    );
  });

  return (
    <div className="flex min-h-0 max-h-[min(32rem,var(--radix-popover-content-available-height))] flex-col">
      {voices.length > 8 && (
        <div className="shrink-0 border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search voices"
            aria-label="Search voices"
          />
        </div>
      )}
      <div className="min-h-0 flex-auto overflow-y-auto">
        <div className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-accent">
          <SurfaceButton
            type="button"
            variant="ghost"
            className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-2 py-1.5 text-left text-sm"
            disabled={disabled}
            onClick={() => onSelect("")}
          >
            <span className="min-w-0 flex-1 break-words">
              Default — {voiceSetDefaultLabel(set)}
            </span>
            {current === "" && <Check className="h-4 w-4 shrink-0" />}
          </SurfaceButton>
        </div>
        {matchingVoices.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            No voices match “{query}”.
          </p>
        ) : (
          matchingVoices.map((voice) => {
            const key = `${set}:${voice.id}`;
            const playing = sample.playingKey === key;
            return (
              <div
                key={voice.id}
                className="flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-accent"
              >
                <SurfaceButton
                  type="button"
                  variant="ghost"
                  className="h-auto min-w-0 flex-1 justify-start whitespace-normal px-2 py-1.5 text-left text-sm"
                  disabled={disabled}
                  onClick={() => onSelect(voice.id)}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {voice.name}
                  </span>
                  {voice.id === current && (
                    <Check className="h-4 w-4 shrink-0" />
                  )}
                </SurfaceButton>
                <Button
                  icon={playing && sample.starting ? (
                    <Loader2 className="animate-spin" />
                  ) : playing ? (
                    <Square />
                  ) : (
                    <Play />
                  )}
                  type="button"
                  variant="quiet"
                  className="shrink-0"
                  aria-label={
                    playing
                      ? "Stop voice sample"
                      : `Play sample for ${voice.name}`
                  }
                  disabled={disabled}
                  onClick={() => sample.play(set, voice.id, voice.name)}
                />
              </div>
            );
          })
        )}
      </div>
      {sample.error && (
        <p className="shrink-0 px-2 py-1 text-[11px] text-destructive">
          The sample could not play: {sample.error}
          <ErrorAlchemyMenu error={sample.error} />
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
        <Button variant="outline" asChild>
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
