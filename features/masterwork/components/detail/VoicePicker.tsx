"use client";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * "WHICH VOICE IS YOU?" — ONE PICKER, EVERY MASTERWORK LANE THAT HAS TO ASK.
 *
 * 🚨 WHY THIS FILE EXISTS (cold walk 8, 2026-09-17). Shadow-the-inbox had no
 * way to ask. When it could not work out which message in a thread was the
 * Expert's it REFUSED — "you never replied in it" — about a thread whose second
 * half was, visibly, their own answer; the only control it offered was a
 * free-text "Which address is yours?", which cannot help at all when the reply
 * carries no address (a mail client copies your own message labelled "me").
 *
 * The product already owned exactly the right question: the Meeting
 * Scavenger's speaker picker. This is that picker, lifted out unchanged in
 * shape and behaviour so the two lanes ask one question one way. The Meeting
 * Scavenger's own copy in `MeetingScavengerDialog.tsx` is still inline and
 * should be repointed here by whoever next touches that file — the count noun
 * is a prop precisely so it can be ("turns" there, "messages" here).
 */
export interface VoiceRow {
  key: string;
  name: string;
  /** How many turns / messages this voice holds in the source. */
  count: number;
  words: number;
  /** True when the SOURCE says this voice is the caller's — never a guess. */
  isYou: boolean;
  /** Shown beside the name when the source carried one. */
  address?: string;
}

export function VoicePicker({
  voices,
  selected,
  onToggle,
  disabled = false,
  title = "Which voice is you?",
  blurb,
  countNoun = "messages",
}: {
  voices: VoiceRow[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  title?: string;
  blurb?: string;
  /** "turns" for a meeting, "messages" for a mail thread. */
  countNoun?: string;
}) {
  if (!voices.length) return null;
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">{title}</div>
      {blurb ? <p className="text-xs text-muted-foreground">{blurb}</p> : null}
      <div className="space-y-1">
        {voices.map((voice) => (
          <label
            key={voice.key}
            className="flex cursor-pointer items-center gap-3 rounded p-1.5 hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.has(voice.key)}
              onCheckedChange={() => onToggle(voice.key)}
              disabled={disabled}
            />
            <span className="min-w-0 flex-1 text-sm">
              <span className="truncate">{voice.name}</span>
              {voice.address && voice.address !== voice.name ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {voice.address}
                </span>
              ) : null}
              {voice.isYou ? (
                <span className="ml-2 text-xs text-primary">
                  this one looks like you
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {voice.count} {countNoun} · {voice.words}{" "}
              {voice.words === 1 ? "word" : "words"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
