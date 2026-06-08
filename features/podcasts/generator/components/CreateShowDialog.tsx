"use client";

// features/podcasts/generator/components/CreateShowDialog.tsx
//
// Quick-create a podcast show (series) so users can start a podcast and then
// generate episodes inside it. Writes a pc_shows row via podcastService; the
// caller receives the created show to select it immediately.

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mic } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { podcastService } from "@/features/podcasts/service";
import type { PcShow } from "@/features/podcasts/types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

interface CreateShowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (show: PcShow) => void;
}

export function CreateShowDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateShowDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setDescription("");
    setAuthor("");
    setBusy(false);
  };

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Give your podcast a name");
      return;
    }
    setBusy(true);
    try {
      // Add a short random suffix so concurrent shows with the same name don't
      // collide on the unique slug. DB trigger enforces global uniqueness.
      const suffix = Math.random().toString(36).slice(2, 7);
      const show = await podcastService.createShow({
        slug: `${slugify(trimmed) || "show"}-${suffix}`,
        title: trimmed,
        description: description.trim() || null,
        image_url: null,
        og_image_url: null,
        thumbnail_url: null,
        author: author.trim() || null,
        is_published: false,
      });
      toast.success(`Created "${show.title}"`);
      onCreated(show);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create podcast");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          if (!o) reset();
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mic className="h-4.5 w-4.5" />
            </span>
            <div>
              <DialogTitle>Start a new podcast</DialogTitle>
              <DialogDescription className="mt-0.5">
                A podcast is a series — generate episodes inside it.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="new-show-title">Podcast name</Label>
            <Input
              id="new-show-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Frontier Report"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-show-author">Host / author</Label>
            <Input
              id="new-show-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-show-desc">Description</Label>
            <Textarea
              id="new-show-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional — what's this podcast about?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create podcast
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
