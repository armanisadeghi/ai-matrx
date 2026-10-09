"use client";

// AgentDuplicateDialog — THE one duplicate surface for agents. Every "Duplicate"
// (header menu, list row, card, quick look, read-only builder, versions tab,
// version page) opens this through `useAgentDuplicateFlow`:
//   choose  → pick the version (default: current) and the copy's name
//   loading → the copy runs
//   success → open it here, in a new tab, or stay
//   error   → the database's sentence

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
  Alert,
  AlertDescription,
} from "@ai-matrx/design-system";
import { Button, Select } from "@ai-matrx/design-system/controls";
import { ProInput } from "@/components/official/ProInput";
import { ErrorNotice } from "@ai-matrx/design-system";

export type AgentDuplicateStep = "choose" | "loading" | "success" | "error";

/** The value of the "copy the agent as it is now" choice. */
export const CURRENT_VERSION_CHOICE = "current";

export interface DuplicateVersionOption {
  versionId: string;
  versionNumber: number;
  changedAt: string;
  changeNote: string | null;
}

export interface AgentDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: AgentDuplicateStep;
  /** The source agent's name and live version number (null while loading). */
  sourceName: string | null;
  currentVersion: number | null;
  versions: DuplicateVersionOption[];
  versionsLoading: boolean;
  /** Set when the version list could not be read — the current version still works. */
  versionsError: string | null;
  /** CURRENT_VERSION_CHOICE or a version id. */
  selected: string;
  onSelectedChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  onConfirm: () => void;
  /** The copy's real name (a taken name gets " (2)") and where it opens. */
  newAgentName: string;
  newAgentPath: string | null;
  errorMessage: string;
  asSystem: boolean;
}

export function AgentDuplicateDialog({
  open,
  onOpenChange,
  step,
  sourceName,
  currentVersion,
  versions,
  versionsLoading,
  versionsError,
  selected,
  onSelectedChange,
  name,
  onNameChange,
  onConfirm,
  newAgentName,
  newAgentPath,
  errorMessage,
  asSystem,
}: AgentDuplicateDialogProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const close = () => onOpenChange(false);

  const title =
    step === "choose"
      ? asSystem
        ? "Duplicate system agent"
        : "Duplicate agent"
      : step === "loading"
        ? "Duplicating…"
        : step === "success"
          ? "Agent duplicated"
          : "Duplicate failed";

  const description =
    step === "choose"
      ? sourceName
        ? `Copy "${sourceName}" into a new agent.`
        : "Copy this agent into a new agent."
      : step === "success"
        ? `"${newAgentName}" is ready.`
        : step === "loading"
          ? "Copying instructions, settings, tools and samples."
          : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {step === "choose" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground" aria-hidden>
                Version
              </p>
              <Select
                aria-label="Version to copy"
                className="w-full"
                value={selected}
                onValueChange={onSelectedChange}
                options={[
                  {
                    value: CURRENT_VERSION_CHOICE,
                    label:
                      currentVersion != null
                        ? `Current version (v${currentVersion})`
                        : "Current version",
                  },
                  ...versions
                    .filter((v) => v.versionNumber !== currentVersion)
                    .map((v) => ({ value: v.versionId, label: versionOptionLabel(v) })),
                ]}
              />
              {versionsLoading && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading versions…
                </p>
              )}
              {versionsError && (
                <ErrorNotice
                  size="inline"
                  title="Past versions could not load"
                  message={versionsError}
                  operation="Load agent versions"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="agent-duplicate-name">
                Name
              </label>
              <ProInput
                id="agent-duplicate-name"
                wrapperClassName="w-full"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                aria-label="Name of the new agent"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="quiet" type="button" onClick={close}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" icon={<Copy />}>
                Duplicate
              </Button>
            </div>
          </form>
        )}

        {step === "loading" && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {step === "success" && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-success/20 bg-success/10 p-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
              <p className="text-sm font-medium">
                {asSystem ? "System agent created." : "Copy created."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                icon={isNavigating ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                disabled={!newAgentPath || isNavigating}
                onClick={() => {
                  if (!newAgentPath) return;
                  close();
                  startTransition(() => router.push(newAgentPath));
                }}
              >
                Open new agent
              </Button>
              {newAgentPath && (
                <Button
                  variant="outline"
                  icon={<ExternalLink />}
                  onClick={() => {
                    window.open(newAgentPath, "_blank", "noopener,noreferrer");
                    close();
                  }}
                >
                  Open in new tab
                </Button>
              )}
              <Button variant="quiet" onClick={close}>
                Stay here
              </Button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage || "The copy could not be made."}</AlertDescription>
            </Alert>
            <Button variant="outline" onClick={close} className="w-full">
              Close
            </Button>
          </div>
        )}
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
