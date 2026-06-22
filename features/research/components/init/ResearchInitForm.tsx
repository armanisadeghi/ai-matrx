"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Plus,
  Hand,
  ChevronRight,
  LayoutTemplate,
  Check,
  FolderOpen,
  Building2,
  ChevronDown,
  Atom,
  FlaskConical,
  GripVertical,
  X,
  Pencil,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { CreateProjectModal } from "@/features/projects/components/CreateProjectModal";
import { useResearchApi } from "../../hooks/useResearchApi";
import { TemplatePicker } from "./TemplatePicker";
import { AiReviewQuotaDialog } from "./AiReviewQuotaDialog";
import type {
  AutonomyLevel,
  ResearchTemplate,
  SuggestRequest,
  SuggestApplied,
  ResearchKeyword,
  ResearchTopic,
  TopicQuotaFields,
} from "../../types";
import { keywordTemplatesFromJson } from "../../types";
import {
  getKeywords,
  getTopic,
  deleteKeyword as deleteKeywordService,
  updateKeywordText,
  updateTopicMeta,
  reorderKeywords,
  createTag,
} from "../../service";
import { useNavTree } from "@/features/agent-context/hooks/useNavTree";
import { groupProjectsByOrgDisplay } from "@/features/agent-context/utils/groupProjectsByOrgDisplay";
import { isPersonalPseudoOrgId } from "@/features/agent-context/redux/hierarchySlice";
import { formatOrgDisplayName } from "@/features/scopes/utils/formatOrgDisplayName";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateNavTree } from "@/features/agent-context/redux/hierarchySlice";
import TextArrayInput from "@/components/official/TextArrayInput";

type Mode = "manual" | "template" | "ai";

// ── AI state machine ──────────────────────────────────────────────────────────

type AiPhase =
  | { status: "idle" }
  | { status: "creating" }
  | {
      status: "suggesting";
      topicId: string;
      // Live-streaming preview parsed from the AI's content tokens.
      streamTitle: string | null;
      streamDescription: string;
      streamDescriptionComplete: boolean;
      streamKeywords: string[];
    }
  | {
      status: "reviewing";
      topicId: string;
      appliedName: string | null;
      appliedDescription: string | null;
      applied: SuggestApplied;
      // All keywords the AI suggested (kept for backfill of any rows the
      // server failed to persist due to the legacy quota bug).
      suggestedKeywords: string[];
      // Editable rows with DB ids. `null` = still loading after the stream.
      keywordRows: KeywordRow[] | null;
      // True once the user clicks "Start Research"; UI keeps the review
      // canvas mounted so the navigation feels continuous.
      isLaunching: boolean;
      /** Live topic quota ladder — editable before launch. */
      quotas: TopicQuotaFields;
    }
  | { status: "error"; topicId: string | null; message: string };

// ── Streaming JSON field parsers ──────────────────────────────────────────────
//
// The AI streams its response as a sequence of `{ e: "c", t: "<chunk>" }`
// tokens whose concatenation is a single JSON object:
//   { "title": "...", "description": "...", "suggested_keywords": [...] }
//
// We can't `JSON.parse` partial JSON, so these helpers walk the buffer and
// extract whatever is available so the UI can update live as each chunk lands.

function parsePartialString(
  buffer: string,
  fieldName: string,
): { value: string; complete: boolean } | null {
  const re = new RegExp(`"${fieldName}"\\s*:\\s*"`);
  const match = re.exec(buffer);
  if (!match) return null;
  let i = match.index + match[0].length;
  let value = "";
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === "\\" && i + 1 < buffer.length) {
      const next = buffer[i + 1];
      switch (next) {
        case "n":
          value += "\n";
          break;
        case "t":
          value += "\t";
          break;
        case "r":
          value += "\r";
          break;
        case '"':
          value += '"';
          break;
        case "\\":
          value += "\\";
          break;
        case "/":
          value += "/";
          break;
        default:
          value += next;
      }
      i += 2;
    } else if (ch === '"') {
      return { value, complete: true };
    } else {
      value += ch;
      i += 1;
    }
  }
  return { value, complete: false };
}

function parseStringArray(buffer: string, fieldName: string): string[] {
  const re = new RegExp(`"${fieldName}"\\s*:\\s*\\[`);
  const match = re.exec(buffer);
  if (!match) return [];
  const result: string[] = [];
  let i = match.index + match[0].length;
  while (i < buffer.length) {
    while (i < buffer.length && /[\s,]/.test(buffer[i])) i += 1;
    if (i >= buffer.length || buffer[i] === "]") break;
    if (buffer[i] !== '"') break;
    i += 1;
    let value = "";
    let complete = false;
    while (i < buffer.length) {
      const ch = buffer[i];
      if (ch === "\\" && i + 1 < buffer.length) {
        const next = buffer[i + 1];
        switch (next) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case '"':
            value += '"';
            break;
          case "\\":
            value += "\\";
            break;
          default:
            value += next;
        }
        i += 2;
      } else if (ch === '"') {
        complete = true;
        i += 1;
        break;
      } else {
        value += ch;
        i += 1;
      }
    }
    if (!complete) break;
    result.push(value);
  }
  return result;
}

// NDJSON stream consumption now goes through `parseNdjsonStream` from
// `@/lib/api/stream-parser` — the platform-wide primitive. The legacy
// inline `readJsonlStream` (with verbose debug logging) was replaced
// because every NDJSON consumer should share the same backpressure-safe
// reader; per-feature ones are now banned.
//
// Key wire-format note: the platform parser auto-expands compact chunk
// events of the form `{ e: "c", t: "..." }` into the standard envelope
// `{ event: "chunk", data: { text: "..." } }`. The suggestion consumer
// below reads chunks via the new envelope.
import { parseNdjsonStream } from "@/lib/api/stream-parser";

// ── Step dots ─────────────────────────────────────────────────────────────────

function StepDots({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3 mb-8">
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            step >= 1 ? "bg-primary" : "bg-border",
          )}
        />
        <div
          className={cn("h-px w-10", step >= 2 ? "bg-primary/50" : "bg-border")}
        />
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            step >= 2 ? "bg-primary" : "bg-border",
          )}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {step} / 2
      </span>
    </div>
  );
}

// ── Project list (shared) ─────────────────────────────────────────────────────

interface ProjectListProps {
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
  onCreateInOrg: (orgId: string) => void;
  isLoading: boolean;
  projectsByOrg: {
    org: { id: string; name: string };
    projects: { id: string; name: string; org_id: string }[];
  }[];
  flatProjects: { id: string; name: string; org_id: string }[];
  orgsForCreate: { id: string; name: string }[];
}

function ProjectOrgHeader({
  orgName,
  onCreate,
}: {
  orgName: string;
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-2 pb-0.5">
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{orgName}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Create project in ${orgName}`}
        onClick={onCreate}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ProjectList({
  selectedId,
  onSelect,
  onCreateInOrg,
  isLoading,
  projectsByOrg,
  flatProjects,
  orgsForCreate,
}: ProjectListProps) {
  return (
    <div className="space-y-1.5">
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : flatProjects.length === 0 ? (
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground text-center">
            No projects yet. Create one in an organization.
          </p>
          <div className="space-y-1">
            {orgsForCreate.map((org) => (
              <ProjectOrgHeader
                key={org.id}
                orgName={org.name}
                onCreate={() => onCreateInOrg(org.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        projectsByOrg.map(({ org, projects }) => (
          <div key={org.id} className="space-y-1.5">
            <ProjectOrgHeader
              orgName={org.name}
              onCreate={() => onCreateInOrg(org.id)}
            />
            {projects.map((project) => {
              const isSelected = selectedId === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onSelect(project.id, project.name)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border p-4 text-left text-foreground transition-all duration-150",
                    isSelected
                      ? "border-primary/40 bg-primary/5 shadow-sm"
                      : "border-border/60 bg-card hover:border-primary/20 hover:bg-muted/40",
                  )}
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isSelected ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <FolderOpen className="h-4 w-4" />
                    )}
                  </div>
                  <span className="font-medium text-sm text-foreground">
                    {project.name}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

// ── EditableText ──────────────────────────────────────────────────────────────
//
// Hover-revealed pencil. Click to edit inline; Enter/blur commits, Esc cancels.
// Used for both the topic title (single-line) and the description (multi-line).

interface EditableTextProps {
  value: string;
  onCommit: (next: string) => Promise<void> | void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  /** Empty fallback rendered when `value` is empty AND the field is not being edited. */
  emptyFallback?: React.ReactNode;
  /** When false, allows committing an empty value (only used by description). */
  required?: boolean;
}

function EditableText({
  value,
  onCommit,
  multiline = false,
  className,
  placeholder,
  emptyFallback,
  required = true,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const start = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    }, 0);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    const next = draft;
    if (required && !next.trim()) {
      cancel();
      return;
    }
    if (next === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onCommit(next);
      setEditing(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Could not save changes");
      cancel();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return multiline ? (
      <ProTextarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        disabled={busy}
        autoGrow
        minHeight={100}
        maxHeight={240}
        className={cn(
          "text-base sm:text-lg leading-relaxed text-foreground",
          className,
        )}
        placeholder={placeholder}
        wrapperClassName="w-full"
      />
    ) : (
      <ProInput
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        disabled={busy}
        className={cn(
          "h-auto py-2 text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground",
          className,
        )}
        placeholder={placeholder}
        wrapperClassName="w-full"
        showCopyButton={false}
      />
    );
  }

  const isEmpty = !value.trim();

  return (
    <div className="group/edit relative">
      {isEmpty && emptyFallback ? (
        <div onClick={start} className="cursor-text">
          {emptyFallback}
        </div>
      ) : multiline ? (
        <p
          onClick={start}
          className={cn(
            "cursor-text rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-muted/40 text-foreground",
            className,
          )}
        >
          {value}
        </p>
      ) : (
        <h2
          onClick={start}
          className={cn(
            "cursor-text rounded-md -mx-2 px-2 py-1 transition-colors hover:bg-muted/40 text-foreground",
            className,
          )}
        >
          {value}
        </h2>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          start();
        }}
        className="absolute -right-1 top-1 opacity-0 group-hover/edit:opacity-100 focus:opacity-100 transition-opacity h-7 w-7 rounded-md bg-background/80 backdrop-blur border border-border/60 flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Edit"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── KeywordEditor ─────────────────────────────────────────────────────────────
//
// Drag-reorderable, inline-editable, deletable list with always-visible draft
// input at the bottom. The parent owns persistence; this component is fully
// controlled and signals all mutations through callbacks.
// Reorder is local-only until the DB grows a `position` column.

interface KeywordRow {
  localId: string;
  dbId: string | null; // null = optimistically added, not yet persisted
  value: string;
  pending: boolean; // an in-flight backend write
}

let kwRowCounter = 0;
const genKwRowId = () => `kw-${++kwRowCounter}`;

function quotasFromTopic(topic: ResearchTopic): TopicQuotaFields {
  return {
    max_keywords: topic.max_keywords,
    scrapes_per_keyword: topic.scrapes_per_keyword,
    analyses_per_keyword: topic.analyses_per_keyword,
    max_keyword_syntheses: topic.max_keyword_syntheses,
    max_project_syntheses: topic.max_project_syntheses,
    max_documents: topic.max_documents,
    max_tag_consolidations: topic.max_tag_consolidations,
    max_auto_tag_calls: topic.max_auto_tag_calls,
  };
}

function provisionalQuotas(maxKeywords: number): TopicQuotaFields {
  return {
    max_keywords: maxKeywords,
    scrapes_per_keyword: 5,
    analyses_per_keyword: 3,
    max_keyword_syntheses: 3,
    max_project_syntheses: 1,
    max_documents: 1,
    max_tag_consolidations: 0,
    max_auto_tag_calls: 0,
  };
}

async function persistUnsavedKeywordsWithinQuota(
  topicId: string,
  rows: KeywordRow[],
  maxKeywords: number,
  addKeywords: (
    topicId: string,
    body: { keywords: string[] },
  ) => Promise<Response>,
): Promise<KeywordRow[]> {
  const withinQuota = rows.slice(0, maxKeywords).filter((r) => !r.dbId);
  if (withinQuota.length === 0) return rows;

  await addKeywords(topicId, {
    keywords: withinQuota.map((r) => r.value),
  });
  const persisted = await getKeywords(topicId);
  const lookup = new Map(persisted.map((k) => [k.keyword.toLowerCase(), k.id]));
  return rows.map((r) => {
    if (r.dbId) return r;
    const id = lookup.get(r.value.toLowerCase());
    return id ? { ...r, dbId: id } : r;
  });
}

interface KeywordEditorProps {
  rows: KeywordRow[];
  maxKeywords: number;
  onAdd: (value: string) => void;
  onRemove: (row: KeywordRow) => void;
  onRename: (row: KeywordRow, next: string) => void;
  onReorder: (rows: KeywordRow[]) => void;
}

function KeywordEditor({
  rows,
  maxKeywords,
  onAdd,
  onRemove,
  onRename,
  onReorder,
}: KeywordEditorProps) {
  const [draft, setDraft] = useState("");
  // Track keywords that arrived during this session so we stagger their
  // appearance on first render only.
  const seenIds = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = rows.findIndex((r) => r.localId === active.id);
    const newIdx = rows.findIndex((r) => r.localId === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(rows, oldIdx, newIdx));
  };

  const submitDraft = () => {
    const value = draft.trim();
    if (!value) return;
    if (rows.some((r) => r.value.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onAdd(value);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={rows.map((r) => r.localId)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-1.5">
            {rows.map((row, i) => {
              const isFirstRender = !seenIds.current.has(row.localId);
              if (isFirstRender) seenIds.current.add(row.localId);
              return (
                <SortableKeywordRow
                  key={row.localId}
                  row={row}
                  overQuota={i >= maxKeywords}
                  animate={isFirstRender}
                  delayMs={isFirstRender ? i * 50 : 0}
                  onRename={(next) => onRename(row, next)}
                  onRemove={() => onRemove(row)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {/* Add new */}
      <div
        className={cn(
          "group flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 transition-colors",
          "focus-within:border-primary focus-within:bg-muted/50 hover:border-primary/50",
        )}
      >
        <Plus className="h-4 w-4 text-muted-foreground group-focus-within:text-primary shrink-0 transition-colors" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submitDraft();
            }
          }}
          placeholder="Add a keyword…"
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base text-foreground placeholder:text-muted-foreground/60"
          style={{ fontSize: "16px" }}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={submitDraft}
            className="text-xs font-medium text-primary hover:text-primary/80 px-2 py-0.5 rounded transition-colors"
          >
            Add
          </button>
        )}
      </div>
    </div>
  );
}

interface SortableKeywordRowProps {
  row: KeywordRow;
  overQuota: boolean;
  animate: boolean;
  delayMs: number;
  onRename: (next: string) => void;
  onRemove: () => void;
}

function SortableKeywordRow({
  row,
  overQuota,
  animate,
  delayMs,
  onRename,
  onRemove,
}: SortableKeywordRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.localId });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(row.value);
  }, [row.value, editing]);

  const startEdit = () => {
    setDraft(row.value);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const commitEdit = () => {
    const next = draft.trim();
    if (!next) {
      setDraft(row.value);
      setEditing(false);
      return;
    }
    if (next !== row.value) onRename(next);
    setEditing(false);
  };

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(animate ? { animationDelay: `${delayMs}ms` } : {}),
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors",
        overQuota
          ? "border-destructive/50 bg-destructive/10 hover:border-destructive/70 hover:bg-destructive/15"
          : "border-border bg-muted hover:border-primary/40 hover:bg-muted/80",
        editing &&
          (overQuota
            ? "border-destructive/70 bg-destructive/15"
            : "border-primary bg-background ring-1 ring-primary/20"),
        isDragging && "shadow-md z-10",
        animate &&
          "animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-300 fill-mode-both",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="h-7 w-5 flex items-center justify-center text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft(row.value);
              setEditing(false);
            }
          }}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-base font-medium text-foreground"
          style={{ fontSize: "16px" }}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className={cn(
            "flex-1 min-w-0 text-left text-base font-medium leading-tight py-0.5 truncate transition-colors",
            overQuota
              ? "text-destructive hover:text-destructive/80"
              : "text-foreground hover:text-primary",
          )}
        >
          {row.value}
        </button>
      )}

      {row.pending && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60 shrink-0" />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
        aria-label="Remove keyword"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ── AI Canvas ─────────────────────────────────────────────────────────────────
//
// Single component for both the streaming-in-progress and the final review
// states. The visual language is intentionally restrained — large refined
// typography, a thin accent rule, content-first layout, no emoji-tier icons.

interface AiCanvasProps {
  variant: "creating" | "streaming" | "review";
  // Content (any of these may be null/empty during streaming):
  title: string | null;
  description: string;
  descriptionStreaming: boolean; // shows blinking cursor at end while true
  // Keywords for the streaming state (`string[]`).
  keywords: string[];
  // Persistable keyword rows for the review state (with DB ids).
  // `null` means the rows haven't been fetched yet — show a skeleton.
  reviewKeywordRows: KeywordRow[] | null;
  // Set only on `review` — kept around for future metadata display.
  applied: SuggestApplied | null;
  // Topic + keyword mutators — only used in `review`.
  onUpdateTitle?: (next: string) => Promise<void>;
  onUpdateDescription?: (next: string) => Promise<void>;
  onAddKeyword?: (value: string) => void;
  onRemoveKeyword?: (row: KeywordRow) => void;
  onRenameKeyword?: (row: KeywordRow, next: string) => void;
  onReorderKeywords?: (rows: KeywordRow[]) => void;
  // Final actions (only used in `review` state):
  onStart?: () => void;
  onViewFirst?: () => void;
  isLaunching?: boolean;
  maxKeywords?: number;
  droppedByQuotaCount?: number;
  onOpenSettings?: () => void;
  canStart?: boolean;
}

function AiCanvas({
  variant,
  title,
  description,
  descriptionStreaming,
  keywords,
  reviewKeywordRows,
  applied,
  onUpdateTitle,
  onUpdateDescription,
  onAddKeyword,
  onRemoveKeyword,
  onRenameKeyword,
  onReorderKeywords,
  onStart,
  onViewFirst,
  isLaunching,
  maxKeywords = 5,
  droppedByQuotaCount = 0,
  onOpenSettings,
  canStart = true,
}: AiCanvasProps) {
  void applied;
  const isReview = variant === "review";
  const hasTitle = !!title;
  const hasDescription = description.length > 0;
  const hasKeywords = isReview
    ? !!reviewKeywordRows && reviewKeywordRows.length > 0
    : keywords.length > 0;
  const keywordCount = reviewKeywordRows?.length ?? 0;
  const overQuotaCount = isReview ? Math.max(0, keywordCount - maxKeywords) : 0;
  const hasQuotaConflict = isReview && overQuotaCount > 0;

  return (
    <div className="space-y-10">
      {/* Status rail — a thin coloured line + text label, no icon. */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-px w-12",
            isReview ? "bg-violet-500" : "bg-violet-500 animate-pulse",
          )}
        />
        <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-[0.18em]">
          {variant === "creating"
            ? "Initialising"
            : variant === "streaming"
              ? hasTitle
                ? "Composing"
                : "Analysing your subject"
              : "Topic ready"}
        </span>
        {!isReview && (
          <Loader2 className="h-3 w-3 animate-spin text-violet-500/70" />
        )}
      </div>

      {/* Title */}
      <div className="min-h-[3.5rem]">
        {hasTitle ? (
          isReview && onUpdateTitle ? (
            <EditableText
              value={title!}
              onCommit={onUpdateTitle}
              className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance text-foreground"
              placeholder="Untitled topic"
            />
          ) : (
            <h2
              key={title}
              className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-balance text-foreground animate-in fade-in slide-in-from-bottom-2 duration-500"
            >
              {title}
            </h2>
          )
        ) : (
          <div className="space-y-3 pt-1">
            <div className="h-7 w-3/4 rounded-md bg-muted/60 animate-pulse" />
            <div className="h-7 w-1/2 rounded-md bg-muted/40 animate-pulse" />
          </div>
        )}
      </div>

      {/* Description */}
      {(hasDescription || !hasTitle || isReview) && (
        <div className="max-w-prose">
          {isReview && onUpdateDescription ? (
            <EditableText
              value={description}
              onCommit={onUpdateDescription}
              multiline
              required={false}
              className="text-base sm:text-lg leading-relaxed text-foreground/85 text-pretty"
              placeholder="Add a description…"
              emptyFallback={
                <p className="text-base sm:text-lg leading-relaxed text-muted-foreground/60 italic">
                  Add a description…
                </p>
              }
            />
          ) : hasDescription ? (
            <p className="text-base sm:text-lg leading-relaxed text-foreground/85 text-pretty animate-in fade-in duration-300">
              {description}
              {descriptionStreaming && (
                <span className="inline-block ml-0.5 w-[2px] h-[1em] align-[-0.15em] bg-violet-500 animate-pulse" />
              )}
            </p>
          ) : hasTitle ? null : (
            <div className="space-y-2 pt-1">
              <div className="h-4 w-full rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-[92%] rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-[78%] rounded bg-muted/40 animate-pulse" />
            </div>
          )}
        </div>
      )}

      {/* Keywords — the centerpiece in review mode */}
      {isReview ? (
        <div
          className={cn(
            "rounded-2xl border p-4 sm:p-5 space-y-4",
            "animate-in fade-in duration-500 fill-mode-both",
            hasQuotaConflict
              ? "border-destructive/40 bg-destructive/[0.04]"
              : "border-border/60 bg-card",
          )}
        >
          {hasQuotaConflict && (
            <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1 min-w-0">
                <p className="font-medium leading-snug">
                  {overQuotaCount} keyword{overQuotaCount !== 1 ? "s" : ""}{" "}
                  exceed your pipeline limit ({maxKeywords} max)
                </p>
                <p className="text-xs text-destructive/90 leading-relaxed">
                  {droppedByQuotaCount > 0
                    ? `The AI suggested ${keywordCount} keywords; ${droppedByQuotaCount} were not saved because of this cap. `
                    : ""}
                  Raise the limit in Pipeline settings or remove the highlighted
                  keywords before starting research — only the first{" "}
                  {maxKeywords} run in the pipeline.
                </p>
                {onOpenSettings && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onOpenSettings}
                    className="mt-1 h-8 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Pipeline settings
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-[0.18em]">
                Keywords
              </span>
              {reviewKeywordRows && (
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    hasQuotaConflict
                      ? "text-destructive font-semibold"
                      : "text-muted-foreground/70",
                  )}
                >
                  {keywordCount} / {maxKeywords} max
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onOpenSettings && !hasQuotaConflict && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenSettings}
                  className="h-8 gap-1.5 text-muted-foreground"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Pipeline settings
                </Button>
              )}
              <span className="text-[11px] text-muted-foreground/60">
                Click to edit · drag to reorder · ✕ to remove
              </span>
            </div>
          </div>
          {reviewKeywordRows &&
          onAddKeyword &&
          onRemoveKeyword &&
          onRenameKeyword &&
          onReorderKeywords ? (
            <KeywordEditor
              rows={reviewKeywordRows}
              maxKeywords={maxKeywords}
              onAdd={onAddKeyword}
              onRemove={onRemoveKeyword}
              onRename={onRenameKeyword}
              onReorder={onReorderKeywords}
            />
          ) : (
            <div className="space-y-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 rounded-xl bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        hasKeywords && (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em]">
                Keywords
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw, i) => (
                <span
                  key={kw}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-sm font-medium",
                    "animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-300 fill-mode-both",
                    "bg-primary text-primary-foreground",
                  )}
                >
                  {kw}
                </span>
              ))}
              <span
                aria-hidden
                className="inline-flex items-center rounded-full border border-dashed border-primary/40 bg-muted/50 px-3 py-1"
              >
                <span className="flex gap-1">
                  <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1 w-1 rounded-full bg-primary animate-bounce" />
                </span>
              </span>
            </div>
          </div>
        )
      )}

      {/* Actions — only in review */}
      {isReview && onStart && onViewFirst && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 fill-mode-both">
          <Button
            onClick={onStart}
            disabled={isLaunching || !canStart}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white flex-1 sm:flex-none sm:px-7 min-h-[44px] shadow-sm shadow-violet-500/20 disabled:opacity-50"
          >
            {isLaunching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FlaskConical className="h-4 w-4" />
            )}
            Start Research
          </Button>
          {!canStart && (
            <p className="text-xs text-destructive sm:max-w-xs leading-snug">
              Resolve keyword limits before starting — remove extras or raise
              the cap in Pipeline settings.
            </p>
          )}
          <Button
            variant="outline"
            onClick={onViewFirst}
            disabled={isLaunching}
            className="min-h-[44px] gap-2"
          >
            View &amp; Edit First
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResearchInitForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const api = useResearchApi();
  const dispatch = useAppDispatch();
  const [, startTransition] = useTransition();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createProjectOrgId, setCreateProjectOrgId] = useState<string | null>(
    null,
  );
  const [showAdditionalInstructions, setShowAdditionalInstructions] =
    useState(false);

  // ── URL-derived step / mode ───────────────────────────────────────────────
  const modeParam = searchParams.get("mode") as Mode | null;
  const stepParam = searchParams.get("step");
  const currentMode = modeParam;
  // AI path only uses step 1 URL; reviewing/processing are internal states
  const currentStep: 0 | 1 | 2 = !modeParam
    ? 0
    : modeParam !== "ai" && stepParam === "2"
      ? 2
      : 1;

  // ── Form state ────────────────────────────────────────────────────────────
  const [topicName, setTopicName] = useState(searchParams.get("topic") ?? "");
  const [description, setDescription] = useState("");
  const [subjectDescription, setSubjectDescription] = useState(""); // AI: subject_name_or_description
  const [additionalInstructions, setAdditionalInstructions] = useState(""); // AI: user_input
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ResearchTemplate | null>(null);

  // ── Project state ─────────────────────────────────────────────────────────
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  // ── AI state machine ──────────────────────────────────────────────────────
  const [aiPhase, setAiPhase] = useState<AiPhase>({ status: "idle" });
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);

  // ── Hierarchy data ────────────────────────────────────────────────────────
  const { orgs, flatProjects, isLoading: projectsLoading } = useNavTree();
  const projectsByOrg = groupProjectsByOrgDisplay(orgs, flatProjects);
  const orgsForCreate = orgs
    .filter((org) => !isPersonalPseudoOrgId(org.id))
    .sort((a, b) => {
      if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
      return formatOrgDisplayName(a).localeCompare(formatOrgDisplayName(b));
    })
    .map((org) => ({ id: org.id, name: formatOrgDisplayName(org) }));

  const openCreateProject = (orgId: string) => {
    setCreateProjectOrgId(orgId);
    setCreateProjectOpen(true);
  };

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goToStep = (mode: Mode, step: number) => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    if (step >= 2) params.set("step", "2");
    const topic = searchParams.get("topic");
    if (topic) params.set("topic", topic);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleModeSelect = (mode: Mode) => {
    const params = new URLSearchParams();
    params.set("mode", mode);
    const topic = searchParams.get("topic");
    if (topic) params.set("topic", topic);
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleContinue = () => {
    if (!currentMode) return;
    setError(null);
    goToStep(currentMode, 2);
  };

  const handleBack = () => {
    setError(null);
    // If AI is in processing state, reset to idle (stay on same URL)
    if (currentMode === "ai" && aiPhase.status !== "idle") {
      setAiPhase({ status: "idle" });
      return;
    }
    router.back();
  };

  // ── Template handling ─────────────────────────────────────────────────────
  const handleTemplateSelect = (template: ResearchTemplate | null) => {
    setSelectedTemplate(template);
    if (template) {
      const kws = keywordTemplatesFromJson(template.keyword_templates);
      if (kws.length > 0) setSelectedKeywords(Array.from(new Set(kws)));
    }
  };

  // ── Manual / Template submit ──────────────────────────────────────────────
  const handleManualSubmit = () => {
    const name = topicName.trim();
    if (!name) {
      setError("Please provide a topic name.");
      return;
    }
    if (!selectedProjectId) {
      setError("Please select a project.");
      return;
    }
    if (currentMode === "manual" && selectedKeywords.length < 1) {
      setError("Add at least one keyword to continue.");
      return;
    }
    setError(null);

    const autonomyLevel: AutonomyLevel = "semi";

    startTransition(async () => {
      try {
        const response = await api.createTopic(selectedProjectId, {
          name,
          description: description.trim() || null,
          autonomy_level: autonomyLevel,
          template_id: selectedTemplate?.id ?? null,
        });
        const topic: { id: string } = await response.json();

        if (selectedKeywords.length > 0) {
          await api.addKeywords(topic.id, { keywords: selectedKeywords });
        }

        // Seed the template's default tags. Each insert is isolated so a
        // tag-seeding failure NEVER blocks topic creation or navigation.
        if (selectedTemplate) {
          const raw = selectedTemplate.default_tags;
          const tagNames = Array.isArray(raw)
            ? raw.filter(
                (t): t is string =>
                  typeof t === "string" && t.trim().length > 0,
              )
            : [];
          for (const name of tagNames) {
            try {
              await createTag(topic.id, { name });
            } catch (tagErr) {
              console.warn("[research] template tag seed failed", name, tagErr);
            }
          }
        }

        router.push(`/research/topics/${topic.id}`);
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  // ── AI submit (sequential: create → suggest → review) ────────────────────
  const handleAiSubmit = async () => {
    if (!selectedProjectId) {
      setError("Please select a project.");
      return;
    }
    if (!subjectDescription.trim()) {
      setError("Please describe your research subject.");
      return;
    }
    setError(null);

    setAiPhase({ status: "creating" });

    try {
      // Step 1: Create placeholder topic with the raw user input as name
      const createRes = await api.createTopic(selectedProjectId, {
        name: subjectDescription.trim(),
        autonomy_level: "auto",
        template_id: null,
      });
      if (!createRes.ok) {
        const body = await createRes.text();
        throw new Error(`Failed to create topic: ${body}`);
      }
      const topic: { id: string } = await createRes.json();
      const topicId = topic.id;

      setAiPhase({
        status: "suggesting",
        topicId,
        streamTitle: null,
        streamDescription: "",
        streamDescriptionComplete: false,
        streamKeywords: [],
      });

      // Step 2: Stream suggest WITH topic_id so backend auto-applies results
      const suggestBody: SuggestRequest = {
        subject_name_or_description: subjectDescription.trim(),
        topic_id: topicId,
        use_user_agent_overrides: false,
      };
      if (additionalInstructions.trim()) {
        suggestBody.user_input = additionalInstructions.trim();
      }

      console.log("[suggest-stream] sending request", suggestBody);
      const suggestRes = await api.suggest(suggestBody);
      if (!suggestRes.ok) {
        const body = await suggestRes.text();
        console.error("[suggest-stream] non-ok response", {
          status: suggestRes.status,
          body,
        });
        throw new Error(`AI analysis failed: ${body}`);
      }

      // Collect stream events.
      //
      // The backend emits NDJSON with two envelope shapes:
      //   • Control events: { event: "<name>", data: {...} }
      //       e.g. event="phase" | "record_reserved" | "record_update" |
      //            "heartbeat" | "info" | "end"
      //       …and event="data" with an inner data.type discriminator:
      //         data.type="conversation_labeled" | "suggest_complete" |
      //                   "suggest_applied"
      //   • Content tokens: { e: "c", t: "<chunk>" }  (streamed JSON chunks
      //       from the assistant — we ignore these here, they're rendered
      //       elsewhere if needed)
      //
      // The two pieces we care about for review UI:
      //   1. "suggest_complete" — carries final title + description + keywords
      //   2. "suggest_applied"  — carries what the backend actually persisted
      //                           (after dedup/quota), shape = SuggestApplied
      let appliedName: string | null = null;
      let appliedDescription: string | null = null;
      let applied: SuggestApplied | null = null;
      let suggestedKeywords: string[] = [];
      let contentBuffer = ""; // accumulates streaming chunk text
      const eventTypes: Record<string, number> = {};

      const { events: suggestEvents } = parseNdjsonStream(suggestRes);
      for await (const ev of suggestEvents) {
        // The parser already expanded compact `{e:"c", t:"..."}` lines
        // into `{event: "chunk", data: {text}}` envelopes, so we
        // dispatch only on `ev.event`.
        const innerKey =
          ev.event === "data" &&
          ev.data &&
          typeof (ev.data as Record<string, unknown>).type === "string"
            ? `data:${(ev.data as Record<string, unknown>).type as string}`
            : ev.event;
        eventTypes[innerKey] = (eventTypes[innerKey] ?? 0) + 1;

        // Live-streaming preview from content tokens.
        if (ev.event === "chunk" && typeof ev.data.text === "string") {
          contentBuffer += ev.data.text;
          const titleField = parsePartialString(contentBuffer, "title");
          const descField = parsePartialString(contentBuffer, "description");
          const kws = parseStringArray(contentBuffer, "suggested_keywords");
          setAiPhase((prev) => {
            if (prev.status !== "suggesting") return prev;
            return {
              ...prev,
              streamTitle:
                titleField && titleField.complete ? titleField.value : null,
              streamDescription: descField?.value ?? "",
              streamDescriptionComplete: !!descField?.complete,
              streamKeywords: kws,
            };
          });
        }

        if (ev.event === "data" && ev.data && typeof ev.data === "object") {
          const inner = ev.data as Record<string, unknown>;
          if (inner.type === "suggest_complete") {
            if (typeof inner.title === "string") appliedName = inner.title;
            if (typeof inner.description === "string") {
              appliedDescription = inner.description;
            }
            if (Array.isArray(inner.suggested_keywords)) {
              suggestedKeywords = inner.suggested_keywords.filter(
                (k): k is string => typeof k === "string",
              );
            }
          }
          if (inner.type === "suggest_applied") {
            applied = inner as unknown as SuggestApplied;
          }
        }
      }

      console.log("[suggest-stream] aggregation complete", {
        eventTypes,
        appliedName,
        appliedDescription,
        applied,
        suggestedKeywords,
      });

      if (!applied) {
        console.error(
          "[suggest-stream] no suggest_applied event was received",
          { eventTypes },
        );
        throw new Error(
          "AI did not return suggestions. The topic was created — you can find it in your topic list.",
        );
      }

      // If the backend never sent the `suggest_complete` envelope (e.g. the
      // response was truncated) fall back to anything we managed to parse out
      // of the streamed content tokens, plus the persisted keyword sets.
      const fallbackKeywords = parseStringArray(
        contentBuffer,
        "suggested_keywords",
      );
      const finalSuggestedKeywords =
        suggestedKeywords.length > 0
          ? suggestedKeywords
          : fallbackKeywords.length > 0
            ? fallbackKeywords
            : [
                ...applied.keywords_saved,
                ...applied.keywords_dropped_by_quota,
                ...applied.keywords_skipped_duplicate,
              ];

      setAiPhase({
        status: "reviewing",
        topicId,
        appliedName,
        appliedDescription,
        applied,
        suggestedKeywords: finalSuggestedKeywords,
        keywordRows: null,
        isLaunching: false,
        quotas: provisionalQuotas(applied.max_keywords ?? 3),
      });
    } catch (err) {
      setAiPhase((prev) => ({
        status: "error",
        topicId:
          "topicId" in prev ? (prev as { topicId: string }).topicId : null,
        message: (err as Error).message,
      }));
    }
  };

  // ── AI review actions ─────────────────────────────────────────────────────
  const handleStartResearch = async () => {
    if (aiPhase.status !== "reviewing") return;
    const { topicId, keywordRows, quotas } = aiPhase;
    if (!keywordRows || keywordRows.length === 0) {
      toast.error("Add at least one keyword before starting.");
      return;
    }
    if (keywordRows.length > quotas.max_keywords) {
      toast.error(
        `Remove ${keywordRows.length - quotas.max_keywords} keyword(s) or raise the pipeline limit.`,
      );
      return;
    }

    setAiPhase({ ...aiPhase, isLaunching: true });
    try {
      const persisted = await persistUnsavedKeywordsWithinQuota(
        topicId,
        keywordRows,
        quotas.max_keywords,
        api.addKeywords,
      );
      setAiPhase((prev) =>
        prev.status === "reviewing" && prev.topicId === topicId
          ? { ...prev, keywordRows: persisted }
          : prev,
      );
      startTransition(() => {
        api.runPipeline(topicId).catch(() => {});
        router.push(`/research/topics/${topicId}`);
      });
    } catch (err) {
      toast.error((err as Error).message ?? "Could not save keywords.");
      setAiPhase((prev) =>
        prev.status === "reviewing" ? { ...prev, isLaunching: false } : prev,
      );
    }
  };

  const handleQuotasSaved = async (next: TopicQuotaFields) => {
    if (aiPhase.status !== "reviewing") return;
    const { topicId, keywordRows } = aiPhase;
    setAiPhase((prev) =>
      prev.status === "reviewing" ? { ...prev, quotas: next } : prev,
    );

    if (!keywordRows) return;
    try {
      const persisted = await persistUnsavedKeywordsWithinQuota(
        topicId,
        keywordRows,
        next.max_keywords,
        api.addKeywords,
      );
      setAiPhase((prev) =>
        prev.status === "reviewing" && prev.topicId === topicId
          ? { ...prev, keywordRows: persisted, quotas: next }
          : prev,
      );
    } catch (err) {
      toast.error((err as Error).message ?? "Could not save keywords.");
    }
  };

  const handleViewTopicFirst = () => {
    if (aiPhase.status !== "reviewing" && aiPhase.status !== "error") return;
    const topicId = aiPhase.topicId;
    if (topicId) router.push(`/research/topics/${topicId}`);
  };

  // ── Keyword editor — load + CRUD handlers ─────────────────────────────────
  //
  // Once the stream finishes and we transition to `reviewing`, we load the
  // topic quota ladder and hydrate keyword rows for every AI suggestion.
  // Keywords the backend dropped due to max_keywords stay visible (red styling)
  // until the user raises the cap or removes them — we do not silently backfill.
  useEffect(() => {
    if (aiPhase.status !== "reviewing" || aiPhase.keywordRows !== null) return;
    let cancelled = false;
    const topicId = aiPhase.topicId;
    const aiOrder = aiPhase.suggestedKeywords;
    (async () => {
      try {
        const [topic, persisted] = await Promise.all([
          getTopic(topicId),
          getKeywords(topicId),
        ]);
        if (cancelled) return;

        const quotas = topic ? quotasFromTopic(topic) : aiPhase.quotas;

        const byKeyword = new Map<string, ResearchKeyword>();
        for (const k of persisted) byKeyword.set(k.keyword.toLowerCase(), k);

        const rows: KeywordRow[] = [];
        for (const kw of aiOrder) {
          const match = byKeyword.get(kw.toLowerCase());
          if (match) {
            rows.push({
              localId: genKwRowId(),
              dbId: match.id,
              value: match.keyword,
              pending: false,
            });
            byKeyword.delete(kw.toLowerCase());
          } else {
            rows.push({
              localId: genKwRowId(),
              dbId: null,
              value: kw,
              pending: false,
            });
          }
        }
        for (const remaining of byKeyword.values()) {
          rows.push({
            localId: genKwRowId(),
            dbId: remaining.id,
            value: remaining.keyword,
            pending: false,
          });
        }

        setAiPhase((prev) =>
          prev.status === "reviewing" && prev.topicId === topicId
            ? { ...prev, keywordRows: rows, quotas }
            : prev,
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[review] failed to load keywords", err);
        setAiPhase((prev) =>
          prev.status === "reviewing" && prev.topicId === topicId
            ? { ...prev, keywordRows: [] }
            : prev,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiPhase, api]);

  const setKeywordRows = (
    updater: (prev: KeywordRow[]) => KeywordRow[],
  ): void => {
    setAiPhase((prev) => {
      if (prev.status !== "reviewing" || prev.keywordRows === null) return prev;
      return { ...prev, keywordRows: updater(prev.keywordRows) };
    });
  };

  const handleAddKeyword = (value: string) => {
    if (aiPhase.status !== "reviewing") return;
    const topicId = aiPhase.topicId;
    const maxKeywords = aiPhase.quotas.max_keywords;
    const localId = genKwRowId();
    const optimistic: KeywordRow = {
      localId,
      dbId: null,
      value,
      pending: true,
    };
    setKeywordRows((prev) => [...prev, optimistic]);

    const nextIndex = aiPhase.keywordRows?.length ?? 0;
    if (nextIndex >= maxKeywords) {
      setKeywordRows((prev) =>
        prev.map((r) => (r.localId === localId ? { ...r, pending: false } : r)),
      );
      return;
    }

    (async () => {
      try {
        await api.addKeywords(topicId, { keywords: [value] });
        const persisted = await getKeywords(topicId);
        const lookup = new Map(persisted.map((k) => [k.keyword, k.id]));
        setKeywordRows((prev) =>
          prev.map((r) =>
            r.localId === localId
              ? {
                  ...r,
                  dbId: lookup.get(value) ?? r.dbId,
                  pending: false,
                }
              : r,
          ),
        );
      } catch (err) {
        toast.error((err as Error).message ?? "Could not add keyword");
        setKeywordRows((prev) => prev.filter((r) => r.localId !== localId));
      }
    })();
  };

  const handleRemoveKeyword = (row: KeywordRow) => {
    setKeywordRows((prev) => prev.filter((r) => r.localId !== row.localId));
    if (!row.dbId) return;
    (async () => {
      try {
        await deleteKeywordService(row.dbId!);
      } catch (err) {
        toast.error((err as Error).message ?? "Could not remove keyword");
        setKeywordRows((prev) => [...prev, row]);
      }
    })();
  };

  const handleRenameKeyword = (row: KeywordRow, next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === row.value) return;
    setKeywordRows((prev) =>
      prev.map((r) =>
        r.localId === row.localId ? { ...r, value: trimmed, pending: true } : r,
      ),
    );
    (async () => {
      try {
        if (row.dbId) await updateKeywordText(row.dbId, trimmed);
        setKeywordRows((prev) =>
          prev.map((r) =>
            r.localId === row.localId ? { ...r, pending: false } : r,
          ),
        );
      } catch (err) {
        toast.error((err as Error).message ?? "Could not rename keyword");
        setKeywordRows((prev) =>
          prev.map((r) =>
            r.localId === row.localId
              ? { ...r, value: row.value, pending: false }
              : r,
          ),
        );
      }
    })();
  };

  const handleReorderKeywords = (rows: KeywordRow[]) => {
    if (aiPhase.status !== "reviewing") return;
    const topicId = aiPhase.topicId;
    // Optimistic local update.
    const previousRows =
      aiPhase.keywordRows !== null ? [...aiPhase.keywordRows] : null;
    setKeywordRows(() => rows);
    // Persist server-side: every row that already exists in the DB is
    // included in the order array, in 1-indexed positions matching the UI.
    const persistedIds = rows
      .map((r) => r.dbId)
      .filter((id): id is string => Boolean(id));
    if (persistedIds.length === 0) return;
    (async () => {
      try {
        await reorderKeywords(topicId, persistedIds);
      } catch (err) {
        toast.error((err as Error).message ?? "Could not save keyword order");
        if (previousRows) setKeywordRows(() => previousRows);
      }
    })();
  };

  // ── Topic metadata mutators ────────────────────────────────────────────────
  const handleUpdateTitle = async (next: string) => {
    if (aiPhase.status !== "reviewing") return;
    const trimmed = next.trim();
    if (!trimmed) return;
    const topicId = aiPhase.topicId;
    await updateTopicMeta(topicId, { name: trimmed });
    setAiPhase((prev) =>
      prev.status === "reviewing" && prev.topicId === topicId
        ? { ...prev, appliedName: trimmed }
        : prev,
    );
  };

  const handleUpdateDescription = async (next: string) => {
    if (aiPhase.status !== "reviewing") return;
    const topicId = aiPhase.topicId;
    const value = next.trim().length > 0 ? next.trim() : null;
    await updateTopicMeta(topicId, { description: value });
    setAiPhase((prev) =>
      prev.status === "reviewing" && prev.topicId === topicId
        ? { ...prev, appliedDescription: value }
        : prev,
    );
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const canContinue =
    currentStep === 1
      ? currentMode === "manual"
        ? topicName.trim().length > 0 && selectedKeywords.length >= 1
        : currentMode === "template"
          ? selectedTemplate !== null && topicName.trim().length > 0
          : /* ai step 1 */ subjectDescription.trim().length > 10
      : /* step 2 manual/template */ !!selectedProjectId;

  const aiIsProcessing =
    aiPhase.status === "creating" ||
    aiPhase.status === "suggesting" ||
    (aiPhase.status === "reviewing" && aiPhase.isLaunching);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-start min-h-full py-10 px-4 sm:px-6 text-foreground">
      {/* ── Step 0: Mode Selection ── */}
      {currentStep === 0 && (
        <div className="w-full max-w-2xl space-y-10">
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Start a Research Topic
            </h1>
            <p className="text-muted-foreground text-lg">
              How would you like to approach this?
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => handleModeSelect("manual")}
              className="group relative flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground transition-all duration-200 hover:border-blue-500/40 hover:bg-blue-500/5 hover:shadow-lg min-h-[210px]"
            >
              <div className="h-11 w-11 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                <Hand className="h-5 w-5 text-blue-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">
                  I&apos;ll build it myself
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Define your topic name and keywords precisely.
                </p>
              </div>
              <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              type="button"
              onClick={() => handleModeSelect("template")}
              className="group relative flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/5 hover:shadow-lg min-h-[210px]"
            >
              <div className="h-11 w-11 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                <LayoutTemplate className="h-5 w-5 text-amber-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">
                  I&apos;ll use a template
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Pre-built keyword sets for common research types.
                </p>
              </div>
              <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <button
              type="button"
              onClick={() => handleModeSelect("ai")}
              className="group relative flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-6 text-left text-foreground transition-all duration-200 hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-lg min-h-[210px]"
            >
              <div className="h-11 w-11 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
                <Atom className="h-5 w-5 text-violet-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-foreground">
                  Help me shape this
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Describe your subject. AI structures the research.
                </p>
              </div>
              <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-violet-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1a: Manual ── */}
      {currentStep === 1 && currentMode === "manual" && (
        <div className="w-full max-w-2xl">
          <StepDots step={1} />
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Hand className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                  Manual
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                What are you researching?
              </h1>
              <p className="text-muted-foreground">
                Give your topic a name and add the keywords you want to track.
              </p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Topic Name
                </label>
                <ProInput
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="e.g., EV Battery Technology Trends"
                  className="h-14 text-base text-foreground px-4"
                  wrapperClassName="w-full"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Keywords
                </label>
                <p className="text-xs text-muted-foreground">
                  Add at least one. Press Enter or use commas to add multiple.
                </p>
                <TextArrayInput
                  value={selectedKeywords}
                  onChange={setSelectedKeywords}
                  placeholder="Type a keyword and press Enter…"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Description{" "}
                  <span className="font-normal text-xs">(optional)</span>
                </label>
                <ProTextarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief context about what this research covers…"
                  autoGrow
                  minHeight={60}
                  maxHeight={160}
                  className="text-base text-foreground"
                  wrapperClassName="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 1b: Template ── */}
      {currentStep === 1 && currentMode === "template" && (
        <div className="w-full max-w-2xl">
          <StepDots step={1} />
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <LayoutTemplate className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  Template
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Choose a template
              </h1>
              <p className="text-muted-foreground">
                Templates pre-fill keywords for common research types.
              </p>
            </div>

            <TemplatePicker
              selected={selectedTemplate}
              onSelect={handleTemplateSelect}
            />

            {selectedTemplate && (
              <div className="space-y-4 pt-4 border-t border-border/60">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Topic Name
                  </label>
                  <ProInput
                    value={topicName}
                    onChange={(e) => setTopicName(e.target.value)}
                    placeholder={`e.g., ${selectedTemplate.name} — Q2 2026`}
                    className="h-14 text-base text-foreground px-4"
                    wrapperClassName="w-full"
                    autoFocus
                  />
                </div>
                {selectedKeywords.length > 0 && (
                  <div className="rounded-xl bg-muted/50 border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Keywords from template
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-xs font-medium"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Add more keywords{" "}
                    <span className="font-normal text-xs">(optional)</span>
                  </label>
                  <TextArrayInput
                    value={selectedKeywords}
                    onChange={setSelectedKeywords}
                    placeholder="Add additional keywords…"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Step 1c: AI — subject + project (combined) ── */}
      {currentStep === 1 && currentMode === "ai" && (
        <div className="w-full max-w-2xl">
          {/* Show AI state machine when processing */}
          {aiPhase.status === "creating" ? (
            <AiCanvas
              variant="creating"
              title={null}
              description=""
              descriptionStreaming={false}
              keywords={[]}
              reviewKeywordRows={null}
              applied={null}
            />
          ) : aiPhase.status === "suggesting" ? (
            <AiCanvas
              variant="streaming"
              title={aiPhase.streamTitle}
              description={aiPhase.streamDescription}
              descriptionStreaming={
                aiPhase.streamDescription.length > 0 &&
                !aiPhase.streamDescriptionComplete
              }
              keywords={aiPhase.streamKeywords}
              reviewKeywordRows={null}
              applied={null}
            />
          ) : aiPhase.status === "reviewing" ? (
            <>
              <AiCanvas
                variant="review"
                title={aiPhase.appliedName}
                description={aiPhase.appliedDescription ?? ""}
                descriptionStreaming={false}
                keywords={aiPhase.suggestedKeywords}
                reviewKeywordRows={aiPhase.keywordRows}
                applied={aiPhase.applied}
                onUpdateTitle={handleUpdateTitle}
                onUpdateDescription={handleUpdateDescription}
                onAddKeyword={handleAddKeyword}
                onRemoveKeyword={handleRemoveKeyword}
                onRenameKeyword={handleRenameKeyword}
                onReorderKeywords={handleReorderKeywords}
                onStart={handleStartResearch}
                onViewFirst={handleViewTopicFirst}
                isLaunching={aiPhase.isLaunching}
                maxKeywords={aiPhase.quotas.max_keywords}
                droppedByQuotaCount={
                  aiPhase.applied.keywords_dropped_by_quota?.length ?? 0
                }
                onOpenSettings={() => setQuotaDialogOpen(true)}
                canStart={
                  !!aiPhase.keywordRows &&
                  aiPhase.keywordRows.length > 0 &&
                  aiPhase.keywordRows.length <= aiPhase.quotas.max_keywords
                }
              />
              <AiReviewQuotaDialog
                open={quotaDialogOpen}
                onOpenChange={setQuotaDialogOpen}
                topicId={aiPhase.topicId}
                quotas={aiPhase.quotas}
                keywordCount={aiPhase.keywordRows?.length ?? 0}
                onSaved={handleQuotasSaved}
              />
            </>
          ) : aiPhase.status === "error" ? (
            <div className="space-y-6 py-8">
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-2">
                <p className="font-semibold text-destructive">
                  Something went wrong
                </p>
                <p className="text-sm text-muted-foreground">
                  {aiPhase.message}
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setAiPhase({ status: "idle" })}
                >
                  Try again
                </Button>
                {aiPhase.topicId && (
                  <Button onClick={handleViewTopicFirst}>
                    View topic anyway
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* idle — show the subject + project setup */
            <div className="space-y-8">
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Atom className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wider">
                    AI-Assisted
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                  What are you curious about?
                </h1>
                <p className="text-muted-foreground">
                  Describe your subject freely — a name, a question, or a
                  paragraph.
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Subject
                  </label>
                  <ProTextarea
                    value={subjectDescription}
                    onChange={(e) => setSubjectDescription(e.target.value)}
                    placeholder="e.g., How electric vehicle adoption is reshaping the used car market — pricing trends, consumer sentiment, and which brands are winning…"
                    autoGrow
                    minHeight={160}
                    maxHeight={320}
                    autoFocus
                    className="text-base text-foreground"
                    wrapperClassName="w-full"
                  />
                </div>

                <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    AI will handle:
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {[
                      "Polish the topic name and write a description",
                      "Generate and save relevant search keywords",
                      "The pipeline runs only when you say go",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdditionalInstructions((v) => !v)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        showAdditionalInstructions && "rotate-180",
                      )}
                    />
                    Additional instructions
                    <span className="text-xs">(optional)</span>
                  </button>
                  {showAdditionalInstructions && (
                    <div className="mt-3">
                      <ProTextarea
                        value={additionalInstructions}
                        onChange={(e) =>
                          setAdditionalInstructions(e.target.value)
                        }
                        placeholder="Any extra context, constraints, or focus areas for the AI agent…"
                        autoGrow
                        minHeight={80}
                        maxHeight={200}
                        className="text-base text-foreground"
                        wrapperClassName="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Project selection inline for AI path */}
                <div className="space-y-3 pt-2 border-t border-border/60">
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Project
                    </label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Which project should this topic live in?
                    </p>
                  </div>
                  <ProjectList
                    selectedId={selectedProjectId}
                    onSelect={(id, name) => {
                      setSelectedProjectId(id);
                      setSelectedProjectName(name);
                    }}
                    onCreateInOrg={openCreateProject}
                    isLoading={projectsLoading}
                    projectsByOrg={projectsByOrg}
                    flatProjects={flatProjects}
                    orgsForCreate={orgsForCreate}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Project Selection (manual / template) ── */}
      {currentStep === 2 &&
        (currentMode === "manual" || currentMode === "template") && (
          <div className="w-full max-w-2xl">
            <StepDots step={2} />
            <div className="space-y-8">
              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                  Choose a Project
                </h1>
                <p className="text-muted-foreground">
                  Research topics live inside a project.
                </p>
              </div>

              {/* Topic summary */}
              <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                  Creating topic
                </p>
                <p className="font-semibold text-foreground">
                  {topicName || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedKeywords.length} keyword
                  {selectedKeywords.length !== 1 ? "s" : ""}
                  {selectedTemplate ? ` · ${selectedTemplate.name}` : ""} ·
                  semi-automated
                </p>
              </div>

              <ProjectList
                selectedId={selectedProjectId}
                onSelect={(id, name) => {
                  setSelectedProjectId(id);
                  setSelectedProjectName(name);
                }}
                onCreateInOrg={openCreateProject}
                isLoading={projectsLoading}
                projectsByOrg={projectsByOrg}
                flatProjects={flatProjects}
                orgsForCreate={orgsForCreate}
              />
            </div>
          </div>
        )}

      {/* ── Error ── */}
      {error && (
        <div className="w-full max-w-2xl mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Navigation ── */}
      {currentStep > 0 &&
        !aiIsProcessing &&
        aiPhase.status !== "reviewing" &&
        aiPhase.status !== "error" && (
          <div className="w-full max-w-2xl flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="gap-2 min-h-[44px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {currentMode === "ai" ? (
              /* AI path: single-step, the CTA triggers the state machine */
              <Button
                onClick={handleAiSubmit}
                disabled={!canContinue || !selectedProjectId}
                className="gap-2 min-h-[44px] bg-violet-600 hover:bg-violet-700 text-white px-6 shadow-sm shadow-violet-500/20"
              >
                <Atom className="h-4 w-4" />
                Build with AI
              </Button>
            ) : currentStep === 1 ? (
              <Button
                onClick={handleContinue}
                disabled={!canContinue}
                className="gap-2 min-h-[44px]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleManualSubmit}
                disabled={!canContinue}
                className="gap-2 min-h-[44px] px-6"
              >
                Create Topic
              </Button>
            )}
          </div>
        )}

      <CreateProjectModal
        isOpen={createProjectOpen}
        onClose={() => {
          setCreateProjectOpen(false);
          setCreateProjectOrgId(null);
        }}
        organizationId={createProjectOrgId}
        redirectOnSuccess={false}
        onSuccess={(project) => {
          dispatch(invalidateNavTree());
          setSelectedProjectId(project.id);
          setSelectedProjectName(project.name);
          setCreateProjectOpen(false);
          setCreateProjectOrgId(null);
        }}
      />
    </div>
  );
}
