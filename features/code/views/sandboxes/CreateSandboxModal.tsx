"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BasicInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractErrorMessage } from "@/utils/errors";
import type { SandboxCreateRequest, SandboxInstance } from "@/types/sandbox";

import { CreateSandboxFormFields } from "./CreateSandboxFormFields";
import { SandboxDiagnosticsPanel, type SandboxDiagnostics } from "./SandboxDiagnosticsPanel";
import { useSandboxCreate } from "./useSandboxCreate";

interface CreateSandboxModalProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  /**
   * Create the sandbox row + return the instance so the modal can show
   * diagnostics for it. The parent should NOT auto-close/wire the
   * sandbox here — defer that to ``onReady`` (fired when the modal's
   * diagnostics report ``overall_ok=true``) or to the user clicking
   * "Open sandbox" in the diagnostics phase. Returning ``void`` is
   * accepted for back-compat — the modal then closes immediately.
   */
  onCreate: (request: SandboxCreateRequest) => Promise<SandboxInstance | void>;
  /**
   * Called when the just-created sandbox passes the
   * ``overall_ok=true`` readiness check. Use this to wire up Redux,
   * navigate to the detail page, etc. — the actions you used to do
   * inside ``onCreate`` synchronously.
   */
  onReady?: (instance: SandboxInstance, diag: SandboxDiagnostics) => void;
}

/**
 * "New sandbox" dialog used by `SandboxesPanel`. The form state and template
 * catalog live in `useSandboxCreate` so the `/sandbox` page can reuse them.
 *
 * TTL and the hosted-tier resource overrides are owned here because the
 * modal's UX (free-form minutes + an opt-in CPU/memory/disk panel) is
 * specific to this surface — the page uses hour presets and never overrides
 * resources.
 */
export const CreateSandboxModal: React.FC<CreateSandboxModalProps> = ({
  open,
  busy,
  onClose,
  onCreate,
  onReady,
}) => {
  const form = useSandboxCreate({ enabled: open });
  const { resources, setResources, persistChoices, buildRequest, tier } = form;

  const [ttlMinutes, setTtlMinutes] = useState<number | "">(60);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // After successful create the modal pivots from form → diagnostics so
  // the operator sees aidream/matrx_agent/DB-pool readiness in real time
  // and only proceeds when overall_ok=true. This was the user's explicit
  // ask — never let a sandbox claim "ready" without a verified probe.
  const [createdInstance, setCreatedInstance] = useState<SandboxInstance | null>(null);
  const [readyDiag, setReadyDiag] = useState<SandboxDiagnostics | null>(null);

  const submit = async () => {
    setSubmitError(null);
    persistChoices();
    const ttlSeconds =
      typeof ttlMinutes === "number" && ttlMinutes > 0
        ? ttlMinutes * 60
        : undefined;
    try {
      const instance = await onCreate(buildRequest({ ttlSeconds }));
      if (instance) {
        setCreatedInstance(instance);
      } else {
        // Parent didn't return the instance — fall back to the legacy
        // "close immediately" behavior.
        onClose();
      }
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !busy && !createdInstance) {
      setSubmitError(null);
      onClose();
    }
    // Once we're in diagnostics phase the user must click "Open sandbox"
    // (or "Cancel & view later"); the dialog refuses backdrop-clicks so
    // they don't accidentally dismiss diagnostics mid-boot.
  };

  const finishDiagnostics = () => {
    if (createdInstance && readyDiag && onReady) {
      onReady(createdInstance, readyDiag);
    }
    setCreatedInstance(null);
    setReadyDiag(null);
    onClose();
  };

  const cancelDiagnostics = () => {
    setCreatedInstance(null);
    setReadyDiag(null);
    onClose();
  };

  // Diagnostics phase — show readiness panel until overall_ok=true,
  // then enable "Open sandbox" so the user proceeds with verified state.
  if (createdInstance) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {readyDiag?.overall_ok ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              {readyDiag?.overall_ok ? "Sandbox ready" : "Booting sandbox…"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground font-mono">
              {createdInstance.sandbox_id}
            </div>
            <SandboxDiagnosticsPanel
              sandboxId={createdInstance.id}
              showLogs
              onReady={(diag) => setReadyDiag(diag)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDiagnostics}>
              Cancel &amp; view later
            </Button>
            <Button
              onClick={finishDiagnostics}
              disabled={!readyDiag?.overall_ok}
            >
              {readyDiag?.overall_ok ? "Open sandbox" : "Waiting for ready…"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New sandbox</DialogTitle>
        </DialogHeader>

        <CreateSandboxFormFields
          form={form}
          disabled={busy}
          submitError={submitError}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ttl-minutes" className="text-sm font-medium">
              TTL (minutes)
            </Label>
            <BasicInput
              id="ttl-minutes"
              type="number"
              min={1}
              max={60 * 24}
              value={ttlMinutes}
              onChange={(e) =>
                setTtlMinutes(
                  e.target.value === "" ? "" : Number(e.target.value),
                )
              }
              disabled={busy}
              className="w-32"
            />
          </div>

          {tier === "hosted" && (
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="resources-enabled"
                  checked={resources.enabled}
                  onCheckedChange={(checked) =>
                    setResources((prev) => ({
                      ...prev,
                      enabled: checked === true,
                    }))
                  }
                  disabled={busy}
                />
                <Label
                  htmlFor="resources-enabled"
                  className="text-sm font-medium"
                >
                  Override resources
                </Label>
              </div>
              {resources.enabled && (
                <div className="grid grid-cols-3 gap-2">
                  <ResourceField
                    id="cpu"
                    label="CPU"
                    min={1}
                    value={resources.cpu}
                    onChange={(value) =>
                      setResources((prev) => ({ ...prev, cpu: value }))
                    }
                    disabled={busy}
                  />
                  <ResourceField
                    id="memory-mb"
                    label="Memory MB"
                    min={256}
                    value={resources.memoryMb}
                    onChange={(value) =>
                      setResources((prev) => ({ ...prev, memoryMb: value }))
                    }
                    disabled={busy}
                  />
                  <ResourceField
                    id="disk-mb"
                    label="Disk MB"
                    min={512}
                    value={resources.diskMb}
                    onChange={(value) =>
                      setResources((prev) => ({ ...prev, diskMb: value }))
                    }
                    disabled={busy}
                  />
                </div>
              )}
            </div>
          )}
        </CreateSandboxFormFields>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || form.loadingTemplates}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface ResourceFieldProps {
  id: string;
  label: string;
  min: number;
  value: number | "";
  onChange: (value: number | "") => void;
  disabled?: boolean;
}

const ResourceField: React.FC<ResourceFieldProps> = ({
  id,
  label,
  min,
  value,
  onChange,
  disabled,
}) => (
  <div className="space-y-1">
    <Label htmlFor={id} className="text-xs text-muted-foreground">
      {label}
    </Label>
    <BasicInput
      id={id}
      type="number"
      min={min}
      value={value}
      onChange={(e) =>
        onChange(e.target.value === "" ? "" : Number(e.target.value))
      }
      disabled={disabled}
      className="h-8"
    />
  </div>
);
