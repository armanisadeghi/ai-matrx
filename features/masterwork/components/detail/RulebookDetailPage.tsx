"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  FileUp,
  Hammer,
  ChevronDown,
  ChevronRight,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RotateCcw,
  Workflow,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  getRulebook,
  listMasterworksForRulebook,
  saveRules,
  updateRulebookMeta,
} from "../../service";
import {
  SEVERITY_LABELS,
  type Masterwork,
  type Rulebook,
  type RulebookRule,
  type RuleSeverity,
  type RuleSourceRef,
} from "../../types";
import { BuildMasterworkDialog } from "./BuildMasterworkDialog";
import { IngestSourceDialog } from "./IngestSourceDialog";
import { InterviewButton, ScoutInterviewPanel } from "./ScoutInterviewPanel";
import { RuleEditorDialog, type RuleEditorResult } from "./RuleEditorDialog";

/**
 * The Expert surface: read your Rulebook, correct it, grow it. Rules are
 * grouped by section; each expands to why / how-to-spot-it / the source's own
 * words. Every save bumps the Rulebook version (Masterworks show drift
 * against it).
 */

function severityBadge(severity: RuleSeverity) {
  const cls =
    severity === "critical"
      ? "border-destructive/50 text-destructive"
      : severity === "major"
        ? "border-primary/40 text-primary"
        : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${cls}`}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

/** Format `[11, 12, 13, 20]` as "pages 11-13, 20". */
function formatPages(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const groups: string[] = [];
  let start = sorted[0];
  let prev = start;
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    groups.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  groups.push(start === prev ? `${start}` : `${start}-${prev}`);
  return `${sorted.length === 1 ? "page" : "pages"} ${groups.join(", ")}`;
}

/**
 * Where a rule came from — and THE DOOR back to it. Every id we can resolve is
 * rendered AND linked: the uploaded document opens in the file viewer, the
 * extraction that read it opens in the extraction workspace. A rule whose
 * quote could not be machine-verified says so here, because that is the one
 * thing the Expert must check by eye.
 */
function RuleProvenance({ sourceRef }: { sourceRef: RuleSourceRef }) {
  const pages = sourceRef.source_pages?.length
    ? formatPages(sourceRef.source_pages)
    : sourceRef.pages
      ? `page ${sourceRef.pages}`
      : null;
  const label = sourceRef.note ?? (sourceRef.interview ? "your interview" : "ingested");

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>From the source:</span>
        {sourceRef.file_id ? (
          <Link
            href={`/files/f/${sourceRef.file_id}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span>{label}</span>
        )}
        {pages ? <span>· {pages}</span> : null}
        {sourceRef.exemplar ? <span>· worked out from an example</span> : null}
        {sourceRef.page_extraction_job_id ? (
          <Link
            href={`/knowledge/extractions/${sourceRef.page_extraction_job_id}`}
            target="_blank"
            className="text-primary underline-offset-2 hover:underline"
          >
            · see everything it found
          </Link>
        ) : null}
      </div>
      {sourceRef.quote_unverified ? (
        <p className="text-amber-600 dark:text-amber-500">
          The wording above could not be matched word-for-word to the source —
          check it against the original before you approve this rule.
        </p>
      ) : null}
    </div>
  );
}

function RuleRow({
  rule,
  canEdit,
  onEdit,
  onToggleRetired,
  onApprove,
}: {
  rule: RulebookRule;
  canEdit: boolean;
  onEdit: () => void;
  onToggleRetired: () => void;
  onApprove: () => void;
}) {
  const [openRow, setOpenRow] = useState(false);
  const retired = rule.retired === true;
  return (
    <div
      className={`rounded-md border border-border bg-card ${retired ? "opacity-60" : ""}`}
    >
      <div className="flex w-full items-start gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
          onClick={() => setOpenRow((v) => !v)}
          aria-expanded={openRow}
        >
          {openRow ? (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {rule.name}
              </span>
              {severityBadge(rule.severity)}
              {rule.draft ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] border-primary/40 text-primary"
                >
                  Draft — needs your approval
                </Badge>
              ) : null}
              {retired ? (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] text-muted-foreground"
                >
                  Retired
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rule.statement}
            </p>
          </div>
        </button>
        {canEdit && rule.draft && !retired ? (
          <Button
            size="sm"
            className="h-7 shrink-0"
            onClick={onApprove}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Approve
          </Button>
        ) : null}
      </div>
      {openRow ? (
        <div className="space-y-2 border-t border-border px-9 py-2 text-sm">
          {rule.rationale ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Why it matters
              </div>
              <p className="text-foreground">{rule.rationale}</p>
            </div>
          ) : null}
          {rule.detection ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                How to spot a violation
              </div>
              <p className="text-foreground">{rule.detection}</p>
            </div>
          ) : null}
          {rule.quote ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                In the source&apos;s own words
              </div>
              <blockquote className="border-l-2 border-border pl-2 italic text-foreground">
                “{rule.quote}”
              </blockquote>
            </div>
          ) : null}
          {rule.source_ref ? (
            <RuleProvenance sourceRef={rule.source_ref} />
          ) : null}
          <div className="text-xs text-muted-foreground">
            Rule id: <code className="font-mono">{rule.id}</code> — audits
            cite this id.
          </div>
          {canEdit ? (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onToggleRetired}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {retired ? "Restore" : "Retire"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RulebookDetailPage({ rulebookId }: { rulebookId: string }) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RulebookRule | undefined>();
  const [editorSection, setEditorSection] = useState<string | undefined>();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const searchParams = useSearchParams();
  // The guided start ("Distill your expertise") lands here with ?interview=1
  // when the knowledge lives in the Expert's head — the Scout interview IS the
  // next step.
  const [interviewOpen, setInterviewOpen] = useState(
    searchParams.get("interview") === "1",
  );
  const userId = useAppSelector(selectUserId);

  const reloadRulebook = useCallback(async () => {
    const r = await getRulebook(rulebookId);
    if (r) setRulebook(r);
  }, [rulebookId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, m] = await Promise.all([
          getRulebook(rulebookId),
          listMasterworksForRulebook(rulebookId).catch(() => [] as Masterwork[]),
        ]);
        if (cancelled) return;
        if (!r) {
          setError(
            "This Rulebook doesn't exist, or you don't have access to it.",
          );
        } else {
          setRulebook(r);
          setMasterworks(m);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load the Rulebook",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;

  const existingIds = useMemo(
    () => new Set((rulebook?.rules ?? []).map((r) => r.id)),
    [rulebook?.rules],
  );

  const grouped = useMemo(() => {
    if (!rulebook)
      return [] as { code: string; label: string; rules: RulebookRule[] }[];
    const q = search.trim().toLowerCase();
    const match = (r: RulebookRule) =>
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.statement.toLowerCase().includes(q) ||
      r.id.includes(q);
    const codes = Object.keys(rulebook.sections);
    const known = new Set(codes);
    const groups = codes.map((code) => ({
      code,
      label: rulebook.sections[code]?.label ?? code,
      rules: rulebook.rules.filter((r) => r.section === code && match(r)),
    }));
    const orphans = rulebook.rules.filter(
      (r) => !known.has(r.section) && match(r),
    );
    if (orphans.length > 0) {
      groups.push({ code: "?", label: "Unsorted", rules: orphans });
    }
    return groups;
  }, [rulebook, search]);

  const persist = useCallback(
    async (next: RulebookRule[]) => {
      if (!rulebook) return;
      try {
        const saved = await saveRules({
          rulebookId: rulebook.id,
          expectedVersion: rulebook.version,
          rules: next,
        });
        setRulebook(saved);
      } catch (err) {
        // A lost version swap (the Scout or another tab saved first) is
        // recoverable: pull the fresh Rulebook so the NEXT save works, then
        // surface what happened. Without this, every later save 409s forever.
        void reloadRulebook();
        throw err;
      }
    },
    [rulebook, reloadRulebook],
  );

  const saveRule = useCallback(
    async ({ rule, isNew }: RuleEditorResult) => {
      if (!rulebook) return;
      // The Expert opening a draft, correcting it, and saving IS approval —
      // the human-first act the whole Distillation loop waits on.
      const approved = { ...rule, draft: false };
      const next = isNew
        ? [...rulebook.rules, approved]
        : rulebook.rules.map((r) => (r.id === approved.id ? approved : r));
      await persist(next);
      toast.success(
        isNew ? "Rule added" : rule.draft ? "Rule approved" : "Rule saved",
        { description: `Rulebook is now version ${rulebook.version + 1}.` },
      );
    },
    [rulebook, persist],
  );

  const approveRule = useCallback(
    async (rule: RulebookRule) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) =>
        r.id === rule.id ? { ...r, draft: false } : r,
      );
      try {
        await persist(next);
        toast.success(`"${rule.name}" approved`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not approve");
      }
    },
    [rulebook, persist],
  );

  const approveAllDrafts = useCallback(async () => {
    if (!rulebook) return;
    const next = rulebook.rules.map((r) =>
      r.draft ? { ...r, draft: false } : r,
    );
    try {
      await persist(next);
      toast.success("All suggested rules approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    }
  }, [rulebook, persist]);

  const toggleRetired = useCallback(
    async (rule: RulebookRule) => {
      if (!rulebook) return;
      const next = rulebook.rules.map((r) =>
        r.id === rule.id ? { ...r, retired: r.retired !== true } : r,
      );
      try {
        await persist(next);
        toast.success(
          rule.retired ? `"${rule.name}" restored` : `"${rule.name}" retired`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save");
      }
    },
    [rulebook, persist],
  );

  const activate = useCallback(async () => {
    if (!rulebook) return;
    try {
      const saved = await updateRulebookMeta({
        rulebookId: rulebook.id,
        patch: { status: "active" },
      });
      setRulebook(saved);
      setConfirmActivate(false);
      toast.success("Rulebook activated — it can now power Masterworks.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate");
    }
  }, [rulebook]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !rulebook) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/masterwork">Back to Masterwork Studio</Link>
        </Button>
      </div>
    );
  }

  const liveRuleCount = rulebook.rules.filter((r) => r.retired !== true).length;
  const draftCount = rulebook.rules.filter((r) => r.draft === true).length;
  // Only approved (non-draft, non-retired) rules power a Masterwork — the
  // Build excludes drafts, so the button must not promise what it will refuse.
  const approvedCount = rulebook.rules.filter(
    (r) => r.retired !== true && r.draft !== true,
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6">
      {/* Rulebook summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="truncate text-base font-semibold text-foreground">
                {rulebook.name}
              </h2>
            </div>
            {rulebook.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {rulebook.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {rulebook.source.author ? (
                <span>
                  {rulebook.source.title ? `“${rulebook.source.title}” — ` : ""}
                  {rulebook.source.author}
                  {rulebook.source.year ? `, ${rulebook.source.year}` : ""}
                </span>
              ) : null}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                v{rulebook.version}
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {liveRuleCount} rules
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {rulebook.status === "draft"
                  ? "Draft"
                  : rulebook.status === "active"
                    ? "Active"
                    : "Archived"}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {canEdit && rulebook.status === "draft" ? (
              <Button size="sm" onClick={() => setConfirmActivate(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Activate
              </Button>
            ) : null}
            {approvedCount > 0 ? (
              <Button size="sm" onClick={() => setBuildOpen(true)}>
                <Hammer className="mr-1 h-4 w-4" />
                Build a Masterwork
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/masterwork/${rulebook.id}/masterworks`}>
                <Workflow className="mr-1 h-4 w-4" />
                Masterworks
                {masterworks.length > 0 ? ` (${masterworks.length})` : ""}
              </Link>
            </Button>
          </div>
        </div>
        {draftCount > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-primary">
              {draftCount} suggested {draftCount === 1 ? "rule" : "rules"}{" "}
              awaiting your approval — approve each one, or open it to correct
              it first.
            </p>
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                onClick={() => void approveAllDrafts()}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Approve all
              </Button>
            ) : null}
            {approvedCount === 0 ? (
              <p className="text-xs text-muted-foreground">
                Approved rules are what power a Masterwork — none yet.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rules…"
          className="h-8 max-w-xs"
        />
        {canEdit ? (
          <>
            <Button
              size="sm"
              className="h-8"
              onClick={() => {
                setEditing(undefined);
                setEditorSection(undefined);
                setEditorOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add rule
            </Button>
            <InterviewButton
              className="h-8"
              onClick={() => setInterviewOpen(true)}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setIngestOpen(true)}
            >
              <FileUp className="mr-1 h-4 w-4" />
              From a source
            </Button>
          </>
        ) : null}
      </div>

      {/* Sections */}
      {rulebook.rules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No rules yet. The fastest way to fill this in: let us interview you
            — talk about how you work, and rules get written down as you speak.
          </p>
          {canEdit ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => setInterviewOpen(true)}>
                <MessageCircleQuestion className="mr-1 h-4 w-4" />
                Start the interview
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(undefined);
                  setEditorOpen(true);
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add a rule by hand
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIngestOpen(true)}
              >
                <FileUp className="mr-1 h-4 w-4" />
                From a document
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        grouped.map((group) =>
          group.rules.length === 0 && search ? null : (
            <section key={group.code} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">
                  {group.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {group.rules.length}{" "}
                    {group.rules.length === 1 ? "rule" : "rules"}
                  </span>
                </h3>
                {canEdit && group.code !== "?" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => {
                      setEditing(undefined);
                      setEditorSection(group.code);
                      setEditorOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add here
                  </Button>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {group.rules.map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    canEdit={canEdit}
                    onEdit={() => {
                      setEditing(rule);
                      setEditorSection(undefined);
                      setEditorOpen(true);
                    }}
                    onToggleRetired={() => void toggleRetired(rule)}
                    onApprove={() => void approveRule(rule)}
                  />
                ))}
              </div>
            </section>
          ),
        )
      )}

      <RuleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        sections={rulebook.sections}
        existingIds={existingIds}
        initial={editing}
        defaultSection={editorSection}
        onSave={saveRule}
      />
      <ConfirmDialog
        open={confirmActivate}
        onOpenChange={setConfirmActivate}
        title="Activate this Rulebook?"
        description="An active Rulebook can power Masterworks — working AI checkers built from these rules. You can keep editing after activation; every save creates a new version."
        confirmLabel="Activate"
        onConfirm={() => void activate()}
      />
      <BuildMasterworkDialog
        open={buildOpen}
        onOpenChange={setBuildOpen}
        rulebook={rulebook}
        onBuilt={() => {
          void listMasterworksForRulebook(rulebook.id)
            .then(setMasterworks)
            .catch(() => undefined);
        }}
      />
      <IngestSourceDialog
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        rulebook={rulebook}
        onIngested={() => {
          void getRulebook(rulebook.id)
            .then((r) => {
              if (r) setRulebook(r);
            })
            .catch(() => undefined);
        }}
      />
      {canEdit ? (
        <ScoutInterviewPanel
          rulebookId={rulebook.id}
          open={interviewOpen}
          onOpenChange={setInterviewOpen}
          onRulebookChanged={() => void reloadRulebook()}
        />
      ) : null}
    </div>
  );
}
