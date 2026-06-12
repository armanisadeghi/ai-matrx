"use client";

// RecordActionSheet — the "what do we do with this turn?" chooser for Agent+.
//
// Opens the instant recording STOPS (not after transcription) so the user picks
// during the 2-3s the transcript takes to prepare. Three big, icon-led, color-
// distinct choices. If the user doesn't pick, a 5s countdown auto-sends to the
// agent (which works for either intent). The choice is reported immediately via
// onChoose; the parent executes it now or the moment the transcript is ready.

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Send, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type RecordActionKey = "send" | "transcribe" | "transcribe-send";

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
    key: "send",
    label: "Send to agent",
    description: "Fire it as a turn now",
    icon: Webhook,
    tile: "bg-primary/15 text-primary",
  },
  {
    key: "transcribe-send",
    label: "Transcribe & send",
    description: "Stage it in the input and send",
    icon: Send,
    tile: "bg-secondary/15 text-secondary",
  },
  {
    key: "transcribe",
    label: "Transcribe only",
    description: "Drop into the input to edit first",
    icon: FileText,
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
      choose("send");
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
