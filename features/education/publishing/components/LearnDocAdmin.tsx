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
//
// This component is also the EMITTER for `matrx-user/education-learn-authoring`
// and the home of its four write targets. The provider lives here, on the
// always-mounted list component, so the surface keeps emitting the library even
// when no guide is open; the editor registers the real write handlers while it
// is mounted (a registered handler beats the provider's), and the provider's
// own handlers explain that nothing is open. Everything an agent writes is
// STAGED into the editor's state — the admin still presses Save, and publishing
// stays entirely theirs.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
} from "react";
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
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import {
  SurfaceRuntimeProvider,
  useSurfaceWriteHandlers,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import {
  createEducationLearnAuthoringScope,
  educationLearnAuthoringManifest,
} from "@/features/surfaces/manifests/education-learn-authoring.manifest";
import { eduHref } from "../../constants";
import { SectionRenderer } from "../../components/sections/SectionRenderer";
import {
  deleteLearnDocAction,
  listLearnDocsAdminAction,
  saveLearnDocAction,
  setLearnDocStatusAction,
} from "../actions";
import {
  EDU_SECTION_KINDS,
  LEARN_DOC_RELATED_KEYS,
  describeAllSectionKinds,
  parseRelatedJson,
  parseSectionsJson,
  validateRelatedValue,
  validateSectionFields,
  validateSectionsValue,
} from "../validate";
import type {
  LearnDocDraftInput,
  LearnDocRecord,
  LearnDocStatus,
} from "../types";
import type { EduSection } from "../../types";

interface Props {
  initialDocs: LearnDocRecord[];
}

type EditorState =
  | { mode: "list" }
  | { mode: "new" }
  | { mode: "edit"; doc: LearnDocRecord };

// THE NAMING LAW: field labels for declared values render from the manifest,
// never from a hand-typed literal that can drift away from it.
const V = surfaceValueLabels(educationLearnAuthoringManifest);
const SURFACE_NAME = educationLearnAuthoringManifest.surfaceName;

/** The editor's live state, read by the emitter at Run time. */
interface EditorSnapshot {
  mode: "new" | "edit";
  docId: string | null;
  status: LearnDocStatus | null;
  slug: string;
  title: string;
  summary: string;
  subject: string;
  letter: string;
  updated: string;
  keywords: string[];
  /** null while the Sections textarea holds invalid JSON. */
  sections: EduSection[] | null;
  /** null while the Related textarea holds invalid JSON. */
  related: Record<string, string[]> | null;
  sectionsError: string | null;
  relatedError: string | null;
  previewVisible: boolean;
}

type SnapshotRef = MutableRefObject<EditorSnapshot | null>;

// ─── Write-target validation ─────────────────────────────────────────────────
//
// Every handler validates FULLY before it stages anything, and throws on a bad
// shape — the writeback seam turns a throw into a safe error envelope the agent
// reads, so a wrong value is the agent's error to hear about, never something
// we quietly coerce. The messages spell out the exact fix, because the
// inline-tool layer parses a JSON-looking argument before the handler sees it
// and an agent that guesses will "fix" a rejection by double-encoding.

const PLAIN_TEXT_NOTE =
  "It must be a plain text string — not JSON and not JSON-encoded, with no code fence and no surrounding quotes.";

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

function requirePlainObject(
  value: unknown,
  target: string,
): Record<string, unknown> {
  if (typeof value === "string") {
    throw new Error(
      `"${target}" must receive the JSON object itself, not a string containing JSON. Pass the object — no code fence, no surrounding quotes, and do not JSON-encode it.`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `"${target}" must be an object, received ${describeType(value)}.`,
    );
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `"${field}" must be a string, received ${describeType(value)}. ${PLAIN_TEXT_NOTE}`,
    );
  }
  return value;
}

/** Shape-check an agent-supplied `EduSection[]` against the real vocabulary. */
function requireSections(value: unknown, target: string): EduSection[] {
  if (typeof value === "string") {
    throw new Error(
      `"${target}" must receive the JSON array itself, not a string containing JSON. Pass an array of section objects — no code fence, no surrounding quotes, and do not JSON-encode it. Section shapes: ${describeAllSectionKinds()}.`,
    );
  }
  const result = validateSectionsValue(value);
  if (!result.ok) throw new Error(`"${target}": ${result.error}`);
  const sections = result.sections ?? [];
  // Stricter than the admin's textarea on purpose: a section with the right
  // `kind` but the wrong field names parses and renders BLANK, which is
  // exactly the silent failure the writeback seam exists to surface.
  const fields = validateSectionFields(sections);
  if (!fields.ok) throw new Error(`"${target}": ${fields.error}`);
  return sections;
}

// ─── List + emitter ──────────────────────────────────────────────────────────

export function LearnDocAdmin({ initialDocs }: Props) {
  const [docs, setDocs] = useState<LearnDocRecord[]>(initialDocs);
  const [state, setState] = useState<EditorState>({ mode: "list" });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The editor owns the draft fields. Rather than lift all nine into this
  // component, the editor keeps this ref current and the emitter reads it at
  // Run time — live state, never a stale render's copy. Null = no editor open.
  const snapshotRef = useRef<EditorSnapshot | null>(null);

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

  const published = docs.filter((d) => d.status === "published").length;

  // Built fresh each render; the provider always calls the LATEST closure, so
  // `docs` and the snapshot are both live when the user presses Run.
  const getScope = () => {
    const snap = snapshotRef.current;
    const library = {
      doc_count: docs.length,
      published_count: published,
      learn_docs: docs.map((d) => ({
        id: d.id,
        slug: d.slug,
        title: d.title,
        subject: d.subject ?? null,
        status: d.status,
        updated: d.updated,
      })),
      editor_open: snap !== null,
    };
    if (!snap) return createEducationLearnAuthoringScope(library);
    return createEducationLearnAuthoringScope({
      ...library,
      editor_mode: snap.mode,
      editor_doc_id: snap.docId ?? undefined,
      editor_doc_status: snap.status ?? undefined,
      draft_metadata: {
        title: snap.title,
        summary: snap.summary,
        subject: snap.subject.trim() || null,
        letter: snap.letter,
        keywords: snap.keywords,
      },
      draft_slug: snap.slug,
      draft_title: snap.title,
      draft_summary: snap.summary,
      draft_subject: snap.subject,
      draft_letter: snap.letter,
      draft_updated: snap.updated,
      draft_keywords: snap.keywords,
      draft_sections: snap.sections ?? undefined,
      draft_related: snap.related ?? undefined,
      sections_error: snap.sectionsError ?? undefined,
      related_error: snap.relatedError ?? undefined,
      preview_visible: snap.previewVisible,
    });
  };

  // Fallbacks for when no guide is open. The editor registers the real
  // handlers while it is mounted and those win, so these only ever fire from
  // the library list — where "there is nothing staged to write into" is the
  // honest answer, not a wiring bug.
  const getWriteHandlers = (): SurfaceWriteHandlers => {
    const noEditor = (target: string) => () => {
      throw new Error(
        `Cannot apply "${target}": no study guide is open in the editor. This surface stages writes into the open editor, so ask the admin to open a guide from the list (or start a new one) first, then try again.`,
      );
    };
    return {
      doc_metadata: noEditor("doc_metadata"),
      doc_sections: noEditor("doc_sections"),
      add_sections: noEditor("add_sections"),
      doc_related: noEditor("doc_related"),
    };
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
      isEditable
    >
      {state.mode !== "list" ? (
        <LearnDocEditor
          doc={state.mode === "edit" ? state.doc : null}
          snapshotRef={snapshotRef}
          onDone={async () => {
            await refresh();
            setState({ mode: "list" });
          }}
          onCancel={() => setState({ mode: "list" })}
        />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Study Guide Authoring
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                <span data-surface-value="doc_count">{docs.length} total</span> ·{" "}
                <span data-surface-value="published_count">
                  {published} published
                </span>
                . Publish here — the public{" "}
                <Link
                  href={eduHref("learn")}
                  className="text-primary hover:underline"
                >
                  /education/learn
                </Link>{" "}
                library updates without a deploy.
              </p>
            </div>
            <Button
              onClick={() => setState({ mode: "new" })}
              className="gap-2 shrink-0"
            >
              <FilePlus2 className="h-4 w-4" /> New guide
            </Button>
          </div>

          {docs.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground"
              data-surface-value="learn_docs"
            >
              No study guides yet. Create the first one.
            </div>
          ) : (
            <div
              className="divide-y divide-border rounded-xl border border-border bg-card"
              data-surface-value="learn_docs"
            >
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
                          variant={
                            doc.status === "published" ? "default" : "secondary"
                          }
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
                        title={
                          doc.status === "published" ? "Unpublish" : "Publish"
                        }
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
      )}
    </SurfaceRuntimeProvider>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function LearnDocEditor({
  doc,
  snapshotRef,
  onDone,
  onCancel,
}: {
  doc: LearnDocRecord | null;
  snapshotRef: SnapshotRef;
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

  // Publish the live draft for the emitter. No dep array: this runs after every
  // commit, so the ref always mirrors what is on screen.
  useEffect(() => {
    snapshotRef.current = {
      mode: doc ? "edit" : "new",
      docId: doc?.id ?? null,
      status: doc?.status ?? null,
      slug,
      title,
      summary,
      subject,
      letter,
      updated,
      keywords: keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      sections: parsedSections.ok ? (parsedSections.sections ?? []) : null,
      related: parsedRelated.ok ? (parsedRelated.related ?? {}) : null,
      sectionsError: parsedSections.ok ? null : (parsedSections.error ?? null),
      relatedError: parsedRelated.ok ? null : (parsedRelated.error ?? null),
      previewVisible: showPreview,
    };
  });

  // Closing the editor means nothing is staged any more — `editor_open` must go
  // back to false and the provider's "no guide open" handlers must take over.
  useEffect(
    () => () => {
      snapshotRef.current = null;
    },
    [snapshotRef],
  );

  // The write targets. These stage into the SAME setters the admin's own typing
  // drives — there is no second write path — and the live preview re-renders
  // the result immediately. Persistence still happens only when the admin
  // presses Save, which is the whole safety story on a surface that publishes
  // to the public web.
  useSurfaceWriteHandlers(SURFACE_NAME, {
    doc_metadata: (value) => {
      const patch = requirePlainObject(value, "doc_metadata");
      const allowed = ["title", "summary", "subject", "letter", "keywords"];
      const unknown = Object.keys(patch).filter((k) => !allowed.includes(k));
      if (unknown.length > 0) {
        throw new Error(
          `"doc_metadata" does not accept ${unknown.map((k) => `"${k}"`).join(", ")}. Allowed: ${allowed.join(", ")}. The slug and the publication status are not agent-writable on this surface.`,
        );
      }
      const provided = allowed.filter((k) => patch[k] !== undefined);
      if (provided.length === 0) {
        throw new Error(
          `"doc_metadata" needs at least one of ${allowed.join(", ")} — the object you sent has none of them.`,
        );
      }

      // Validate everything BEFORE staging anything: a rejected write must
      // leave the editor exactly as it was.
      const next: {
        title?: string;
        summary?: string;
        subject?: string;
        letter?: string;
        keywords?: string;
      } = {};
      if (patch.title !== undefined) {
        next.title = requireString(patch.title, "title");
      }
      if (patch.summary !== undefined) {
        next.summary = requireString(patch.summary, "summary");
      }
      if (patch.subject !== undefined) {
        next.subject = requireString(patch.subject, "subject");
      }
      if (patch.letter !== undefined) {
        const letterValue = requireString(patch.letter, "letter");
        if (letterValue.trim().length > 2) {
          throw new Error(
            `"letter" is the short card badge and takes at most 2 characters — received "${letterValue}".`,
          );
        }
        next.letter = letterValue;
      }
      if (patch.keywords !== undefined) {
        const list = patch.keywords;
        if (!Array.isArray(list) || list.some((k) => typeof k !== "string")) {
          throw new Error(
            `"keywords" must be an ARRAY of plain text strings (e.g. ["photosynthesis", "Calvin cycle"]), received ${describeType(list)}. Do not send a comma-separated string, and do not JSON-encode the array.`,
          );
        }
        next.keywords = (list as string[])
          .map((k) => k.trim())
          .filter(Boolean)
          .join(", ");
      }

      if (next.title !== undefined) setTitle(next.title);
      if (next.summary !== undefined) setSummary(next.summary);
      if (next.subject !== undefined) setSubject(next.subject);
      if (next.letter !== undefined) setLetter(next.letter);
      if (next.keywords !== undefined) setKeywords(next.keywords);
    },

    doc_sections: (value) => {
      const sections = requireSections(value, "doc_sections");
      setSectionsJson(JSON.stringify(sections, null, 2));
    },

    add_sections: (value) => {
      const additions = requireSections(value, "add_sections");
      if (additions.length === 0) {
        throw new Error(
          `"add_sections" received an empty array — there is nothing to append.`,
        );
      }
      const current = parseSectionsJson(sectionsJson);
      if (!current.ok) {
        throw new Error(
          `Cannot append: the Sections editor currently holds invalid JSON (${current.error}) Fix it on the page, or use "doc_sections" to replace the whole body instead.`,
        );
      }
      setSectionsJson(
        JSON.stringify([...(current.sections ?? []), ...additions], null, 2),
      );
    },

    doc_related: (value) => {
      const raw = requirePlainObject(value, "doc_related");
      const result = validateRelatedValue(raw);
      if (!result.ok) throw new Error(`"doc_related": ${result.error}`);
      const related = result.related ?? {};
      for (const [key, list] of Object.entries(related)) {
        if (!LEARN_DOC_RELATED_KEYS.includes(key as never)) {
          throw new Error(
            `"doc_related" does not accept the key "${key}" — nothing renders it. Allowed keys: ${LEARN_DOC_RELATED_KEYS.join(", ")}.`,
          );
        }
        if (!Array.isArray(list) || list.some((s) => typeof s !== "string")) {
          throw new Error(
            `"doc_related.${key}" must be an array of slug strings (e.g. ["flashcards"]), received ${describeType(list)}.`,
          );
        }
      }
      setRelatedJson(JSON.stringify(related, null, 2));
    },
  });

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
            <Badge
              variant="secondary"
              className="text-[10px] uppercase shrink-0"
              data-surface-value="editor_doc_status"
            >
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
          <Field
            label={V.draft_slug}
            anchor="draft_slug"
            hint="URL path under /education/learn — may include / for hierarchy."
          >
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="biology/photosynthesis"
              className="font-mono"
            />
          </Field>
          <Field label={V.draft_title} anchor="draft_title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Photosynthesis, Explained" />
          </Field>
          <Field
            label={V.draft_summary}
            anchor="draft_summary"
            hint="Meta description + hero lede."
          >
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={V.draft_subject} anchor="draft_subject" hint="Subject slug">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="biology" className="font-mono" />
            </Field>
            <Field label={V.draft_letter} anchor="draft_letter" hint="2 chars">
              <Input value={letter} onChange={(e) => setLetter(e.target.value)} maxLength={2} className="font-mono" />
            </Field>
            <Field label={V.draft_updated} anchor="draft_updated" hint="YYYY-MM-DD">
              <Input value={updated} onChange={(e) => setUpdated(e.target.value)} placeholder="2026-07-07" className="font-mono" />
            </Field>
          </div>
          <Field label={V.draft_keywords} anchor="draft_keywords" hint="Comma-separated.">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="photosynthesis, Calvin cycle" />
          </Field>
          <Field
            label={V.draft_sections}
            anchor="draft_sections"
            hint={`JSON · EduSection[] — kinds: ${EDU_SECTION_KINDS.join(", ")}.`}
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
            label={V.draft_related}
            anchor="draft_related"
            hint='JSON · { "tools": ["flashcards"], "subjects": ["biology"], "exams": ["ap-biology"] }'
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
        <div className="space-y-3" data-surface-value="preview_visible">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">{V.preview_visible}</Label>
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
  anchor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  /** `data-surface-value` name, so the Surface Context window can Locate it. */
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-surface-value={anchor}>
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        {hint ? <span className="text-[11px] text-muted-foreground truncate">{hint}</span> : null}
      </div>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
