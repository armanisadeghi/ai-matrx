"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Database,
  ExternalLink,
  FolderSearch,
  Info,
  Loader2,
  PencilLine,
  Play,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkillsIngest } from "../hooks/useSkillsIngest";
import { useSkillCategories } from "../hooks/useSkillCategories";
import type { IngestSkillStatus } from "../types";

interface SkillIngestPanelProps {
  onBack: () => void;
  /** Open a just-ingested skill in the registry editor. Receives the
   * skill's business key (`skill_id`) — `useSkill` resolves either that
   * or a UUID. Omit to hide the "View" action (e.g. no host surface to
   * navigate within). */
  onViewSkill?: (skillId: string) => void;
}

/** Admin-only filesystem ingest. Takes one or more absolute paths (each
 * can be a leaf skills directory OR a repo root — the server auto-walks
 * the six conventional `<repo>/.X/skills` locations), shows a dry-run
 * preview, and applies on confirm. */
export function SkillIngestPanel({ onBack, onViewSkill }: SkillIngestPanelProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { report, status, error, preview, apply, reset, appliedAt } =
    useSkillsIngest();
  const { categories } = useSkillCategories();

  const categoryLabelByKey = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.categoryKey] = c.label;
    return map;
  }, [categories]);

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

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              Where this goes
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each <span className="font-mono text-foreground/90">SKILL.md</span>{" "}
              is parsed and upserted into the platform skill registry
              (<span className="font-mono text-foreground/90">skill.definition</span>
              ), flagged <span className="font-mono text-foreground/90">is_system = true</span>.
              Matching is by <span className="font-mono text-foreground/90">skill_id</span>{" "}
              (folder or file name, or a frontmatter <span className="font-mono text-foreground/90">name:</span>{" "}
              override) — same id twice re-uses the row: unchanged body ⇒ skipped, changed
              body ⇒ updated in place, new id ⇒ created. A frontmatter{" "}
              <span className="font-mono text-foreground/90">category:</span> slug files it
              under that category; no match leaves it uncategorized. Once applied, every
              skill is immediately visible platform-wide in the{" "}
              <span className="font-medium text-foreground/90">Agent Skills Registry</span> —
              use "Dry run" first to preview with nothing written.
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Skills ({appliedAt ? "written to skill.definition" : "dry run preview — nothing written"})
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Database className="h-3 w-3" />
                      skill.definition
                    </div>
                  </div>
                  <ul className="text-xs divide-y divide-border/50 rounded-md border border-border/60 overflow-hidden">
                    {report.skills.map((s) => (
                      <li
                        key={s.skillId}
                        className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/40"
                      >
                        <IngestStatusIcon status={s.status} />
                        <span className="font-mono text-foreground shrink-0">
                          {s.skillId}
                        </span>
                        <IngestStatusBadge status={s.status} />
                        {s.category && (
                          <Badge
                            variant="outline"
                            className="font-normal text-[10px] px-1.5 py-0 shrink-0"
                          >
                            {categoryLabelByKey[s.category] ?? s.category}
                          </Badge>
                        )}
                        <span className="text-muted-foreground/70 truncate flex-1">
                          {s.sourcePath}
                        </span>
                        {onViewSkill &&
                          (s.status === "created" ||
                            s.status === "updated" ||
                            s.status === "unchanged") && (
                            <button
                              type="button"
                              onClick={() => onViewSkill(s.skillId)}
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
                            >
                              View
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
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
        <div>
          <div className="text-sm font-semibold text-foreground leading-tight">
            Filesystem ingest
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground leading-tight">
            <ShieldCheck className="h-3 w-3" />
            System skills · platform-wide visibility
          </div>
        </div>
      </div>
    </div>
  );
}

function IngestStatusIcon({ status }: { status: IngestSkillStatus }) {
  switch (status) {
    case "created":
      return <CheckCircle2 className="h-3 w-3 text-emerald-500/80 shrink-0" />;
    case "updated":
      return <PencilLine className="h-3 w-3 text-sky-500/80 shrink-0" />;
    case "unchanged":
      return <CircleDot className="h-3 w-3 text-muted-foreground/60 shrink-0" />;
    case "error":
      return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
    case "pending":
    default:
      return <CircleDot className="h-3 w-3 text-muted-foreground/40 shrink-0" />;
  }
}

function IngestStatusBadge({ status }: { status: IngestSkillStatus }) {
  const label =
    status === "pending"
      ? "would apply"
      : status === "created"
        ? "new"
        : status;
  const tone =
    status === "created"
      ? "text-emerald-600 border-emerald-500/40 bg-emerald-500/10"
      : status === "updated"
        ? "text-sky-600 border-sky-500/40 bg-sky-500/10"
        : status === "error"
          ? "text-destructive border-destructive/40 bg-destructive/10"
          : "text-muted-foreground border-border bg-muted/40";
  return (
    <span
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0",
        tone,
      )}
    >
      {label}
    </span>
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
