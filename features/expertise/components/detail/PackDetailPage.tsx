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
  getPack,
  listDesksForPack,
  savePrinciples,
  updatePackMeta,
} from "../../service";
import {
  SEVERITY_LABELS,
  type ExpertisePack,
  type PackDesk,
  type PackPrinciple,
  type PrincipleSeverity,
} from "../../types";
import { CompileDeskDialog } from "./CompileDeskDialog";
import { IngestSourceDialog } from "./IngestSourceDialog";
import { InterviewButton, PackInterviewPanel } from "./PackInterviewPanel";
import { RuleEditorDialog, type RuleEditorResult } from "./RuleEditorDialog";

/**
 * The expert surface: read your rulebook, correct it, grow it. Rules are
 * grouped by section; each expands to why / how-to-spot-it / the source's own
 * words. Every save bumps the pack version (desks show drift against it).
 */

function severityBadge(severity: PrincipleSeverity) {
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

function RuleRow({
  principle,
  canEdit,
  onEdit,
  onToggleRetired,
  onApprove,
}: {
  principle: PackPrinciple;
  canEdit: boolean;
  onEdit: () => void;
  onToggleRetired: () => void;
  onApprove: () => void;
}) {
  const [openRow, setOpenRow] = useState(false);
  const retired = principle.retired === true;
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
                {principle.name}
              </span>
              {severityBadge(principle.severity)}
              {principle.draft ? (
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
              {principle.statement}
            </p>
          </div>
        </button>
        {canEdit && principle.draft && !retired ? (
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
          {principle.rationale ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                Why it matters
              </div>
              <p className="text-foreground">{principle.rationale}</p>
            </div>
          ) : null}
          {principle.detection ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                How to spot a violation
              </div>
              <p className="text-foreground">{principle.detection}</p>
            </div>
          ) : null}
          {principle.quote ? (
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                In the source&apos;s own words
              </div>
              <blockquote className="border-l-2 border-border pl-2 italic text-foreground">
                “{principle.quote}”
              </blockquote>
            </div>
          ) : null}
          {principle.source_ref ? (
            <div className="text-xs text-muted-foreground">
              From the source:{" "}
              {principle.source_ref.pages
                ? `page ${principle.source_ref.pages}`
                : (principle.source_ref.note ?? "ingested")}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            Rule id: <code className="font-mono">{principle.id}</code> — audits
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

export function PackDetailPage({ packId }: { packId: string }) {
  const [pack, setPack] = useState<ExpertisePack | null>(null);
  const [desks, setDesks] = useState<PackDesk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PackPrinciple | undefined>();
  const [editorSection, setEditorSection] = useState<string | undefined>();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [compileOpen, setCompileOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const searchParams = useSearchParams();
  // The guided start ("Distill an expert") lands here with ?interview=1 when
  // the knowledge lives in the expert's head — the interview IS the next step.
  const [interviewOpen, setInterviewOpen] = useState(
    searchParams.get("interview") === "1",
  );
  const userId = useAppSelector(selectUserId);

  const reloadPack = useCallback(async () => {
    const p = await getPack(packId);
    if (p) setPack(p);
  }, [packId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, d] = await Promise.all([
          getPack(packId),
          listDesksForPack(packId).catch(() => [] as PackDesk[]),
        ]);
        if (cancelled) return;
        if (!p) {
          setError("This pack doesn't exist, or you don't have access to it.");
        } else {
          setPack(p);
          setDesks(d);
        }
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load the pack",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  const canEdit = pack !== null && userId !== null && pack.created_by === userId;

  const existingIds = useMemo(
    () => new Set((pack?.principles ?? []).map((p) => p.id)),
    [pack?.principles],
  );

  const grouped = useMemo(() => {
    if (!pack) return [] as { code: string; label: string; rules: PackPrinciple[] }[];
    const q = search.trim().toLowerCase();
    const match = (p: PackPrinciple) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.statement.toLowerCase().includes(q) ||
      p.id.includes(q);
    const codes = Object.keys(pack.sections);
    const known = new Set(codes);
    const groups = codes.map((code) => ({
      code,
      label: pack.sections[code]?.label ?? code,
      rules: pack.principles.filter((p) => p.section === code && match(p)),
    }));
    const orphans = pack.principles.filter(
      (p) => !known.has(p.section) && match(p),
    );
    if (orphans.length > 0) {
      groups.push({ code: "?", label: "Unsorted", rules: orphans });
    }
    return groups;
  }, [pack, search]);

  const persist = useCallback(
    async (next: PackPrinciple[]) => {
      if (!pack) return;
      try {
        const saved = await savePrinciples({
          packId: pack.id,
          expectedVersion: pack.version,
          principles: next,
        });
        setPack(saved);
      } catch (err) {
        // A lost version swap (the interviewer or another tab saved first) is
        // recoverable: pull the fresh pack so the NEXT save works, then
        // surface what happened. Without this, every later save 409s forever.
        void reloadPack();
        throw err;
      }
    },
    [pack, reloadPack],
  );

  const saveRule = useCallback(
    async ({ principle, isNew }: RuleEditorResult) => {
      if (!pack) return;
      // The expert opening a draft, correcting it, and saving IS approval —
      // the human-first act the whole distillation loop waits on.
      const approved = { ...principle, draft: false };
      const next = isNew
        ? [...pack.principles, approved]
        : pack.principles.map((p) => (p.id === approved.id ? approved : p));
      await persist(next);
      toast.success(
        isNew ? "Rule added" : principle.draft ? "Rule approved" : "Rule saved",
        { description: `Pack is now version ${pack.version + 1}.` },
      );
    },
    [pack, persist],
  );

  const approveRule = useCallback(
    async (rule: PackPrinciple) => {
      if (!pack) return;
      const next = pack.principles.map((p) =>
        p.id === rule.id ? { ...p, draft: false } : p,
      );
      try {
        await persist(next);
        toast.success(`"${rule.name}" approved`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not approve");
      }
    },
    [pack, persist],
  );

  const approveAllDrafts = useCallback(async () => {
    if (!pack) return;
    const next = pack.principles.map((p) =>
      p.draft ? { ...p, draft: false } : p,
    );
    try {
      await persist(next);
      toast.success("All suggested rules approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    }
  }, [pack, persist]);

  const toggleRetired = useCallback(
    async (rule: PackPrinciple) => {
      if (!pack) return;
      const next = pack.principles.map((p) =>
        p.id === rule.id ? { ...p, retired: p.retired !== true } : p,
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
    [pack, persist],
  );

  const activate = useCallback(async () => {
    if (!pack) return;
    try {
      const saved = await updatePackMeta({
        packId: pack.id,
        patch: { status: "active" },
      });
      setPack(saved);
      setConfirmActivate(false);
      toast.success("Pack activated — it can now power desks.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate");
    }
  }, [pack]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !pack) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/expertise">Back to Expertise</Link>
        </Button>
      </div>
    );
  }

  const liveRuleCount = pack.principles.filter((p) => p.retired !== true).length;
  const draftCount = pack.principles.filter((p) => p.draft === true).length;
  // Only approved (non-draft, non-retired) rules power desks — the compiler
  // excludes drafts, so the button must not promise what it will refuse.
  const approvedCount = pack.principles.filter(
    (p) => p.retired !== true && p.draft !== true,
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6">
      {/* Pack summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="truncate text-base font-semibold text-foreground">
                {pack.name}
              </h2>
            </div>
            {pack.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {pack.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {pack.source.author ? (
                <span>
                  {pack.source.title ? `“${pack.source.title}” — ` : ""}
                  {pack.source.author}
                  {pack.source.year ? `, ${pack.source.year}` : ""}
                </span>
              ) : null}
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                v{pack.version}
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {liveRuleCount} rules
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {pack.status === "draft"
                  ? "Draft"
                  : pack.status === "active"
                    ? "Active"
                    : "Archived"}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {canEdit && pack.status === "draft" ? (
              <Button size="sm" onClick={() => setConfirmActivate(true)}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Activate
              </Button>
            ) : null}
            {approvedCount > 0 ? (
              <Button size="sm" onClick={() => setCompileOpen(true)}>
                <Hammer className="mr-1 h-4 w-4" />
                Create a desk
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/expertise/${pack.id}/desks`}>
                <Workflow className="mr-1 h-4 w-4" />
                Desks{desks.length > 0 ? ` (${desks.length})` : ""}
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
                Approved rules are what power a desk — none yet.
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
      {pack.principles.length === 0 ? (
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
                    principle={rule}
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
        sections={pack.sections}
        existingIds={existingIds}
        initial={editing}
        defaultSection={editorSection}
        onSave={saveRule}
      />
      <ConfirmDialog
        open={confirmActivate}
        onOpenChange={setConfirmActivate}
        title="Activate this pack?"
        description="Active packs can power desks — working AI checkers built from these rules. You can keep editing after activation; every save creates a new version."
        confirmLabel="Activate"
        onConfirm={() => void activate()}
      />
      <CompileDeskDialog
        open={compileOpen}
        onOpenChange={setCompileOpen}
        pack={pack}
        onCompiled={() => {
          void listDesksForPack(pack.id)
            .then(setDesks)
            .catch(() => undefined);
        }}
      />
      <IngestSourceDialog
        open={ingestOpen}
        onOpenChange={setIngestOpen}
        pack={pack}
        onIngested={() => {
          void getPack(pack.id)
            .then((p) => {
              if (p) setPack(p);
            })
            .catch(() => undefined);
        }}
      />
      {canEdit ? (
        <PackInterviewPanel
          packId={pack.id}
          open={interviewOpen}
          onOpenChange={setInterviewOpen}
          onPackChanged={() => void reloadPack()}
        />
      ) : null}
    </div>
  );
}
