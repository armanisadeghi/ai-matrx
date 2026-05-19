// components/admin/markdown-tester/SampleEditor.tsx
// Dialog for creating or editing a saved markdown sample. Fields:
// name, description, detected_blocks tag list (auto-detected via V2
// parser). Content itself comes from the parent's current textarea —
// the dialog never edits content directly, so name/description/tags
// can be modified without touching the working buffer.
//
// Form state lives on the inner SampleEditorForm component, which is
// keyed so opening the dialog with new initial values gives it a fresh
// mount (and a fresh useState initializer) without an effect that would
// trigger cascading renders.

"use client";

import React, { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/features/notes/components/TagInput";
import { detectRenderBlocks } from "./utils/detect-render-blocks";

export interface SampleEditorInitialValues {
  name: string;
  description: string;
  detectedBlocks: string[];
  content: string;
}

export interface SampleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "create" shows "Save sample"; "edit" shows "Save changes". */
  mode: "create" | "edit";
  initial: SampleEditorInitialValues;
  /** Identity for the open session — when this changes the form remounts. */
  sessionKey?: string;
  busy?: boolean;
  onConfirm: (values: {
    name: string;
    description: string;
    detectedBlocks: string[];
  }) => void | Promise<void>;
}

interface SampleEditorFormProps {
  mode: "create" | "edit";
  initial: SampleEditorInitialValues;
  busy: boolean;
  onCancel: () => void;
  onConfirm: SampleEditorProps["onConfirm"];
}

function SampleEditorForm({
  mode,
  initial,
  busy,
  onConfirm,
}: Omit<SampleEditorFormProps, "onCancel">) {
  // useState initializers run once per mount; SampleEditor keys this
  // component so a new open session always gets a fresh mount.
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [detectedBlocks, setDetectedBlocks] = useState<string[]>(() => {
    if (mode === "create" && initial.detectedBlocks.length === 0) {
      return detectRenderBlocks(initial.content);
    }
    return initial.detectedBlocks;
  });
  const [error, setError] = useState<string | null>(null);

  const handleAutoDetect = () => {
    setDetectedBlocks(detectRenderBlocks(initial.content));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    await onConfirm({
      name: trimmed,
      description: description.trim(),
      detectedBlocks,
    });
  };

  return (
    <form id="sample-editor-form" onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="sample-name" className="text-xs">
          Name
        </Label>
        <Input
          id="sample-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="e.g. Mixed code + table"
          disabled={busy}
          className="text-base"
          aria-invalid={!!error}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="sample-description" className="text-xs">
          Description
        </Label>
        <Textarea
          id="sample-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this sample for? Which edge cases does it cover?"
          disabled={busy}
          className="text-base min-h-[64px]"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Detected blocks</Label>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleAutoDetect}
            disabled={busy || !initial.content.trim()}
            className="h-6 px-2 text-xs"
          >
            <ScanLine className="h-3 w-3 mr-1" />
            Auto-detect
          </Button>
        </div>
        <div className="rounded-md border border-border px-2 py-1.5 min-h-9 bg-muted/30">
          {detectedBlocks.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No blocks detected. Click Auto-detect to scan the current
              content, or add tags manually.
            </span>
          ) : (
            <TagInput tags={detectedBlocks} onChange={setDetectedBlocks} />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Auto-filled from the V2 splitter. Edit freely — the tag list is a
          human-curated hint, not a generated artifact.
        </p>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {initial.content.length} chars
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {initial.content.split("\n").length} lines
        </Badge>
        <span>Content comes from the current textarea.</span>
      </div>
    </form>
  );
}

export function SampleEditor({
  open,
  onOpenChange,
  mode,
  initial,
  sessionKey,
  busy = false,
  onConfirm,
}: SampleEditorProps) {
  const isMobile = useIsMobile();
  // The parent supplies a sessionKey that changes on every open() so the
  // inner form remounts and useState initializers re-run. Falling back
  // to mode-only key means re-opening with the same mode would reuse
  // the old form state — parents should always supply a session key.
  const formKey = useMemo(
    () => `${mode}:${sessionKey ?? "default"}`,
    [mode, sessionKey],
  );

  const title = mode === "create" ? "Save new sample" : "Edit sample";
  const confirmLabel =
    mode === "create" ? "Save sample" : "Save changes";

  const body = (
    <SampleEditorForm
      key={formKey}
      mode={mode}
      initial={initial}
      busy={busy}
      onConfirm={onConfirm}
    />
  );

  const buttons = (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={busy}
      >
        Cancel
      </Button>
      <Button type="submit" form="sample-editor-form" disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {confirmLabel}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>
              Test fixtures stored in the admin samples table.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2">
            {buttons}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Test fixtures stored in the admin samples table.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{buttons}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
