"use client";

import { RichContent } from "@/components/rich-content/RichContent";
import Link from "next/link";
import { initialOutlineExpansion, outlineIndentLevel, studyGuideOutlineItems, studyGuideOutlineTitle, toggleOutlineSection, visibleOutlineItems } from "../outline";
import { OutlineHeader } from "./OutlineHeader";
import { StudyFlashcardLinks } from "./StudyFlashcardLinks";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Panel, type Layout } from "react-resizable-panels";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  LayoutPanelLeft,
  PanelRight,
  Loader2,
  Pencil,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AskTutorButton } from "@/features/education/tutor/components/AskTutorButton";
import { useOpenFeedbackWindow } from "@/features/overlays/openers/feedbackDialog";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import type { Note, NoteListItem } from "@/features/notes/types";
import { parseNoteOutline, type NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { NotesView } from "@/features/notes/components/NotesView";
import { saveNote } from "@/features/notes/redux/thunks";
import { setNoteEditorMode } from "@/features/notes/redux/slice";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationStudyGuidesScope } from "@/features/surfaces/manifests/education-study-guides.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { PanelControlProvider, usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { RegisteredPanel } from "@/features/resizable-panels/RegisteredPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  loadStudyGuide,
  loadStudyGuideIndex,
  loadStudyTerms,
  type StudyTerm,
} from "../service";
import {
  AnnotatedContent,
  AnnotationSidecarProvider,
  useSidecar,
  type CapturedSelection,
} from "@/features/rich-document/annotations/AnnotationSidecar";
import { AnnotationPanel } from "@/features/rich-document/annotations/AnnotationPanel";
import type { AnnotationSource } from "@/features/rich-document/annotations/types";
import { noteBodyStore, spliceSaveBody } from "@/features/rich-document/annotations/sourceSave";

type InspectorTab = "notes" | "terms";

interface StudyGuideReaderProps {
  initialGuideId?: string;
  defaultLayout?: Layout;
}

function ReaderPanelControls() {
  const controls = usePanelControls();
  return <>
    <Button variant="ghost" size="icon" className="absolute left-1 top-1 z-20 h-7 w-7 bg-background/90" aria-label="Toggle study guide sidebar" aria-expanded={!controls.isCollapsed("guides")} onClick={() => controls.toggle("guides")}><LayoutPanelLeft className="h-4 w-4" aria-hidden /></Button>
    <Button variant="ghost" size="icon" className="absolute right-1 top-1 z-20 h-7 w-7 bg-background/90" aria-label="Toggle notes and terms sidebar" aria-expanded={!controls.isCollapsed("inspector")} onClick={() => controls.toggle("inspector")}><PanelRight className="h-4 w-4" aria-hidden /></Button>
  </>;
}

function ReaderPanelBody({ children }: { children: React.ReactNode }) {
  const controls = usePanelControls();
  return <div className={cn("h-full min-h-0", controls.isCollapsed("guides") && "pl-8", controls.isCollapsed("inspector") && "pr-8")}>{children}</div>;
}

function GuideList({ guides, activeId, activeLabel, content, onJump, loading, error, onRetry }: { guides: NoteListItem[]; activeId?: string; activeLabel?: string; content: string; onJump: (headingIndex: number) => void; loading: boolean; error: string | null; onRetry: () => void }) {
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const visible = guides.filter((guide) => guide.label.toLowerCase().includes(query.trim().toLowerCase()));
  const activeGuide = guides.find((guide) => guide.id === activeId);
  return (
    <aside className="matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20">
      <div className="border-b border-border px-1.5 py-1.5">
        <p className="pl-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study</p>
        <nav className="mt-2 grid gap-1 text-sm" aria-label="Study tools">
          <Link href="/education/study-guides" className="rounded-md bg-primary/10 px-2 py-1.5 font-medium text-primary">Study Guides</Link>
          <Link href="/education/flashcards" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">Flashcards</Link>
          <Link href="/education/practice-tests" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">Practice Tests</Link>
        </nav>
      </div>
      <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-1">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-1.5 py-1 text-left hover:bg-accent">
              <span className="min-w-0"><span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current guide</span><span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{activeLabel || activeGuide?.label || "Choose a guide"}</span></span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent sizing="content" align="start" className="p-2">
            <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search study guides" placeholder="Search guides" className="h-8 pl-8 text-sm" /></label>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {loading ? <div className="flex items-center gap-2 px-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading guides</div> : error ? <div className="px-2 py-4 text-sm text-muted-foreground"><p>{error}</p><Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>Try again</Button></div> : visible.length ? visible.map((guide) => <Link key={guide.id} href={`/education/study-guides/${guide.id}`} onClick={() => setPickerOpen(false)} className={cn("mb-1 block rounded-md px-2.5 py-2 text-sm transition-colors", guide.id === activeId ? "bg-primary text-primary-foreground" : "hover:bg-accent")}><span className="line-clamp-2 font-medium">{guide.label || "Untitled guide"}</span></Link>) : <p className="px-2 py-5 text-sm text-muted-foreground">No study guides match that search.</p>}
            </div>
          </PopoverContent>
        </Popover>
        <Outline key={content} content={content} onJump={onJump} />
      </div>
    </aside>
  );
}


function Outline({ content, onJump }: { content: string; onJump: (headingIndex: number) => void }) {
  const headings = parseNoteOutline(content);
  const title = studyGuideOutlineTitle(headings);
  const outline = studyGuideOutlineItems(headings);
  const [expanded, setExpanded] = useState(() => initialOutlineExpansion(outline));
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  if (!title && !outline.length) return null;
  return (
    <div className="border-t border-border py-1">
      <OutlineHeader title={title} active={activeHeading === title?.headingIndex} onJump={(headingIndex) => { setActiveHeading(headingIndex); onJump(headingIndex); }} />
      <div className="grid gap-0.5">{visibleOutlineItems(outline, expanded).map((item) => {
        const index = outline.indexOf(item);
        const hasChildren = outline[index + 1]?.level > item.level;
        return <OutlineItem key={`${item.headingIndex}:${item.charOffset}`} item={item} indentLevel={outlineIndentLevel(item, outline)} active={activeHeading === item.headingIndex} onJump={(headingIndex) => { setActiveHeading(headingIndex); if (hasChildren && expanded[headingIndex] === false) setExpanded((current) => toggleOutlineSection(outline, current, headingIndex)); onJump(headingIndex); }} hasChildren={hasChildren} expanded={expanded[item.headingIndex] !== false} onToggle={() => setExpanded((current) => toggleOutlineSection(outline, current, item.headingIndex))} />;
      })}</div>
    </div>
  );
}

function OutlineItem({ item, indentLevel, onJump, hasChildren, expanded, onToggle, active }: { item: NoteOutlineItem; indentLevel: number; onJump: (index: number) => void; hasChildren: boolean; expanded: boolean; onToggle: () => void; active: boolean }) {
  return <div className={cn("flex min-w-0 items-center border-l-2", active ? "border-primary bg-primary/10" : "border-transparent")} style={{ paddingLeft: `${indentLevel * 10}px` }}>{hasChildren ? <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${item.text}`} onClick={onToggle} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">{expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}</button> : <span className="w-5 shrink-0" />}<button type="button" onClick={() => onJump(item.headingIndex)} title={item.text} className={cn("min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded px-1 py-1 text-left text-xs hover:bg-accent [mask-image:linear-gradient(to_right,black_calc(100%_-_12px),transparent)]", active ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{item.text}</button></div>;
}

function Inspector({ guide, tab, onTabChange, terms, loading, error, onRetry }: { guide: Note | null; tab: InspectorTab; onTabChange: (tab: InspectorTab) => void; terms: StudyTerm[]; loading: boolean; error: string | null; onRetry: () => void; mobile?: boolean }) {
  const openCard = useOpenFlashcardItemWindow();
  const [query, setQuery] = useState("");
  const visibleTerms = terms.filter((term) => `${term.term} ${term.definition}`.toLowerCase().includes(query.toLowerCase()));
  return <aside className="matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20">
    <div className="flex border-b border-border pr-8" role="tablist" aria-label="Study guide details">
      <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => onTabChange("notes")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Notes &amp; comments</button>
      <button type="button" role="tab" aria-selected={tab === "terms"} onClick={() => onTabChange("terms")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "terms" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Key Terms</button>
    </div>
    {tab === "notes" ? (guide ? <AnnotationPanel className="min-h-0 flex-1" /> : <p className="px-3 py-8 text-sm text-muted-foreground">Choose a guide to see its notes and comments.</p>) : <div role="tabpanel" aria-label="Key Terms" className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-1.5">
      {loading ? <div className="space-y-3" aria-label="Loading study details">{[0,1,2].map((item) => <div key={item} className="h-24 animate-pulse rounded border border-border bg-muted" />)}</div> : error ? <div role="alert" className="rounded border border-destructive/30 p-3 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>Try again</Button></div> : <div className="grid gap-3">
        <Input aria-label="Search key terms" placeholder="Search terms…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 text-sm" />
        {visibleTerms.map((term) => <button key={term.id} type="button" onClick={() => openCard({ front: term.term, back: term.definition, title: term.term })} className="rounded border border-border bg-card p-1.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"><p className="text-xs font-semibold text-primary"><RichContent level="inline" source={term.term} /></p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{term.definition ? <RichContent level="inline" source={term.definition} /> : "Open card"}</p></button>)}
        {!visibleTerms.length && <p className="py-5 text-sm text-muted-foreground">{terms.length ? "No terms match that search." : "Link a flashcard deck to see its key terms here."}</p>}
        {guide && <StudyFlashcardLinks guide={guide} onChanged={onRetry} />}
      </div>}
    </div>}
  </aside>;
}

/** Passage actions only a study guide has (the tutor, a content report) — added to the sidecar's toolbar. */
function StudyPassageActions({ guide, selection, close }: { guide: Note; selection: CapturedSelection; close: () => void }) {
  const openFeedback = useOpenFeedbackWindow();
  const tutorSeed = { title: guide.label || "Study guide", material: `Study guide: ${guide.label}\n\nSelected passage:\n${selection.anchor.exact}` };
  return <>
    <AskTutorButton seed={tutorSeed} label="I don't get this" variant="ghost" className="w-full justify-start" />
    <AskTutorButton seed={tutorSeed} label="Ask a question" variant="ghost" className="w-full justify-start" />
    <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => {
      close();
      openFeedback({
        title: "Report an issue with this study guide",
        subject: {
          kind: "text_passage",
          sourceToken: "note",
          sourceId: guide.id,
          sourceTitle: guide.label || "Study guide",
          quote: selection.anchor.exact,
          anchor: { ...selection.anchor },
          href: `/education/study-guides/${guide.id}`,
        },
      });
    }}><Send className="mr-2 h-3.5 w-3.5" aria-hidden />Report an issue</Button>
  </>;
}

function ReaderContent({ guide, onRetry, onEdit, getScope, jumpRequest }: { guide: Note; onRetry: () => void; onEdit: () => void; getScope: () => SurfaceScopePayload; jumpRequest: { index: number; nonce: number } | null }) {
  const readerRef = useRef<HTMLDivElement>(null);
  const { setSelection } = useSidecar();
  useEffect(() => {
    if (jumpRequest === null) return;
    const headings = readerRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6");
    headings?.item(jumpRequest.index)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpRequest]);
  return <main className="relative flex h-full min-h-0 flex-col bg-background">
    <Button size="icon" variant="outline" className="absolute right-3 top-2 z-20 h-8 w-8 bg-background" aria-label="Edit study guide" title="Edit study guide" onClick={onEdit}><Pencil className="h-4 w-4" aria-hidden /></Button>
    <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto" onScroll={() => setSelection(null)}>
      <div ref={readerRef} className="w-full px-3 py-3">
        {!/^\s*#\s/.test(guide.content ?? "") && <div className="mb-7 border-b border-border pb-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Study guide</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{guide.label || "Untitled guide"}</h1></div>}
        <NonEditableContextMenu sourceFeature="notes" surfaceName="matrx-user/education-study-guides" getApplicationScope={getScope} contentSource={noteIdentityContentSource(guide.id)} entity={{ type: "note", id: guide.id, title: guide.label || "Untitled guide" }} contextData={{ content: guide.content ?? "", guideId: guide.id }} extraSections={[{ id: "study-guide-selection", label: "Study guide", primary: true, items: [{ kind: "item", id: "retry-study-guide", label: "Refresh study guide", icon: BookOpen, onSelect: onRetry }] }]}>
          <AnnotatedContent className="study-guide-reader-content" extraActions={(selection, close) => <StudyPassageActions guide={guide} selection={selection} close={close} />}>
            <RichDocument imagePolicy="ai" content={guide.content ?? ""} source={noteIdentityContentSource(guide.id)} actionsVariant="icon-only" actionsPosition="top-right" actionsBehavior="hover-only" />
          </AnnotatedContent>
        </NonEditableContextMenu>
      </div>
    </div>
  </main>;
}

/**
 * The guide as an annotation source: a Notes record until its body moves into
 * content.document. Its `version` is the content version the anchors name
 * (a note has no version store to diff, so the resolver uses exact → same
 * range with full context → quote + context → orphaned).
 */
function guideSource(guide: Note, onSaved: () => void): AnnotationSource {
  return {
    token: "note",
    id: guide.id,
    title: guide.label || "Study guide",
    body: guide.content ?? "",
    contentVersion: Math.max(1, guide.version ?? 1),
    href: `/education/study-guides/${guide.id}`,
    // An accepted suggestion writes through THE one splice-save adapter every source uses
    // (only the suggested span's block changes; CAS on the note's version).
    save: async (nextBody) => {
      await spliceSaveBody({ body: guide.content ?? "", version: guide.version ?? 1 }, nextBody, noteBodyStore(guide.id));
      onSaved();
    },
  };
}

function StudyGuideReaderInner({ initialGuideId, defaultLayout }: StudyGuideReaderProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const userId = useAppSelector(selectUserId);
  const [guides, setGuides] = useState<NoteListItem[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(Boolean(userId));
  const [guidesError, setGuidesError] = useState<string | null>(null);
  const [guide, setGuide] = useState<Note | null>(null);
  const [terms, setTerms] = useState<StudyTerm[]>([]);
  const [loading, setLoading] = useState(Boolean(initialGuideId));
  const [detailsLoading, setDetailsLoading] = useState({ notes: Boolean(initialGuideId), terms: Boolean(initialGuideId) });
  const [error, setError] = useState<unknown>(null);
  const [detailsError, setDetailsError] = useState<{ notes: string | null; terms: string | null }>({ notes: null, terms: null });
  const [indexTick, setIndexTick] = useState(0);
  const [guideTick, setGuideTick] = useState(0);
  const [detailsTick, setDetailsTick] = useState(0);
  const [tab, setTab] = useState<InspectorTab>("notes");
  const [outlineJump, setOutlineJump] = useState<{ index: number; nonce: number } | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"guides" | "details" | null>(null);
  const [editingGuide, setEditingGuide] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    if (!userId) return;
    void loadStudyGuideIndex().then((next) => { if (!stale) setGuides(next); }).catch((cause: unknown) => { if (!stale) setGuidesError(cause instanceof Error ? cause.message : "Could not load study guides."); }).finally(() => { if (!stale) setGuidesLoading(false); });
    return () => { stale = true; };
  }, [userId, indexTick]);

  useEffect(() => {
    let stale = false;
    if (!initialGuideId || !userId) return;
    void loadStudyGuide(initialGuideId).then((loaded) => { if (!stale) setGuide(loaded); }).catch((cause: unknown) => { if (!stale) { setGuide(null); setError(cause); } }).finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [initialGuideId, guideTick, userId]);

  useEffect(() => {
    let stale = false;
    if (!guide) return;
    void loadStudyTerms(guide.id).then((next) => { if (!stale) setTerms(next); })
      .catch((cause: unknown) => { if (!stale) setDetailsError((current) => ({ ...current, terms: cause instanceof Error ? cause.message : "Could not load key terms." })); })
      .finally(() => { if (!stale) setDetailsLoading((current) => ({ ...current, terms: false })); });
    return () => { stale = true; };
  }, [guide, detailsTick, userId]);

  const retryIndex = () => { setGuidesError(null); setGuidesLoading(true); setIndexTick((tick) => tick + 1); };
  const retryGuide = () => { setError(null); setLoading(true); setGuideTick((tick) => tick + 1); };
  const retryDetails = () => { setDetailsError({ notes: null, terms: null }); setDetailsLoading({ notes: true, terms: true }); setDetailsTick((tick) => tick + 1); };
  const finishEditing = async () => {
    if (!guide) return;
    // The canonical editor flushes its local keystrokes into Redux on unmount.
    flushSync(() => setEditingGuide(false));
    try {
      await dispatch(saveNote(guide.id)).unwrap();
      setEditError(null);
      retryGuide();
      retryDetails();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not save the guide. Your draft is still available in the editor.");
      setEditingGuide(true);
    }
  };

  const getScope = () => createEducationStudyGuidesScope({
    guide_loaded: Boolean(guide) && !loading && !error,
    reader_mode: editingGuide ? "edit" : "read",
    active_details_tab: tab,
    ...(guide ? {
      guide_id: guide.id,
      guide_title: guide.label || "Untitled guide",
      guide_content: guide.content ?? "",
      outline: parseNoteOutline(guide.content ?? "").map((heading, index) => ({ index, level: heading.level, text: heading.text })),
      context: { guideId: guide.id, organizationId: guide.organization_id, mode: editingGuide ? "edit" : "read" },
    } : {}),
    ...(!guidesLoading && !guidesError ? { available_guides: guides.map((item) => ({ id: item.id, title: item.label })) } : {}),
    ...(guide && !detailsLoading.terms && !detailsError.terms ? { key_terms: terms.map((item) => ({ id: item.id, term: item.term, definition: item.definition })) } : {}),
    ...(guidesError || error || editError ? { load_error: guidesError || editError || (error instanceof Error ? error.message : "Could not load the guide.") } : {}),
    ...(detailsError.notes || detailsError.terms ? { details_error: detailsError.notes || detailsError.terms || "" } : {}),
  });

  const readerState = loading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Loading study guide</div> : error || (initialGuideId && !guide) ? <AccessGate token="note" id={initialGuideId ?? ""} error={error} onRetry={retryGuide} fallbackHref="/education/study-guides" fallbackLabel="Study guides" /> : guide ? editingGuide ? <main className="relative h-full min-h-0 bg-background"><Button size="sm" variant="outline" className="absolute right-3 top-2 z-20 bg-background" onClick={() => { void finishEditing(); }}><BookOpen className="mr-1.5 h-4 w-4" aria-hidden />Back to reading</Button>{editError && <p role="alert" className="absolute right-3 top-12 z-20 max-w-xs rounded border border-destructive bg-background p-2 text-xs text-destructive">{editError}</p>}<NotesView config={{ singleNote: guide.id, showSidebar: false, showTabs: false, hidePageHeader: true, syncUrl: false }} className="h-full" /></main> : <ReaderContent guide={guide} onRetry={retryGuide} onEdit={() => { setEditError(null); dispatch(setNoteEditorMode({ id: guide.id, mode: "wysiwyg" })); setEditingGuide(true); }} getScope={getScope} jumpRequest={outlineJump} /> : <div className="flex h-full items-center justify-center px-6 text-center"><div><BookOpen className="mx-auto h-8 w-8 text-primary" aria-hidden /><h1 className="mt-3 text-lg font-semibold">Choose a study guide</h1><p className="mt-1 text-sm text-muted-foreground">Select a guide from the left to start reviewing.</p></div></div>;

  const reader = loading || error || !guide ? <div className="scroll-page-end-space h-full min-h-0 overflow-y-auto">{readerState}</div> : readerState;

  const withSidecar = (node: React.ReactNode) => guide ? <AnnotationSidecarProvider source={guideSource(guide, () => { void loadStudyGuide(guide.id).then((next) => { if (next) setGuide(next); }); })}>{node}</AnnotationSidecarProvider> : node;

  if (isMobile) return withSidecar(<SurfaceRuntimeProvider surfaceName="matrx-user/education-study-guides" getScope={getScope}><PanelControlProvider initialLayouts={[defaultLayout]}><div className="matrx-touch-targets flex h-full min-h-0 flex-col"><div className="flex items-center justify-between border-b border-border bg-background px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setMobilePanel("guides")}>Study guides</Button><Button size="sm" variant="ghost" onClick={() => setMobilePanel("details")}>Notes & terms</Button></div><div className="min-h-0 flex-1">{reader}</div><Drawer open={mobilePanel === "guides"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study guides</DrawerTitle></DrawerHeader><DrawerBody><GuideList guides={guides} activeLabel={guide?.label} activeId={guide?.id ?? initialGuideId} content={guide?.content ?? ""} onJump={(index) => { setOutlineJump((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 })); setMobilePanel(null); }} loading={guidesLoading} error={guidesError} onRetry={retryIndex} /></DrawerBody></DrawerContent></Drawer><Drawer open={mobilePanel === "details"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study details</DrawerTitle></DrawerHeader><DrawerBody><Inspector guide={guide} mobile tab={tab} onTabChange={setTab} terms={terms} loading={detailsLoading[tab]} error={detailsError[tab]} onRetry={retryDetails} /></DrawerBody></DrawerContent></Drawer></div></PanelControlProvider></SurfaceRuntimeProvider>);

  return withSidecar(<SurfaceRuntimeProvider surfaceName="matrx-user/education-study-guides" getScope={getScope}><PanelControlProvider initialLayouts={[defaultLayout]}>
    <div className="relative h-full min-h-0 overflow-hidden">
      <ReaderPanelControls />
      <ClientGroup id="study-guide-reader" groupKey="study-guide-reader" cookieName="panels:study-guide-reader" defaultLayout={defaultLayout} orientation="horizontal" className="h-full w-full" resizeTargetMinimumSize={{ coarse: 20, fine: 10 }}>
        <RegisteredPanel registerAs="guides" groupKey="study-guide-reader" id="guides" collapsible collapsedSize="0%" defaultSize="250px" minSize="190px">
          <GuideList guides={guides} activeLabel={guide?.label} activeId={guide?.id ?? initialGuideId} content={guide?.content ?? ""} onJump={(index) => setOutlineJump((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 }))} loading={guidesLoading} error={guidesError} onRetry={retryIndex} />
        </RegisteredPanel>
        <Handle hideWhenCollapsed={["guides"]} />
        <Panel id="reader" minSize="35%">
          <ReaderPanelBody>{reader}</ReaderPanelBody>
        </Panel>
        <Handle hideWhenCollapsed={["inspector"]} />
        <RegisteredPanel registerAs="inspector" groupKey="study-guide-reader" id="inspector" collapsible collapsedSize="0%" defaultSize="290px" minSize="220px">
          <Inspector guide={guide} tab={tab} onTabChange={setTab} terms={terms} loading={detailsLoading[tab]} error={detailsError[tab]} onRetry={retryDetails} />
        </RegisteredPanel>
      </ClientGroup>
    </div>
  </PanelControlProvider></SurfaceRuntimeProvider>);
}

export function StudyGuideReader(props: StudyGuideReaderProps) {
  const userId = useAppSelector(selectUserId);
  return <StudyGuideReaderInner key={`${userId}:${props.initialGuideId ?? "library"}`} {...props} />;
}
