"use client";

/**
 * RequestAccessPanel — the ask, and everything that happens after it.
 *
 * Three states in one place, because they are the same conversation:
 *   ask      → level choice + an optional note + Send
 *   pending  → who it went to, and a way to take it back
 *   answered → what they said
 *
 * Deliberately NOT a dialog. The user is already stuck on a wall; making them
 * open a modal to knock on the door adds a step to the worst moment in the app.
 */

import { useState } from "react";
import { Check, Loader2, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  createAccessRequest,
  withdrawAccessRequest,
} from "@/features/access-gate/service/accessRequests";
import type {
  AccessDeniedContext,
  RequestedLevel,
} from "@/features/access-gate/types";

interface RequestAccessPanelProps {
  context: AccessDeniedContext;
  /**
   * The record's id. It is NOT on the context — the RPC never echoes back an id
   * the caller already had, so the surface that knows it passes it through.
   */
  resourceId: string;
  /** Where the record lives, passed to the recipient's DM chip. */
  href?: string | null;
  onChanged: () => void;
}

/** "AI Matrx Admin", or an honest generic when the owner has no profile name. */
function ownerName(context: AccessDeniedContext): string {
  return context.owner?.displayName ?? "the owner";
}

export function RequestAccessPanel({
  context,
  resourceId,
  href,
  onChanged,
}: RequestAccessPanelProps) {
  const currentUserId = useAppSelector(selectUserId);
  const [level, setLevel] = useState<RequestedLevel>("viewer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** Null until we've sent one; 0 means the row saved but nobody was reached. */
  const [delivered, setDelivered] = useState<number | null>(null);
  /** The user chose to ask again after a decline. */
  const [reasking, setReasking] = useState(false);

  const request = context.request;
  const kind = context.entity.label.toLowerCase();

  async function send() {
    setBusy(true);
    try {
      const result = await createAccessRequest({
        resourceType: context.entity.token,
        resourceId,
        level,
        message: note,
        currentUserId,
        href,
      });
      if (result.already) {
        toast.success("You've already asked — they haven't answered yet.");
      } else if (result.delivered === 0) {
        // The request row landed, but nobody was actually reached. Saying
        // "sent" here would be the same unverified claim this whole feature
        // exists to stop.
        toast.warning(
          "Your request is saved, but we couldn't message them just now.",
        );
      } else {
        toast.success(
          `Request sent to ${
            result.recipients[0]?.displayName ?? ownerName(context)
          }.`,
        );
      }
      setDelivered(result.already ? null : (result.delivered ?? null));
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't send that.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!request) return;
    setBusy(true);
    try {
      await withdrawAccessRequest(request.id);
      toast.success("Request withdrawn.");
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "We couldn't withdraw that.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (request?.status === "pending") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm text-foreground">
          <Check className="mr-1.5 inline h-4 w-4 text-primary" aria-hidden />
          Waiting on {ownerName(context)}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {delivered === 0
            ? "We couldn't reach them with a message, but your request is saved and they'll see it."
            : "They’ve been messaged. You’ll get a message back the moment they answer, and this page will open."}
        </p>
        <Button
          className="mt-3 h-8"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void withdraw()}
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          Withdraw request
        </Button>
      </div>
    );
  }

  // A declined ask used to end in "reach out to them directly" with no way to
  // do it — a dead end inside the No Dead Ends primitive. The database happily
  // accepts a fresh request (declined is neither pending nor reported), so the
  // door is real; it just wasn't rendered.
  if (request?.status === "declined" && !reasking) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-sm text-foreground">
          {ownerName(context)} declined this request.
        </p>
        {request.decisionNote ? (
          <p className="mt-1 text-xs text-muted-foreground">
            &ldquo;{request.decisionNote}&rdquo;
          </p>
        ) : null}
        <Button
          className="mt-3 h-8"
          size="sm"
          variant="outline"
          onClick={() => setReasking(true)}
        >
          <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          Ask again
        </Button>
      </div>
    );
  }

  if (request?.status === "reported" || !context.canRequest) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">
        Ask {ownerName(context)} for access
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <LevelChoice
          active={level === "viewer"}
          label="Just to view"
          onClick={() => setLevel("viewer")}
        />
        <LevelChoice
          active={level === "editor"}
          label="To view and make changes"
          onClick={() => setLevel("editor")}
        />
      </div>

      <Textarea
        className="mt-3 min-h-16 text-base md:text-sm"
        placeholder={`Why you need this ${kind} (optional)`}
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />

      <Button
        className="mt-3"
        size="sm"
        disabled={busy}
        onClick={() => void send()}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Send className="mr-1.5 h-4 w-4" aria-hidden />
        )}
        Request access
      </Button>
    </div>
  );
}

function LevelChoice({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-accent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
