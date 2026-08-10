"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createDraftPack } from "../../service";

/**
 * "New pack" — name + what it's about + where the knowledge comes from.
 * Creates an empty DRAFT pack the expert then fills in on the detail page
 * (by hand, by interview, or by ingesting a source). Plain language only.
 */
export function NewPackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give the pack a name first.");
      return;
    }
    if (!organizationId) {
      toast.error(
        "Your workspace is still loading — try again in a moment.",
      );
      return;
    }
    setSaving(true);
    try {
      const pack = await createDraftPack({
        name: name.trim(),
        description: description.trim(),
        source: {
          author: author.trim() || undefined,
          title: sourceTitle.trim() || undefined,
        },
        organizationId,
      });
      toast.success(`"${pack.name}" created as a draft`);
      onOpenChange(false);
      startTransition(() => router.push(`/expertise/${pack.id}`));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the pack",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New expertise pack</DialogTitle>
          <DialogDescription>
            A pack is one expert&apos;s rulebook. Start it empty — you add the
            rules next, one at a time or from a source document.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pack-name">Name</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Our SEO Keyword Method"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pack-desc">What is this expertise about?</Label>
            <Textarea
              id="pack-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One or two sentences on what these rules cover and when to use them."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pack-author">Whose expertise?</Label>
              <Input
                id="pack-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="The expert's name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pack-source">Source (optional)</Label>
              <Input
                id="pack-source"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="Book, playbook, method…"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={saving}>
            {saving ? "Creating…" : "Create draft pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
