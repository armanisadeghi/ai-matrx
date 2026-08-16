"use client";

// features/vision-interview/components/Composer.tsx
//
// The human's turn. Submits via POST /runs/{run_id}/resume (through
// useInterviewRun — the resume stream is adopted canonically). Also carries
// the role-summon control ("bring in the Adversary" → summon_role in the
// resume payload, design-doc open Q3).

import { useState } from "react";
import { Play, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectPendingInterrupt,
  selectRunPhase,
} from "../redux/vision-interview.slice";
import { ROLE_ORDER, ROLES, type RoleKey } from "../types";
import type { ResumeInput } from "../hooks/useInterviewRun";

interface ComposerProps {
  onResume: (input: ResumeInput) => Promise<void>;
  onStart: () => Promise<void>;
}

export function Composer({ onResume, onStart }: ComposerProps) {
  const runPhase = useAppSelector(selectRunPhase);
  const pendingInterrupt = useAppSelector(selectPendingInterrupt);
  const [text, setText] = useState("");
  const [summon, setSummon] = useState<RoleKey | null>(null);
  const [busy, setBusy] = useState(false);

  const canAnswer = runPhase === "waiting_human";
  const canStart = runPhase === "idle" || runPhase === "complete" || runPhase === "error";

  const submit = async () => {
    if (!canAnswer || busy) return;
    const message = text.trim();
    if (!message && !summon) return;
    setBusy(true);
    try {
      await onResume({ message, summonRole: summon ?? undefined });
      setText("");
      setSummon(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border bg-background p-2">
      {pendingInterrupt?.prompt && canAnswer && (
        <p className="mb-1 px-1 text-xs text-muted-foreground">
          {pendingInterrupt.prompt}
        </p>
      )}
      {summon && (
        <p className="mb-1 px-1 text-xs text-primary">
          Bringing in the {ROLES[summon].name} with this turn.
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={
            canAnswer
              ? "Answer the room…"
              : canStart
                ? "Start the interview to begin"
                : "The room is working…"
          }
          disabled={!canAnswer || busy}
          rows={2}
          className="min-h-[44px] flex-1 resize-none text-base sm:text-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={!canAnswer || busy}
              aria-label="Bring in a role"
              title="Bring in a role"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Bring in…</DropdownMenuLabel>
            {ROLE_ORDER.map((key) => {
              const role = ROLES[key];
              const Icon = role.icon;
              return (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => setSummon(key)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {role.name}
                </DropdownMenuItem>
              );
            })}
            {summon && (
              <DropdownMenuItem onSelect={() => setSummon(null)}>
                Clear summon
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {canStart ? (
          <Button
            onClick={() => void onStart()}
            disabled={busy}
            aria-label="Start the interview"
          >
            <Play className="mr-1 h-4 w-4" />
            Start
          </Button>
        ) : (
          <Button
            onClick={() => void submit()}
            disabled={!canAnswer || busy || (!text.trim() && !summon)}
            aria-label="Send your turn"
          >
            <Send className="mr-1 h-4 w-4" />
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
