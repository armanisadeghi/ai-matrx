"use client";

// features/vision-interview/components/NewInterviewExperience.tsx
//
// THE OPENING. A full-page invitation to give your vision — not a form.
// The Expert is a brilliant, non-technical person about to talk for ten
// minutes or more; the page's whole job is to make that feel natural and
// worth doing. One big generous speaking/writing surface (ProTextarea's
// built-in dictation mic), the room introduced by name — icon and text
// TOGETHER — and a single clear way forward.
//
// Replaced the cramped ConfirmDialog opening (Arman, 2026-08-18: "Is that
// really how you ask an artist to provide their vision?" — it wasn't).
//
// NEVER-LOSE-CONTENT: the vision draft lives in useDurableDraft under the
// SAME key the old dialog used, so any in-flight draft carries over; it is
// cleared only after the session row durably exists.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Mic } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import { useDurableDraft } from "@/hooks/useDurableDraft";
import { createSession } from "../service";
import { ROLE_ORDER, ROLES } from "../types";

/** A readable title from the vision's opening words when none was given. */
function titleFromVision(vision: string): string {
  const words = vision.trim().split(/\s+/).slice(0, 7).join(" ");
  return words.length > 60 ? `${words.slice(0, 57)}…` : words || "Untitled interview";
}

export function NewInterviewExperience() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const {
    draft: vision,
    setDraft: setVision,
    clearDraft: clearVision,
  } = useDurableDraft("vision-interview:new");
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const begin = async () => {
    if (busy || !vision.trim()) return;
    setBusy(true);
    try {
      const session = await createSession({
        title: title.trim() || titleFromVision(vision),
        visionStatement: vision,
      });
      clearVision();
      startTransition(() => {
        router.push(`/vision-interview/${session.id}`);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the interview.",
      );
      setBusy(false);
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/vision-interview"
              variant="transparent"
              ariaLabel="Back to interviews"
            />
            <span className="ml-1 truncate text-sm font-medium text-foreground">
              New vision interview
            </span>
          </>
        }
      />
      <div
        className="h-full overflow-y-auto bg-textured"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
          <div className="space-y-3 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Every great thing starts as someone&apos;s vision.
            </h1>
            <p className="mx-auto max-w-xl text-base text-muted-foreground sm:text-lg">
              Tell us yours — out loud or in writing, in your own words. Take
              all the time you want; ten minutes of talking is perfect. Nothing
              you say here is ever lost.
            </p>
          </div>

          <div className="space-y-3">
            <ProTextarea
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              placeholder="What do you see? Start anywhere — what it is, who it's for, why it matters…"
              aria-label="Your vision"
              autoGrow
              minHeight={260}
              maxHeight={560}
              className="rounded-xl border-border bg-card text-base shadow-sm sm:text-lg"
            />
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Mic className="h-4 w-4" aria-hidden />
              Prefer to talk? Press the mic and just speak — we&apos;ll write it
              down as you go.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name it (optional)"
              aria-label="Interview title (optional)"
              className="h-11 max-w-xs text-base sm:text-sm"
            />
            <Button
              size="lg"
              className="h-11 px-8 text-base"
              disabled={!vision.trim() || busy}
              onClick={() => void begin()}
            >
              {busy ? "Opening the room…" : "Begin the interview"}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Button>
          </div>

          <div className="space-y-3 pt-4">
            <p className="text-center text-sm font-medium text-muted-foreground">
              You&apos;ll be met by a room of specialists, one at a time — each
              here to make your vision better:
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {ROLE_ORDER.map((key) => {
                const role = ROLES[key];
                const Icon = role.icon;
                return (
                  <span
                    key={key}
                    title={role.description}
                    className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${role.accent.avatar}`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="text-sm text-foreground">{role.name}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
