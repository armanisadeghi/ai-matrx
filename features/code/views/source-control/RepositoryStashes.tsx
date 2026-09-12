"use client";

import { useEffect, useRef, useState } from "react";
import { ArchiveRestore, ArchiveX, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ProcessAdapter } from "../../adapters/ProcessAdapter";
import { executeRepositoryGit } from "./repositoryService";

const MANUAL_STASH_MESSAGE = "Matrx saved changes";

export interface RepositoryStash {
  reference: string;
  createdAt: number | null;
  message: string;
}

/** Parses the NUL-delimited stash format emitted by `listRepositoryStashes`.
 * Stash subjects cannot contain newlines, so each line represents one ref. */
export function parseRepositoryStashes(output: string): RepositoryStash[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [reference = "", timestamp = "", message = ""] = line.split("\0");
      const seconds = Number(timestamp);
      return {
        reference,
        createdAt: Number.isFinite(seconds) ? seconds * 1000 : null,
        message,
      };
    })
    .filter((stash) => stash.reference.startsWith("stash@{"));
}

/** Lists every local stash, including recovery stashes created by Matrx. */
export async function listRepositoryStashes(
  process: ProcessAdapter,
  cwd: string,
): Promise<RepositoryStash[]> {
  const result = await executeRepositoryGit(process, cwd, [
    "stash",
    "list",
    "--format=%gd%x00%ct%x00%s",
  ]);
  return parseRepositoryStashes(result.stdout);
}

export function createRepositoryStash(process: ProcessAdapter, cwd: string) {
  return executeRepositoryGit(process, cwd, [
    "stash",
    "push",
    "--include-untracked",
    "--message",
    MANUAL_STASH_MESSAGE,
  ]);
}

/** Applies a stash without dropping it and preserves its staged entries. */
export function applyRepositoryStash(
  process: ProcessAdapter,
  cwd: string,
  reference: string,
) {
  return executeRepositoryGit(process, cwd, ["stash", "apply", "--index", reference]);
}

export function dropRepositoryStash(
  process: ProcessAdapter,
  cwd: string,
  reference: string,
) {
  return executeRepositoryGit(process, cwd, ["stash", "drop", reference]);
}

export interface RepositoryStashesProps {
  process: ProcessAdapter;
  cwd: string;
  disabled: boolean;
  /** Bump after parent-owned mutations so stale reads never repaint. */
  revision: number;
  /** Parent owns cross-panel operation locking, errors, and repository refresh. */
  onMutate(
    action: () => Promise<void>,
    success?: string,
  ): Promise<void>;
}

/** Recovery controls for local Git stashes. Applying intentionally keeps the
 * stash until the user explicitly discards it. */
export function RepositoryStashes({
  process,
  cwd,
  disabled,
  revision,
  onMutate,
}: RepositoryStashesProps) {
  const [stashes, setStashes] = useState<RepositoryStash[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<RepositoryStash | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const ticket = ++generation.current;
    setLoading(true);
    setError(null);
    void listRepositoryStashes(process, cwd)
      .then((next) => {
        if (ticket === generation.current) setStashes(next);
      })
      .catch((cause) => {
        if (ticket === generation.current) {
          setError(cause instanceof Error ? cause.message : "Unable to load saved changes.");
          setStashes([]);
        }
      })
      .finally(() => {
        if (ticket === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [cwd, process, revision]);

  const mutate = async (action: () => Promise<void>, success: string) => {
    setError(null);
    try {
      await onMutate(action, success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Git operation failed.");
    }
  };

  return (
    <section className="border-t p-2" aria-label="Saved changes">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold">Saved changes</h3>
          <p className="text-[11px] text-muted-foreground">
            Applying keeps a copy until you discard it.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || loading}
          onClick={() =>
            void mutate(
              () => createRepositoryStash(process, cwd).then(() => undefined),
              "Saved current changes, including untracked files.",
            )
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Save changes
        </Button>
      </div>
      {loading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading saved changes…
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {!loading && !error && stashes.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">No saved changes.</p>
      )}
      {stashes.map((stash) => (
        <div key={stash.reference} className="mt-2 rounded border px-2 py-1.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-[11px]">{stash.reference}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {stash.message || "Saved changes"}
              {stash.createdAt ? ` · ${new Date(stash.createdAt).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="mt-1.5 flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={disabled || loading}
              onClick={() =>
                void mutate(
                  () => applyRepositoryStash(process, cwd, stash.reference).then(() => undefined),
                  "Applied saved changes. The saved copy is still available.",
                )
              }
            >
              <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Apply
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || loading}
              onClick={() => setDropTarget(stash)}
            >
              <ArchiveX className="mr-1 h-3.5 w-3.5" /> Discard
            </Button>
          </div>
        </div>
      ))}
      <ConfirmDialog
        open={dropTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDropTarget(null);
        }}
        title="Discard saved changes?"
        description="This permanently removes this local stash. Apply it first if you need these files."
        confirmLabel="Discard saved changes"
        onConfirm={() => {
          const target = dropTarget;
          setDropTarget(null);
          if (target) {
            void mutate(
              () => dropRepositoryStash(process, cwd, target.reference).then(() => undefined),
              "Discarded saved changes.",
            );
          }
        }}
      />
    </section>
  );
}
