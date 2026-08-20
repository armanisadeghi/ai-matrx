"use client";

// Create/edit dialog for one taxonomy node. Writes via public.admin_taxonomy_upsert.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { TaxonomyLevel, TaxonomyRow, TaxonomyStatus } from "./types";

export interface NodeDialogState {
  mode: "create" | "edit";
  node?: TaxonomyRow;
  /** For create: preselected parent + level. */
  parentId?: string | null;
  level?: TaxonomyLevel;
}

interface NodeDialogProps {
  state: NodeDialogState | null;
  rows: TaxonomyRow[];
  onClose: () => void;
  onSaved: () => void;
}

export default function NodeDialog({ state, rows, onClose, onSaved }: NodeDialogProps) {
  const { toast } = useToast();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState<TaxonomyLevel>("feature");
  const [parentId, setParentId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaxonomyStatus>("proposed");
  const [docsPath, setDocsPath] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.mode === "edit" && state.node) {
      setSlug(state.node.slug);
      setName(state.node.name);
      setLevel(state.node.level);
      setParentId(state.node.parent_id);
      setStatus(state.node.status);
      setDocsPath(state.node.docs_path ?? "");
      setNotes(state.node.notes ?? "");
    } else {
      setSlug("");
      setName("");
      setLevel(state.level ?? "feature");
      setParentId(state.parentId ?? null);
      setStatus("proposed");
      setDocsPath("");
      setNotes("");
    }
  }, [state]);

  const parentOptions = useMemo(() => {
    const wanted: TaxonomyLevel | null =
      level === "feature" ? "domain" : level === "subfeature" ? "feature" : null;
    if (!wanted) return [];
    return rows
      .filter((row) => row.level === wanted && row.id !== state?.node?.id)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }, [rows, level, state]);

  const save = async () => {
    const cleanSlug = slug.trim().toLowerCase();
    if (!cleanSlug || !name.trim()) {
      toast({ title: "Slug and name are required", variant: "destructive" });
      return;
    }
    if (level !== "domain" && !parentId) {
      toast({ title: "A parent is required — nothing floats (the no-orphans law)", variant: "destructive" });
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_taxonomy_upsert", {
      p_id: state?.mode === "edit" ? state.node?.id : undefined,
      p_slug: cleanSlug,
      p_name: name.trim(),
      p_level: level,
      p_parent_id: level === "domain" ? undefined : (parentId ?? undefined),
      p_status: status,
      p_docs_path: docsPath.trim() || undefined,
      p_notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: state?.mode === "edit" ? "Node updated" : "Node created" });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state?.mode === "edit" ? `Edit ${state.node?.name}` : "New node"}
          </DialogTitle>
          <DialogDescription>
            {state?.mode === "edit"
              ? "Changes write straight to platform.taxonomy_node."
              : "New nodes start as Proposed; ratifying to Canonical is Arman's call."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tax-slug">Slug</Label>
              <Input
                id="tax-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="fastfire"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax-name">Name</Label>
              <Input
                id="tax-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="FastFire"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Level</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as TaxonomyLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="feature">Feature</SelectItem>
                  <SelectItem value="subfeature">Sub-feature</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TaxonomyStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposed">Proposed</SelectItem>
                  <SelectItem value="canonical">Canonical</SelectItem>
                  <SelectItem value="legacy">Legacy</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {level !== "domain" && (
            <div className="grid gap-1.5">
              <Label>Parent {level === "feature" ? "domain" : "feature"}</Label>
              <Select
                value={parentId ?? ""}
                onValueChange={(v) => setParentId(v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a parent" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {option.slug}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="tax-docs">Docs path</Label>
            <Input
              id="tax-docs"
              value={docsPath}
              onChange={(e) => setDocsPath(e.target.value)}
              placeholder="systems/education/flashcards/"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tax-notes">Notes</Label>
            <Textarea
              id="tax-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
