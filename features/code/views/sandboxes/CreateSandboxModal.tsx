"use client";

import React, { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BasicInput } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { extractErrorMessage } from "@/utils/errors";
import type { SandboxCreateRequest } from "@/types/sandbox";

import { CreateSandboxFormFields } from "./CreateSandboxFormFields";
import { useSandboxCreate } from "./useSandboxCreate";

interface CreateSandboxModalProps {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  /** Starts parent-owned creation after this form has closed. */
  onCreate: (request: SandboxCreateRequest) => void;
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
}) => {
  const form = useSandboxCreate({ enabled: open });
  const { resources, setResources, persistChoices, buildRequest, tier } = form;

  const [ttlMinutes, setTtlMinutes] = useState<number | "">(60);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submit = () => {
    setSubmitError(null);
    try {
      persistChoices();
      const ttlSeconds =
        typeof ttlMinutes === "number" && ttlMinutes > 0
          ? ttlMinutes * 60
          : undefined;
      // Snapshot every choice before closing. The parent owns the long POST
      // and its honest outcome; this dialog must never become a boot monitor.
      const request = buildRequest({ ttlSeconds });
      onClose();
      onCreate(request);
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSubmitError(null);
      onClose();
    }
  };

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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
