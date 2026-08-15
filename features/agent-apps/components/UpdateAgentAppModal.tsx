"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  agentAppAdminKpis,
  agentAppMetadataFormAgentPayload,
  agentAppMetadataFormHuman,
  type AgentAppFieldDraft,
  type AgentAppKpis,
  type AgentAppMetadataFormView,
} from "@/features/agent-apps/format";
import type { AgentApp, AppStatus, UpdateAgentAppInput } from "../types";

interface UpdateAgentAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: AgentApp;
  onSubmit: (id: string, input: UpdateAgentAppInput) => Promise<void>;
  /**
   * The KPI strip of the page this dialog opened on top of, so the copied
   * payload carries the same leading numbers the user can see behind it.
   * Defaults to the admin Analytics-card formatting (its only caller today).
   */
  kpis?: AgentAppKpis;
}

export function UpdateAgentAppModal({
  open,
  onOpenChange,
  app,
  onSubmit,
  kpis,
}: UpdateAgentAppModalProps) {
  const isMobile = useIsMobile();

  const [name, setName] = useState(app.name);
  const [tagline, setTagline] = useState(app.tagline ?? "");
  const [description, setDescription] = useState(app.description ?? "");
  const [status, setStatus] = useState<AppStatus>(app.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSubmit(app.id, {
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        status,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update app");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="update-name">Name</Label>
        <Input
          id="update-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-[16px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="update-tagline">Tagline</Label>
        <Input
          id="update-tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          className="text-[16px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="update-description">Description</Label>
        <Textarea
          id="update-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-[16px] min-h-20"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="update-status">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as AppStatus)}>
          <SelectTrigger id="update-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );

  // The dialog IS the payload: these four inputs are the only place this app's
  // metadata is being edited, and `error` is the red sentence rendered under
  // them. Resolved at click time so the copy is the live draft, never `app`.
  const buildFormView = (): AgentAppMetadataFormView => {
    const drafts: AgentAppFieldDraft[] = [
      { field: "name", label: "Name", live: name, saved: app.name },
      {
        field: "tagline",
        label: "Tagline",
        live: tagline,
        saved: app.tagline ?? "",
      },
      {
        field: "description",
        label: "Description",
        live: description,
        saved: app.description ?? "",
      },
      { field: "status", label: "Status", live: status, saved: app.status },
    ];
    return {
      app,
      drafts,
      saving,
      error,
      kpis: kpis ?? agentAppAdminKpis(app),
    };
  };

  const footer = (
    <>
      <CopyButtons
        size="sm"
        className="mr-auto"
        label={`${app.name} metadata form`}
        human={() => agentAppMetadataFormHuman(buildFormView())}
        agent={() => agentAppMetadataFormAgentPayload(buildFormView())}
        agentVariant={{
          label: "This form",
          hint: "Live dialog values, unsaved diff, and any error shown",
          position: "first",
        }}
      />
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleSubmit} disabled={saving}>
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving…
          </>
        ) : (
          "Save Changes"
        )}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>Update Agent App</DrawerTitle>
            <DrawerDescription>
              Edit the metadata for this agent app.
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-4 overflow-auto">{body}</div>
          <DrawerFooter className="pb-safe">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Update Agent App</DialogTitle>
          <DialogDescription>
            Edit the metadata for this agent app.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
