"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

export type DuplicateOutcomeState = "loading" | "success" | "error";

export interface AgentDuplicateOutcomeDialogProps {
  open: boolean;
  /** Called when the user dismisses the dialog (X button, escape, or "Stay
   *  here"). The dialog is fully controlled — the parent owns lifecycle. */
  onOpenChange: (open: boolean) => void;
  state: DuplicateOutcomeState;
  /** Display name of the new agent (only meaningful in success state). */
  newAgentName?: string;
  /** Path to the new agent — used by both "Open new agent" and "Open in new
   *  tab." Defaults to `null` while loading; required in success state. */
  newAgentPath?: string | null;
  /** Optional error message in error state. */
  errorMessage?: string;
  /** Whether the source agent was a builtin/system agent. Tweaks the success
   *  copy so admins know the duplicate is also a system agent. */
  asSystem?: boolean;
}

/**
 * Post-duplicate "where would you like to go?" choice surface.
 *
 * Flow:
 *   1. Parent fires the duplicate thunk and immediately mounts this dialog
 *      with `state="loading"` so the user sees the in-flight work.
 *   2. On success, the parent flips to `state="success"` and supplies the
 *      new agent's id + computed `newAgentPath`. The user picks one of three
 *      destinations (open in current tab, open in new tab, stay here).
 *   3. On failure, the parent flips to `state="error"` with a message.
 *
 * Mobile renders as a bottom Drawer (per project mobile rules — never Dialog
 * on mobile); desktop uses a small Dialog (`sm:max-w-md`).
 */
export function AgentDuplicateOutcomeDialog({
  open,
  onOpenChange,
  state,
  newAgentName,
  newAgentPath,
  errorMessage,
  asSystem = false,
}: AgentDuplicateOutcomeDialogProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();

  const handleGoToAgent = () => {
    if (!newAgentPath) return;
    onOpenChange(false);
    startTransition(() => router.push(newAgentPath));
  };

  const handleOpenInNewTab = () => {
    if (!newAgentPath) return;
    window.open(newAgentPath, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  const handleStayHere = () => {
    onOpenChange(false);
  };

  const titleText =
    state === "loading"
      ? "Duplicating agent…"
      : state === "success"
        ? asSystem
          ? "System agent duplicated"
          : "Agent duplicated"
        : "Duplicate failed";

  const descriptionText =
    state === "loading"
      ? "Creating a copy with all messages, variables, settings, and tools."
      : state === "success"
        ? newAgentName
          ? `"${newAgentName}" is ready. Where would you like to go?`
          : "The copy is ready. Where would you like to go?"
        : (errorMessage ?? "Something went wrong while duplicating.");

  const body = (
    <div className="space-y-4">
      {state === "loading" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Please wait…</p>
        </div>
      )}

      {state === "success" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-md bg-success/10 border border-success/20">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <p className="text-sm font-medium">Copy created successfully.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={handleGoToAgent}
              disabled={!newAgentPath || isNavigating}
              className="w-full justify-start gap-2"
            >
              {isNavigating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              <span className="flex-1 text-left">Open new agent</span>
            </Button>

            <Button
              size="lg"
              variant="outline"
              onClick={handleOpenInNewTab}
              disabled={!newAgentPath}
              className="w-full justify-start gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="flex-1 text-left">Open in new tab</span>
            </Button>

            <Button
              size="lg"
              variant="ghost"
              onClick={handleStayHere}
              className="w-full justify-start gap-2"
            >
              <Copy className="h-4 w-4" />
              <span className="flex-1 text-left">Stay here</span>
            </Button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {errorMessage ?? "Failed to duplicate agent."}
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={handleStayHere} className="w-full">
            Close
          </Button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85dvh] pb-safe">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              {titleText}
            </DrawerTitle>
            <DrawerDescription>{descriptionText}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {titleText}
          </DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
