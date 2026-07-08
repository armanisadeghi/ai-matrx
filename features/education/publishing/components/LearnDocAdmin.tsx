"use client";

// Super-admin authoring surface for DB-backed learn docs (P6 Phase A).
// List → editor. Every mutation runs through the gated server actions and busts
// the public cache, so "publish without a deploy" is the whole point: publish
// here, refresh /education/learn, the article is live.
//
// Sections are edited as raw JSON (the canonical EduSection[] vocabulary) with
// live validation + a real SectionRenderer preview — the same renderer the
// public page uses, so the preview is exact. Raw JSON is also the natural
// hand-off shape for agent-assisted drafting.

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  FilePlus2,
  Loader2,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { eduHref } from "../../constants";
import { SectionRenderer } from "../../components/sections/SectionRenderer";
import {
  deleteLearnDocAction,
  listLearnDocsAdminAction,
  saveLearnDocAction,
  setLearnDocStatusAction,
} from "../actions";
import { parseRelatedJson, parseSectionsJson } from "../validate";
import type { LearnDocDraftInput, LearnDocRecord } from "../types";
import type { EduSection } from "../../types";

interface Props {
  initialDocs: LearnDocRecord[];
}

type EditorState =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; doc: LearnDocRecord };

export function LearnDocAdmin({ initialDocs }: Props) {
  const [docs, setDocs] = useState<LearnDocRecord[]>(initialDocs);
  const [state, setState] = useState<EditorState>({ mode: "list" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    try {
      const next = await listLearnDocsAdminAction();
      setDocs(next);
    } catch (e) {
      toast.error(`Failed to refresh: ${(e as Error).message}`);
    }
  }, []);

  const onPublishToggle = useCallback(
    (doc: LearnDocRecord) => {
      const publish = doc.status !== "published";
      setPendingId(doc.id);
      startTransition(async () => {
        try {
          await setLearnDocStatusAction(doc.id, publish);
          toast.success(publish ? "Published" : "Unpublished");
          await refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setPendingId(null);
        }
      });
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (doc: LearnDocRecord) => {
      const ok = await confirm({
        title: "Delete study guide?",
        description: `"${doc.title}" will be removed. This is a soft delete.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
      setPendingId(doc.id);
      startTransition(async () => {
        try {
          await deleteLearnDocAction(doc.id);
          toast.success("Deleted");
          await refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setPendingId(null);
        }
      });
    },
    [refresh],
  );

  if (state.mode !== "list") {
    return (
      <LearnDocEditor
        doc={state.mode === "edit" ? state.doc : null}
        onDone={async () => {
          await refresh();
          setState({ mode: "list" });
        }}
        onCancel={() => setState({ mode: "list" })}
      />
    );
  }

  const published = docs.filter((d) => d.status === "published").length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Study Guide Authoring</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {docs.length} total · {published} published. Publish here — the public{" "}
            <Link href={eduHref("learn")} className="text-primary hover:underline">
              /education/learn
            </Link>{" "}
            library updates without a deploy.
          </p>
        </div>
        <Button onClick={() => setState({ mode: "new" })} className="gap-2 shrink-0">
          <FilePlus2 className="h-4 w-4" /> New guide
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          No study guides yet. Create the first one.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {docs.map((doc) => {
            const busy = pendingId === doc.id && isPending;
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{doc.title}</span>
                    <Badge
                      variant={doc.status === "published" ? "default" : "secondary"}
                      className={cn(
                        "text-[10px] uppercase tracking-wide",
                        doc.status === "published" &&
                          "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15 border-emerald-500/30",
                      )}
                    >
                      {doc.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {doc.slug} · updated {doc.updated}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {doc.status === "published" ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title="View live"
                    >
                      <a
                        href={eduHref("learn", doc.slug)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit"
                    onClick={() => setState({ mode: "edit", doc })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={doc.status === "published" ? "Unpublish" : "Publish"}
                    disabled={busy}
                    onClick={() => onPublishToggle(doc)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : doc.status === "published" ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    disabled={busy}
                    onClick={() => onDelete(doc)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function LearnDocEditor({
  doc,
  onDone,
  onCancel,
}: {
  doc: LearnDocRecord | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [slug, setSlug] = useState(doc?.slug ?? "");
  const [title, setTitle] = useState(doc?.title ?? "");
  const [summary, setSummary] = useState(doc?.summary ?? "");
  const [subject, setSubject] = useState(doc?.subject ?? "");
  const [letter, setLetter] = useState(doc?.letter ?? "Lr");
  const [keywords, setKeywords] = useState((doc?.keywords ?? []).join(", "));
  const [updated, setUpdated] = useState(doc?.updated ?? "");
  const [sectionsJson, setSectionsJson] = useState(
    JSON.stringify(doc?.sections ?? [], null, 2),
  );
  const [relatedJson, setRelatedJson] = useState(
    JSON.stringify(doc?.related ?? {}, null, 2),
  );
  const [showPreview, setShowPreview] = useState(true);
  const [isPending, startTransition] = useTransition();

  const parsedSections = useMemo(() => parseSectionsJson(sectionsJson), [sectionsJson]);
  const parsedRelated = useMemo(() => parseRelatedJson(relatedJson), [relatedJson]);

  const buildInput = useCallback((): LearnDocDraftInput | null => {
    if (!slug.trim()) {
      toast.error("Slug is required.");
      return null;
    }
    if (!title.trim()) {
      toast.error("Title is required.");
      return null;
    }
    if (!summary.trim()) {
      toast.error("Summary is required.");
      return null;
    }
    if (!parsedSections.ok) {
      toast.error(parsedSections.error ?? "Invalid sections.");
      return null;
    }
    if (!parsedRelated.ok) {
      toast.error(parsedRelated.error ?? "Invalid related.");
      return null;
    }
    return {
      id: doc?.id ?? null,
      slug: slug.trim(),
      title: title.trim(),
      summary: summary.trim(),
      subject: subject.trim() || null,
      letter: letter.trim() || "Lr",
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      sections: parsedSections.sections ?? [],
      related: parsedRelated.related ?? {},
      contentUpdatedAt: updated.trim() || null,
    };
  }, [
    doc?.id,
    slug,
    title,
    summary,
    subject,
    letter,
    keywords,
    updated,
    parsedSections,
    parsedRelated,
  ]);

  const save = useCallback(
    (thenPublish: boolean) => {
      const input = buildInput();
      if (!input) return;
      startTransition(async () => {
        try {
          const saved = await saveLearnDocAction(input);
          if (thenPublish && saved.status !== "published") {
            await setLearnDocStatusAction(saved.id, true);
          }
          toast.success(thenPublish ? "Saved & published" : "Saved");
          await onDone();
        } catch (e) {
          toast.error((e as Error).message);
        }
      });
    },
    [buildInput, onDone],
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onCancel} title="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight truncate">
            {doc ? "Edit study guide" : "New study guide"}
          </h1>
          {doc ? (
            <Badge variant="secondary" className="text-[10px] uppercase shrink-0">
              {doc.status}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => save(false)} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save draft
          </Button>
          <Button onClick={() => save(true)} disabled={isPending} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            {doc?.status === "published" ? "Save & keep live" : "Save & publish"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="space-y-4">
          <Field label="Slug" hint="URL path under /education/learn — may include / for hierarchy.">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="biology/photosynthesis"
              className="font-mono"
            />
          </Field>
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Photosynthesis, Explained" />
          </Field>
          <Field label="Summary" hint="Meta description + hero lede.">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Subject" hint="Subject slug">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="biology" className="font-mono" />
            </Field>
            <Field label="Badge" hint="2 chars">
              <Input value={letter} onChange={(e) => setLetter(e.target.value)} maxLength={2} className="font-mono" />
            </Field>
            <Field label="Updated" hint="YYYY-MM-DD">
              <Input value={updated} onChange={(e) => setUpdated(e.target.value)} placeholder="2026-07-07" className="font-mono" />
            </Field>
          </div>
          <Field label="Keywords" hint="Comma-separated.">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="photosynthesis, Calvin cycle" />
          </Field>
          <Field
            label="Sections (JSON)"
            hint="EduSection[] — kinds: prose, feature-grid, steps, status-cards, stat-bar, faq, cta."
            error={!parsedSections.ok ? parsedSections.error : undefined}
          >
            <Textarea
              value={sectionsJson}
              onChange={(e) => setSectionsJson(e.target.value)}
              rows={16}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </Field>
          <Field
            label="Related (JSON)"
            hint='{ "tools": ["flashcards"], "subjects": ["biology"], "exams": ["ap-biology"] }'
            error={!parsedRelated.ok ? parsedRelated.error : undefined}
          >
            <Textarea
              value={relatedJson}
              onChange={(e) => setRelatedJson(e.target.value)}
              rows={4}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </Field>
        </div>

        {/* Right: live preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Live preview</Label>
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)} className="gap-1.5 text-xs">
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? "Hide" : "Show"}
            </Button>
          </div>
          {showPreview ? (
            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="px-6 pt-6 pb-2">
                <h2 className="text-2xl font-bold tracking-tight">{title || "Untitled"}</h2>
                <p className="mt-2 text-muted-foreground">{summary}</p>
              </div>
              <div className="scale-[0.85] origin-top">
                {parsedSections.ok ? (
                  <SectionRenderer sections={(parsedSections.sections ?? []) as EduSection[]} />
                ) : (
                  <div className="p-6 text-sm text-destructive">
                    Fix the sections JSON to preview.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint ? <span className="text-[11px] text-muted-foreground truncate">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
