"use client";

/**
 * Create a topic, or change its name / type / description.
 *
 * The type picker is the load-bearing control on this screen: it is what
 * decides whether every keyword beneath this node can ever become money. So it
 * is written as ten sentences about the business (types.ts ROOT_TYPE_META),
 * grouped into the two groups that actually matter, and the consequence of the
 * current choice is restated under the picker in plain words.
 */

import { useState } from "react";
import { BadgeDollarSign, Landmark, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import { ROOT_TYPE_META, rootTypeMeta } from "./types";

export interface TopicEditDraft {
  topicId: string | null;
  name: string;
  nodeType: string;
  description: string;
  /** Only used when creating: the parent this new node lands under. */
  parentId: string | null;
  parentName: string | null;
}

export function TopicEditDialog({
  draft,
  busy,
  onCancel,
  onSave,
}: {
  draft: TopicEditDraft;
  busy: boolean;
  onCancel: () => void;
  onSave: (values: { name: string; nodeType: string; description: string }) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [nodeType, setNodeType] = useState(draft.nodeType);
  const [description, setDescription] = useState(draft.description);
  const creating = draft.topicId === null;
  const meta = rootTypeMeta(nodeType);
  const offering = ROOT_TYPE_META.filter((entry) => entry.offering);
  const authority = ROOT_TYPE_META.filter((entry) => !entry.offering);

  return (
    <Dialog open onOpenChange={(open) => (!open ? onCancel() : undefined)}>
      <DialogContent className="flex max-h-[85dvh] max-w-lg flex-col overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-base">
            {creating ? "New topic" : "Edit topic"}
          </DialogTitle>
          <DialogDescription>
            {creating && draft.parentName
              ? `It will sit under “${draft.parentName}”.`
              : creating
                ? "It will start as a root — the top of its own branch."
                : "Topics are shared across every site. Only the worth you set is per-site."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="topic-name" className="text-xs">
              Name
            </Label>
            <Input
              id="topic-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Hard Drive Shredding"
              className="h-9"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">What is this?</Label>
            <div className="grid gap-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                <BadgeDollarSign className="h-3 w-3" />
                Traffic here can become money
              </p>
              {offering.map((entry) => (
                <TypeOption
                  key={entry.value}
                  entry={entry}
                  selected={nodeType === entry.value}
                  onSelect={() => setNodeType(entry.value)}
                />
              ))}
              <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-info">
                <Landmark className="h-3 w-3" />
                Traffic here can never become money
              </p>
              {authority.map((entry) => (
                <TypeOption
                  key={entry.value}
                  entry={entry}
                  selected={nodeType === entry.value}
                  onSelect={() => setNodeType(entry.value)}
                />
              ))}
            </div>
            <p
              className={cn(
                "rounded border px-2 py-1.5 text-[11px] leading-snug",
                meta.offering
                  ? "border-success/40 bg-success/5 text-success"
                  : "border-info/40 bg-info/5 text-info",
              )}
            >
              {meta.meaning}
              {creating && draft.parentName
                ? " This only decides the branch's own type — a keyword's money-or-authority verdict comes from the topmost parent of its branch."
                : ""}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="topic-description" className="text-xs">
              Notes (optional)
            </Label>
            <Textarea
              id="topic-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What belongs under this, in your own words."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), nodeType, description })}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {creating ? "Create topic" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeOption({
  entry,
  selected,
  onSelect,
}: {
  entry: (typeof ROOT_TYPE_META)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "rounded border px-2 py-1.5 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/60",
      )}
    >
      <span className="block">{entry.label}</span>
      <span className="block text-[11px] leading-snug text-muted-foreground">
        {entry.meaning}
      </span>
    </button>
  );
}
