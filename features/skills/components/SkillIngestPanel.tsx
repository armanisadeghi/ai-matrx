"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FolderSearch,
  Loader2,
  Play,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkillsIngest } from "../hooks/useSkillsIngest";

interface SkillIngestPanelProps {
  onBack: () => void;
}

/** Admin-only filesystem ingest. Takes one or more absolute paths (each
 * can be a leaf skills directory OR a repo root — the server auto-walks
 * the six conventional `<repo>/.X/skills` locations), shows a dry-run
 * preview, and applies on confirm. */
export function SkillIngestPanel({ onBack }: SkillIngestPanelProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { report, status, error, preview, apply, reset, appliedAt } =
    useSkillsIngest();

  const [pathsText, setPathsText] = useState("");

  const roots = useMemo(
    () =>
      pathsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("#")),
    [pathsText],
  );

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header onBack={onBack} />
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Filesystem ingest is admin-only.
        </div>
      </div>
    );
  }

  const doPreview = async () => {
    if (roots.length === 0) {
      toast.error("Enter at least one path to scan.");
      return;
    }
    await preview(roots);
  };

  const doApply = async () => {
    if (roots.length === 0) {
      toast.error("Enter at least one path to scan.");
      return;
    }
    const result = await apply(roots);
    if (result) {
      const { created, updated, unchanged, errors } = result;
      if (errors.length > 0) {
        toast.error(
          `Ingest finished with ${errors.length} error${errors.length === 1 ? "" : "s"} — see report.`,
        );
      } else {
        toast.success(
          `Ingested: ${created} new, ${updated} updated, ${unchanged} unchanged.`,
        );
      }
    }
  };

  const loading = status === "loading";
  const hasReport = report !== null;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header onBack={onBack} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Paths to scan
            </div>
            <Textarea
              value={pathsText}
              onChange={(e) => setPathsText(e.target.value)}
              rows={5}
              placeholder={
                "/Users/me/code/some-repo\n/Users/me/code/another-repo/.claude/skills\n# comments allowed"
              }
              className="font-mono text-xs"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground/80">
              One path per line. Each can be a repo root (the walker
              auto-finds `.claude/skills`, `.cursor/skills`,
              `.agent/skills`, `.agents/skills`, `.matrx/skills`, and
              `skills/` inside it) OR a leaf skills directory.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={doPreview}
              disabled={loading || roots.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium",
                "bg-background border border-border text-foreground",
                "hover:bg-accent transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderSearch className="h-3.5 w-3.5" />
              )}
              Dry run
            </button>
            <button
              type="button"
              onClick={doApply}
              disabled={loading || roots.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium",
                "bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Apply
            </button>
            {hasReport && (
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm",
                  "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                )}
              >
                Reset
              </button>
            )}
            <Badge variant="outline" className="font-normal">
              {roots.length} path{roots.length === 1 ? "" : "s"}
            </Badge>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {hasReport && report && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Parsed" value={report.parsed} />
                <Stat
                  label="Created"
                  value={report.created}
                  tone={report.created > 0 ? "positive" : "muted"}
                />
                <Stat
                  label="Updated"
                  value={report.updated}
                  tone={report.updated > 0 ? "info" : "muted"}
                />
                <Stat label="Unchanged" value={report.unchanged} tone="muted" />
              </div>

              {report.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    {report.errors.length} error
                    {report.errors.length === 1 ? "" : "s"}
                  </div>
                  <ul className="text-xs font-mono text-destructive/90 space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
                    {report.errors.map((e, i) => (
                      <li key={i} className="break-all">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.roots.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Roots visited
                  </div>
                  <ul className="text-xs font-mono text-muted-foreground space-y-0.5">
                    {report.roots.map((r) => (
                      <li key={r} className="break-all">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.skills.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Skills (
                    {appliedAt ? "applied" : "dry run preview"})
                  </div>
                  <ul className="text-xs space-y-0.5 max-h-64 overflow-y-auto scrollbar-thin">
                    {report.skills.map((s) => (
                      <li
                        key={s.skillId}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <CheckCircle2 className="h-3 w-3 text-emerald-500/80 shrink-0" />
                        <span className="font-mono text-foreground">
                          {s.skillId}
                        </span>
                        <span className="text-muted-foreground/70 truncate">
                          {s.sourcePath}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/60">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">
          Filesystem ingest
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "positive" | "info";
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "positive" && "text-emerald-500",
          tone === "info" && "text-sky-500",
          tone === "muted" && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
