"use client";

/**
 * One arm's setup card: pick the workflow, pin the version, name the arm.
 * The pieces the platform doesn't have yet (a workflow picker, a version
 * picker) live here; everything downstream reuses canonical components.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";

import {
  listWorkflowVersions,
  searchWorkflows,
  type VersionChoice,
  type WorkflowChoice,
} from "../service";
import type { ArmDraft } from "../types";

export function ArmSetupCard({
  draft,
  onChange,
  onRemove,
  removable,
}: {
  draft: ArmDraft;
  onChange: (next: ArmDraft) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <Input
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="Arm name"
          className="h-8 text-sm font-medium"
        />
        {removable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onRemove}
            aria-label="Remove arm"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <WorkflowSelect draft={draft} onChange={onChange} />
      {draft.definitionId && <VersionSelect draft={draft} onChange={onChange} />}
    </div>
  );
}

function WorkflowSelect({
  draft,
  onChange,
}: {
  draft: ArmDraft;
  onChange: (next: ArmDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [choices, setChoices] = useState<WorkflowChoice[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const results = await searchWorkflows(query);
          if (live) setChoices(results);
        } catch (err) {
          if (live) toast.error(err instanceof Error ? err.message : String(err));
        } finally {
          if (live) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-sm hover:bg-accent/50"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {draft.definitionName ?? "Choose a workflow…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workflows…"
            className="h-8 rounded-b-none border-0 border-b border-border text-sm"
          />
          <div className="max-h-56 overflow-y-auto p-1">
            {loading && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Searching…
              </div>
            )}
            {!loading && choices.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No workflows match.
              </div>
            )}
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange({
                    ...draft,
                    definitionId: c.id,
                    definitionName: c.name,
                    versionNumber: null,
                    latestVersion: c.version,
                    label:
                      draft.label.trim() === "" ||
                      draft.label.startsWith("Arm ")
                        ? c.name
                        : draft.label,
                  });
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <div className="truncate font-medium">{c.name}</div>
                {c.description && (
                  <div className="truncate text-xs text-muted-foreground">
                    {c.description}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VersionSelect({
  draft,
  onChange,
}: {
  draft: ArmDraft;
  onChange: (next: ArmDraft) => void;
}) {
  const [versions, setVersions] = useState<VersionChoice[] | null>(null);

  useEffect(() => {
    if (!draft.definitionId) return;
    let live = true;
    void (async () => {
      try {
        const result = await listWorkflowVersions(draft.definitionId!);
        if (live) setVersions(result);
      } catch {
        // Version pinning is optional — current-version arms still work.
        if (live) setVersions([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [draft.definitionId]);

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="shrink-0">Version</span>
      <select
        value={draft.versionNumber === null ? "current" : String(draft.versionNumber)}
        onChange={(e) =>
          onChange({
            ...draft,
            versionNumber:
              e.target.value === "current" ? null : Number(e.target.value),
          })
        }
        className="h-7 flex-1 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
      >
        <option value="current">
          Current{draft.latestVersion ? ` (v${draft.latestVersion})` : ""}
        </option>
        {(versions ?? []).map((v) => (
          <option key={v.versionNumber} value={String(v.versionNumber)}>
            v{v.versionNumber}
            {v.changeNote ? ` — ${v.changeNote.slice(0, 40)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
