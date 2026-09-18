"use client";

/**
 * The hosted run's Stop control.
 *
 * A hosted Claude Code run happens in a Matrx Sandbox we started, so the user
 * must be able to stop it — and the control must say what stopping ends, not
 * ask a generic "Are you sure?" (`common-docs/policies/destructive-and-expensive-actions.md`).
 * A plain cancel gets no confirm dialog; it gets an honest sentence.
 *
 * Law 4 — absent or honest, never dead. Cancel needs the sandbox's run id,
 * which the run's own stream reports. Until that id arrives there is NO
 * button: there is a sentence saying stopping becomes possible the moment the
 * sandbox reports the run. A disabled-looking button that cannot act is the
 * failure mode this avoids.
 */

import { useState } from "react";
import { Loader2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cancelHostedRun } from "@/features/ai-work/lib/hostedSandboxRun";

export function HostedRunControls({
  running,
  runtimeId,
  onCancelled,
}: {
  /** A hosted run is in flight. */
  running: boolean;
  /** The sandbox run id the stream reported, or null if it has not yet. */
  runtimeId: string | null;
  onCancelled?: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);

  if (!running) return null;

  if (!runtimeId) {
    return (
      <p className="text-xs text-muted-foreground">
        The sandbox has not reported this run&apos;s id yet. Stopping becomes
        available the moment it does.
      </p>
    );
  }

  const stop = async () => {
    setCancelling(true);
    try {
      const result = await cancelHostedRun(runtimeId);
      if (result.cancelled) {
        toast.success(
          "The hosted Claude Code session was stopped. Anything it already wrote in the sandbox stays as it is.",
        );
        onCancelled?.();
      } else {
        toast.error(
          "AI Matrx could not confirm the hosted session stopped. It may still be running — check the conversation.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `The hosted session could not be stopped — ${error.message}`
          : "The hosted session could not be stopped.",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={stop}
        disabled={cancelling}
      >
        {cancelling ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Square className="mr-1.5 h-3.5 w-3.5" />
        )}
        Stop the hosted session
      </Button>
      <span className="text-xs text-muted-foreground">
        Stops the Claude Code run in the Matrx Sandbox now. Work it already
        finished stays in the conversation; anything in progress is lost.
      </span>
    </div>
  );
}
