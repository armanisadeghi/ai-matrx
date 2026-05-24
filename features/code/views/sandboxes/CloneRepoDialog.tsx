"use client";

/**
 * CloneRepoDialog — clone a git repository into a sandbox.
 *
 * The thin UI over the existing `SandboxGitAdapter.clone()` →
 * `POST /api/sandbox/[id]/git/clone`. This is the "get their repo in there"
 * step: create/attach a slim box, clone the user's repo, then let the agent
 * code on it (via chat or autonomously). Reusable from any surface that has a
 * sandbox row id.
 */

import { useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SandboxGitAdapter } from "../../adapters/SandboxGitAdapter";

interface CloneRepoDialogProps {
  /** sandbox_instances.id to clone into. */
  instanceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the cloned path on success. */
  onCloned?: (path: string) => void;
}

/** Derive a sensible destination folder name from a repo URL. */
function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const last = cleaned.split("/").pop() ?? "";
  return last || "repo";
}

export function CloneRepoDialog({
  instanceId,
  open,
  onOpenChange,
  onCloned,
}: CloneRepoDialogProps) {
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [dest, setDest] = useState("");
  const [cloning, setCloning] = useState(false);

  const effectiveDest = dest.trim() || (url.trim() ? repoNameFromUrl(url) : "");

  const handleClone = async () => {
    if (!instanceId) {
      toast.error("No sandbox selected");
      return;
    }
    const repoUrl = url.trim();
    if (!repoUrl) {
      toast.error("Enter a repository URL");
      return;
    }
    setCloning(true);
    try {
      const adapter = new SandboxGitAdapter({ instanceId });
      const res = await adapter.clone({
        url: repoUrl,
        dest: effectiveDest,
        branch: branch.trim() || undefined,
      });
      if (!res.ok) {
        toast.error("Clone failed");
        return;
      }
      toast.success(`Cloned into ${res.path}`);
      onCloned?.(res.path);
      onOpenChange(false);
      setUrl("");
      setBranch("");
      setDest("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Clone a repository
          </DialogTitle>
          <DialogDescription>
            Clone a git repo into this sandbox so the agent can read, edit, and
            run it. Private repos use the sandbox&apos;s configured credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Repository URL
            </label>
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo.git"
              disabled={cloning}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Branch (optional)
              </label>
              <Input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                disabled={cloning}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Folder
              </label>
              <Input
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder={effectiveDest || "repo"}
                disabled={cloning}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cloning}
          >
            Cancel
          </Button>
          <Button onClick={handleClone} disabled={cloning || !url.trim()}>
            {cloning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cloning…
              </>
            ) : (
              "Clone"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
