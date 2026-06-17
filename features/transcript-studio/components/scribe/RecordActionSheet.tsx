"use client";

// RecordActionSheet — the "what do we do with this turn?" chooser for Agent+.
//
// Opens the instant recording STOPS (not after transcription) so the user picks
// during the 2-3s the transcript takes to prepare. Four big, icon-led, color-
// distinct choices spanning the two things you can do with a captured turn —
// hand it to the agent, and/or save it durably to Transcripts:
//   • agent — drop the transcript in the input (auto-opens + focuses) to review.
//   • save  — save audio + transcript + cleaned copy to Transcripts (Tab-1 pipeline).
//   • both  — save AND drop it in the input.
//   • now   — fire it to the agent as a turn immediately (hands-free voice flow).
// If the user doesn't pick, a 5s countdown auto-sends the turn to the agent,
// preserving the voice-in / voice-out flow this surface is built around. The
// choice is reported immediately via onChoose; the parent executes it now or the
// moment the transcript is ready.

import { useEffect, useRef, useState } from "react";
import { FileText, Layers, Loader2, Save, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type RecordActionKey = "agent" | "save" | "both" | "now";

/** Auto-fired when the countdown lapses — the hands-free default for this surface. */
export const AUTO_RECORD_ACTION: RecordActionKey = "now";

interface RecordActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True while the transcript is still being prepared (no text yet). */
  preparing: boolean;
  /** Fired with the chosen action key (also fired by the auto-send timeout). */
  onChoose: (key: RecordActionKey) => void;
}

const AUTO_SEND_SECONDS = 5;

interface Choice {
  key: RecordActionKey;
  label: string;
  description: string;
  icon: typeof Webhook;
  /** Tailwind classes for the icon tile. */
  tile: string;
}

const CHOICES: Choice[] = [
  {
    key: "agent",
    label: "Send to agent",
    description: "Drop it in the input, ready to send",
    icon: FileText,
    tile: "bg-primary/15 text-primary",
  },
  {
    key: "save",
    label: "Save to transcripts",
    description: "Save audio, transcript & cleaned copy",
    icon: Save,
    tile: "bg-secondary/15 text-secondary",
  },
  {
    key: "both",
    label: "Both",
    description: "Save it and drop it in the input",
    icon: Layers,
    tile: "bg-accent text-accent-foreground",
  },
  {
    key: "now",
    label: "Send now",
    description: "Fire it as a turn right away",
    icon: Webhook,
    tile: "bg-muted text-foreground",
  },
];

export function RecordActionSheet({
  open,
  onOpenChange,
  preparing,
  onChoose,
}: RecordActionSheetProps) {
  const [chosen, setChosen] = useState<RecordActionKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_SEND_SECONDS);
  const firedRef = useRef(false);

  // Reset per open.
  useEffect(() => {
    if (open) {
      setChosen(null);
      setSecondsLeft(AUTO_SEND_SECONDS);
      firedRef.current = false;
    }
  }, [open]);

  const choose = (key: RecordActionKey) => {
    if (firedRef.current) return;
    firedRef.current = true;
    setChosen(key);
    onChoose(key);
  };

  // Countdown → auto-send. Only runs once the transcript is ready and the user
  // hasn't chosen — picking during "preparing" cancels it before it starts.
  useEffect(() => {
    if (!open || preparing || chosen) return;
    if (secondsLeft <= 0) {
      choose(AUTO_RECORD_ACTION);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preparing, chosen, secondsLeft]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg min-h-[50dvh]">
        <DrawerHeader className="pb-1 text-left">
          <DrawerTitle className="flex items-center justify-between text-base">
            <span>What should we do with this?</span>
            {!chosen && !preparing && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {secondsLeft}
              </span>
            )}
          </DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-2 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {CHOICES.map((c) => {
            const Icon = c.icon;
            const isChosen = chosen === c.key;
            const waiting = isChosen && preparing;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => choose(c.key)}
                disabled={!!chosen}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors disabled:cursor-default",
                  isChosen
                    ? "border-primary bg-primary/5"
                    : "border-border active:bg-accent disabled:opacity-40",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    c.tile,
                  )}
                >
                  {waiting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-foreground">
                    {c.label}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {waiting ? "Preparing transcript…" : c.description}
                  </span>
                </span>
              </button>
            );
          })}

          <p className="px-1 pt-1 text-center text-xs text-muted-foreground">
            {chosen
              ? "Working…"
              : preparing
                ? "Preparing transcript — pick any time"
                : `Auto-sends to the agent in ${secondsLeft}s`}
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
