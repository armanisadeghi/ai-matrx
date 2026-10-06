"use client";

import { useTransition } from "react";
import { useRouter } from "../../../host/navigation";
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
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@ai-matrx/design-system";
import { Alert, AlertDescription } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system";
import { Select } from "@ai-matrx/design-system/controls";
import { useIsMobile } from "@ai-matrx/kit/media-query";

/** "choose" = the person picks which version to copy before anything runs. */
export type DuplicateOutcomeState = "choose" | "loading" | "success" | "error";

/** The value of the "copy the agent as it is now" choice. */
export const CURRENT_VERSION_CHOICE = "current";

export interface DuplicateVersionOption {
  versionId: string;
  versionNumber: number;
  changedAt: string;
  changeNote: string | null;
}

export interface DuplicateVersionChooser {
  /** The source agent's live version number, shown on the default choice. */
  currentVersion: number | null;
  /** Saved past versions, newest first. */
  versions: DuplicateVersionOption[];
  versionsLoading: boolean;
  /** Set when the version list could not be read — the current version still works. */
  versionsError: string | null;
  /** CURRENT_VERSION_CHOICE or a version id. */
  selected: string;
  onSelectedChange: (value: string) => void;
  onConfirm: () => void;
}

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
  /** Required for the "choose" state. */
  chooser?: DuplicateVersionChooser;
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
  chooser,
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
    state === "choose"
      ? "Duplicate agent"
      : state === "loading"
      ? "Duplicating agent…"
      : state === "success"
        ? asSystem
          ? "System agent duplicated"
          : "Agent duplicated"
        : "Duplicate failed";

  const descriptionText =
    state === "choose"
      ? "Pick the version to copy into a new agent."
      : state === "loading"
      ? "Creating a copy with all messages, variables, settings, and tools."
      : state === "success"
        ? newAgentName
          ? `"${newAgentName}" is ready. Where would you like to go?`
          : "The copy is ready. Where would you like to go?"
        : (errorMessage ?? "Something went wrong while duplicating.");

  const body = (
    <div className="space-y-4">
      {state === "choose" && chooser && (
        <div className="space-y-3">
          <Select
            aria-label="Version to copy"
            className="w-full"
            value={chooser.selected}
            onValueChange={chooser.onSelectedChange}
            options={[
              {
                value: CURRENT_VERSION_CHOICE,
                label:
                  chooser.currentVersion != null
                    ? `Current version (v${chooser.currentVersion})`
                    : "Current version",
              },
              ...chooser.versions
                .filter((v) => v.versionNumber !== chooser.currentVersion)
                .map((v) => ({ value: v.versionId, label: versionOptionLabel(v) })),
            ]}
          />
          {chooser.versionsLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading versions…
            </p>
          )}
          {chooser.versionsError && (
            <p className="text-xs text-destructive">
              Past versions could not be loaded: {chooser.versionsError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleStayHere}>
              Cancel
            </Button>
            <Button onClick={chooser.onConfirm}>
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          </div>
        </div>
      )}

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

            {newAgentPath ? (
              <Button
                size="lg"
                variant="outline"
                onClick={handleOpenInNewTab}
                className="w-full justify-start gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                {/* new-tab-icon: handleOpenInNewTab (defined above) calls window.open(newAgentPath, '_blank', ...) */}
                <span className="flex-1 text-left">Open in new tab</span>
              </Button>
            ) : null}

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

function versionOptionLabel(v: DuplicateVersionOption): string {
  const date = new Date(v.changedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const note = v.changeNote?.trim();
  return note
    ? `v${v.versionNumber} · ${date} · ${note.length > 40 ? `${note.slice(0, 40)}…` : note}`
    : `v${v.versionNumber} · ${date}`;
}
