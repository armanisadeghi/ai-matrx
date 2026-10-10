"use client";

import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { initialOutlineExpansion, studyGuideOutlineDisplayTitle, studyGuideOutlineItems, studyGuideOutlineTree, toggleOutlineSection, type StudyGuideOutlineNode } from "../outline";
import { OutlineHeader } from "./OutlineHeader";
import { StudyGuideResources } from "./StudyGuideResources";
import { RenderedFindBar } from "@ai-matrx/rich-content/rich-document/search/RenderedFindBar";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Panel, type Layout } from "react-resizable-panels";
import {
  BookOpen,
  ChevronDown,
  CircleHelp,
  GraduationCap,
  ChevronRight,
  LayoutPanelLeft,
  PanelRight,
  Loader2,
  Pencil,
  TextCursorInput,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { AskTutorPanel } from "@/features/education/tutor/components/AskTutorButton";
import type { TutorGroundingSeed } from "@/features/education/tutor/grounding";
import type { Action, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { selectionToolbarHostOf, shownInSelectionMode } from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import { annotationHostOf } from "@/features/rich-document/annotations/annotation-actions";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";
import { useOpenNoteInWindow } from "@/features/notes/actions/useOpenNoteInWindow";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import type { Note, NoteListItem } from "@/features/notes/types";
import { parseNoteOutline, type NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { RichDocument } from "@ai-matrx/rich-content/rich-document/RichDocument";
import { RichCopySplit } from "@ai-matrx/chat/agent-copy/RichCopySplit";
import { richDocumentViewKey } from "@ai-matrx/rich-content/rich-document/runtime/useActionSurfaceProvider";
import { EditInPlace } from "@ai-matrx/rich-editor/in-place/EditInPlace";
import { EditInPlaceText } from "@ai-matrx/rich-editor/in-place/EditInPlaceText";
import { NoteWorkspace } from "@/features/notes/components/NoteWorkspace";
import { deleteNote, saveNote } from "@/features/notes/redux/thunks";
import { setNoteEditorMode, updateNoteLabel } from "@/features/notes/redux/slice";
import { useNewNoteOrganization } from "@/features/notes/hooks/useNewNoteOrganization";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { createEducationStudyGuidesScope } from "@/features/surfaces/manifests/education-study-guides.manifest";
import { createEducationStudyGuideScope, EDUCATION_STUDY_GUIDE_SURFACE_NAME } from "@/features/surfaces/manifests/education-study-guide.manifest";
import type { SurfaceWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { refuseSurfaceWrite } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { StudyGuideAgentBridge, type StudyGuideAnnotationSnapshot } from "./StudyGuideAgentBridge";
import { parseCreateStudyGuidesValue, parseDeleteStudyGuidesValue, parseGuideContentValue, parseUpdateStudyGuidesValue } from "../studyGuideAgentWrites";
import { collectionWriteHandlers } from "@ai-matrx/chat/surfaces/runtime/collection-write-targets";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { PanelControlProvider, usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { RegisteredPanel } from "@/features/resizable-panels/RegisteredPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import {
  loadStudyGuide,
  loadStudyGuideIndex,
  loadStudyTerms,
  createStudyGuide,
  updateStudyGuide,
  type StudyTerm,
} from "../service";
import {
  AnnotatedContent,
  AnnotationSidecarProvider,
} from "@/features/rich-document/annotations/AnnotationSidecar";
import { AnnotationPanel } from "@/features/rich-document/annotations/AnnotationPanel";
import type { AnnotationSource } from "@/features/rich-document/annotations/types";
import { noteBodyStore, spliceSaveBody } from "@/features/rich-document/annotations/sourceSave";
import { ErrorNotice } from "@ai-matrx/design-system";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import { formatCount } from "@ai-matrx/kit/format";

type InspectorTab = "notes" | "terms" | "resources";

interface StudyGuideReaderProps {
  initialGuideId?: string;
  startInEdit?: boolean;
  defaultLayout?: Layout;
}

function ReaderPanelControls() {
  const controls = usePanelControls();
  return <>
    <Button icon={<LayoutPanelLeft aria-hidden />} variant="quiet" className="absolute left-1 top-1 z-20" aria-label="Toggle study guide sidebar" aria-expanded={!controls.isCollapsed("guides")} onClick={() => controls.toggle("guides")} />
    <Button icon={<PanelRight aria-hidden />} variant="quiet" className="absolute right-1 top-1 z-20" aria-label="Toggle notes and terms sidebar" aria-expanded={!controls.isCollapsed("inspector")} onClick={() => controls.toggle("inspector")} />
  </>;
}

function ReaderPanelBody({ children }: { children: React.ReactNode }) {
  const controls = usePanelControls();
  return <div className={cn("h-full min-h-0", controls.isCollapsed("guides") && "pl-8", controls.isCollapsed("inspector") && "pr-8")}>{children}</div>;
}

function GuideList({ guides, activeId, activeLabel, content, onJump, loading, error, onRetry, onCreate, creating }: { guides: NoteListItem[]; activeId?: string; activeLabel?: string; content: string; onJump: (headingIndex: number) => void; loading: boolean; error: string | null; onRetry: () => void; onCreate: () => void; creating: boolean }) {
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const visible = guides.filter((guide) => guide.label.toLowerCase().includes(query.trim().toLowerCase()));
  const activeGuide = guides.find((guide) => guide.id === activeId);
  return (
    <aside className="matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20">
      <div className="border-b border-border px-1.5 py-1.5">
        <p className="pl-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study</p>
        <nav className="mt-2 grid gap-1 text-sm" aria-label="Study tools">
          <Link href="/education/study-guides" className="rounded-md bg-primary/10 px-2 py-1.5 font-medium text-primary-ink">Study Guides</Link>
          <Link href="/education/flashcards" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">Flashcards</Link>
          <Link href="/education/practice-tests" className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">Practice Tests</Link>
        </nav>
      </div>
      <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-1">
        <Button icon={creating ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />} variant="primary" className="mb-2 w-full" onClick={onCreate} disabled={creating}>
          New study guide
        </Button>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="mb-2 flex w-full items-center justify-between rounded-lg border border-border bg-card px-1.5 py-1 text-left hover:bg-accent">
              <span className="min-w-0"><span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current guide</span><span className="mt-0.5 block truncate text-sm font-semibold text-foreground">{activeLabel || activeGuide?.label || "Choose a guide"}</span></span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent sizing="content" align="start" className="p-2">
            <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input adornment="start" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search study guides" placeholder="Search guides" /></label>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {loading ? <div className="flex items-center gap-2 px-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Loading guides</div> : error ? <div className="px-2 py-4 text-sm text-muted-foreground"><p>{error} <ErrorAlchemyMenu error={error} /></p><Button variant="outline" className="mt-2" onClick={onRetry}>Try again</Button></div> : visible.length ? visible.map((guide) => <Link key={guide.id} href={`/education/study-guides/${guide.id}`} onClick={() => setPickerOpen(false)} className={cn("mb-1 block rounded-md px-2.5 py-2 text-sm transition-colors", guide.id === activeId ? "bg-primary text-primary-foreground" : "hover:bg-accent")}><span className="line-clamp-2 font-medium">{guide.label || "Untitled guide"}</span></Link>) : <p className="px-2 py-5 text-sm text-muted-foreground">No study guides match that search.</p>}
            </div>
          </PopoverContent>
        </Popover>
        {/* The outline belongs to an OPEN guide. With none open it drew a phantom bold "Untitled guide" row that looked clickable and did nothing. */}
        {activeId && <Outline key={content} content={content} titleLabel={activeLabel || activeGuide?.label || "Untitled guide"} onJump={onJump} />}
      </div>
    </aside>
  );
}


function Outline({ content, titleLabel, onJump }: { content: string; titleLabel: string; onJump: (headingIndex: number) => void }) {
  const headings = parseNoteOutline(content);
  const title = studyGuideOutlineDisplayTitle(headings, titleLabel, content);
  const outline = studyGuideOutlineItems(headings, content);
  const tree = studyGuideOutlineTree(outline);
  const [expanded, setExpanded] = useState(() => initialOutlineExpansion(outline));
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  if (!title && !outline.length) return null;
  return (
    <nav className="border-t border-border py-1" aria-label="Study guide outline">
      <ul className="list-none p-0">
        <li>
          <OutlineHeader title={title} active={activeHeading === title.headingIndex} onJump={(headingIndex) => { setActiveHeading(headingIndex); onJump(headingIndex); }} />
          <ul className="grid list-none gap-0.5 p-0">{tree.map((node) => <OutlineBranch key={`${node.item.headingIndex}:${node.item.charOffset}`} node={node} depth={1} outline={outline} expanded={expanded} setExpanded={setExpanded} activeHeading={activeHeading} setActiveHeading={setActiveHeading} onJump={onJump} />)}</ul>
        </li>
      </ul>
    </nav>
  );
}

function OutlineBranch({ node, depth, outline, expanded, setExpanded, activeHeading, setActiveHeading, onJump }: { node: StudyGuideOutlineNode; depth: number; outline: NoteOutlineItem[]; expanded: Readonly<Record<number, boolean>>; setExpanded: React.Dispatch<React.SetStateAction<Record<number, boolean>>>; activeHeading: number | null; setActiveHeading: React.Dispatch<React.SetStateAction<number | null>>; onJump: (index: number) => void }) {
  const { item, children } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expanded[item.headingIndex] !== false;
  const toggle = () => setExpanded((current) => toggleOutlineSection(outline, current, item.headingIndex));
  return <li>
    <div className={cn("flex min-w-0 items-center border-l-2", activeHeading === item.headingIndex ? "border-primary bg-primary/10" : "border-transparent")} style={{ paddingLeft: "10px" }}>
      {hasChildren ? <button type="button" aria-expanded={isExpanded} aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.text}`} onClick={toggle} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">{isExpanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}</button> : <span className="w-5 shrink-0" />}
      <button type="button" onClick={() => { setActiveHeading(item.headingIndex); if (hasChildren && !isExpanded) toggle(); onJump(item.headingIndex); }} title={item.text} className={cn("min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded px-1 py-1 text-left text-xs hover:bg-accent [mask-image:linear-gradient(to_right,black_calc(100%_-_12px),transparent)]", activeHeading === item.headingIndex ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{item.text}</button>
    </div>
    {hasChildren && isExpanded && <ul className={cn("list-none p-0", depth < 3 && "ml-2.5")}>{children.map((child) => <OutlineBranch key={`${child.item.headingIndex}:${child.item.charOffset}`} node={child} depth={depth + 1} outline={outline} expanded={expanded} setExpanded={setExpanded} activeHeading={activeHeading} setActiveHeading={setActiveHeading} onJump={onJump} />)}</ul>}
  </li>;
}

function Inspector({ guide, tab, onTabChange, terms, loading, error, onRetry }: { guide: Note | null; tab: InspectorTab; onTabChange: (tab: InspectorTab) => void; terms: StudyTerm[]; loading: boolean; error: string | null; onRetry: () => void; mobile?: boolean }) {
  const openCard = useOpenFlashcardItemWindow();
  const [query, setQuery] = useState("");
  const visibleTerms = terms.filter((term) => `${term.term} ${term.definition}`.toLowerCase().includes(query.toLowerCase()));
  return <aside className="matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20">
    <div className="flex border-b border-border pr-8" role="tablist" aria-label="Study guide details">
      <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => onTabChange("notes")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Notes &amp; comments</button>
      <button type="button" role="tab" aria-selected={tab === "terms"} onClick={() => onTabChange("terms")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "terms" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Key Terms</button>
      <button type="button" role="tab" aria-selected={tab === "resources"} onClick={() => onTabChange("resources")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "resources" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Resources</button>
    </div>
    {tab === "notes" ? (guide ? <AnnotationPanel className="min-h-0 flex-1" /> : <p className="px-3 py-8 text-sm text-muted-foreground">Choose a guide to see its notes and comments.</p>) : tab === "resources" ? (guide ? <StudyGuideResources guide={guide} onChanged={onRetry} /> : <p className="px-3 py-8 text-sm text-muted-foreground">Choose a guide to see its resources.</p>) : <div role="tabpanel" aria-label="Key Terms" className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-1.5">
      {loading ? <div className="space-y-3" aria-label="Loading study details">{[0,1,2].map((item) => <div key={item} className="h-24 animate-pulse rounded border border-border bg-muted" />)}</div> : error ? <div role="alert" className="rounded border border-destructive/30 p-3 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" onClick={onRetry}>Try again</Button> <ErrorAlchemyMenu className="ml-auto" /></div> : <div className="grid gap-3">
        <Input aria-label="Search key terms" placeholder="Search terms…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {visibleTerms.map((term) => <button key={term.id} type="button" onClick={() => openCard({ front: term.term, back: term.definition, title: term.term })} className="rounded border border-border bg-card p-1.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"><p className="text-xs font-semibold text-primary"><RichContent level="inline" source={term.term} /></p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{term.definition ? <RichContent level="inline" source={term.definition} /> : "Open card"}</p></button>)}
        {!visibleTerms.length && <p className="py-5 text-sm text-muted-foreground">{terms.length ? "No terms match that search." : "Link a flashcard deck to see its key terms here."}</p>}
        {guide && <button type="button" className="text-left text-xs font-medium text-primary hover:underline" onClick={() => onTabChange("resources")}>View linked flashcards and resources</button>}
      </div>}
    </div>}
  </aside>;
}

/** Passage actions only a study guide has (the tutor, a content report) — added to the sidecar's toolbar. */
/**
 * The study guide's own passage actions — "I don't get this" and "Ask a question"
 * (the AI tutor, grounded in the selected passage; Report is every annotated
 * passage's, from the annotation actions) — as
 * registry actions of the ONE selection toolbar. The tutor panel lives here,
 * not in the toolbar, so it stays open after the toolbar closes.
 */
function useStudyPassageActions(guide: Note): { actions: Action[]; tutor: React.ReactNode } {
  const [tutorSeed, setTutorSeed] = useState<TutorGroundingSeed | null>(null);
  const passage = (t: ClickTarget) => annotationHostOf(t)?.capture() ?? null;
  const eligible = (id: string) => (t: ClickTarget) =>
    shownInSelectionMode(id, t) && annotationHostOf(t)?.capture({ silent: true })
      ? ({ status: "available" } as const)
      : ({ status: "absent" } as const);
  const openTutor = (t: ClickTarget) => {
    const selection = passage(t);
    if (!selection) return;
    selectionToolbarHostOf(t)?.ui.close();
    setTutorSeed({ title: guide.label || "Study guide", material: `Study guide: ${guide.label}\n\nSelected passage:\n${selection.anchor.exact}` });
  };
  const actions: Action[] = [
    { id: "selection:tutor-explain", label: "I don't get this", icon: registerAlchemyIcon(CircleHelp), category: "ask", order: 0, placement: "primary", preserveSelection: true, eligible: eligible("selection:tutor-explain"), run: openTutor },
    { id: "selection:tutor-ask", label: "Ask a question", icon: registerAlchemyIcon(GraduationCap), category: "ask", order: 1, placement: "primary", preserveSelection: true, eligible: eligible("selection:tutor-ask"), run: openTutor },
  ];
  const tutor = tutorSeed ? (
    <AskTutorPanel seed={tutorSeed} open onOpenChange={(open) => { if (!open) setTutorSeed(null); }} />
  ) : null;
  return { actions, tutor };
}

function ReaderContent({ guide, onEdit, onDelete, canDelete, deleting, jumpRequest, canEdit, onBodySaved }: { guide: Note; onEdit: () => void; onDelete: () => void; canDelete: boolean; deleting: boolean; jumpRequest: { index: number; nonce: number } | null; canEdit: boolean; onBodySaved: () => void }) {
  const readerRef = useRef<HTMLDivElement>(null);
  // EDIT IN PLACE (components/rich-editor/in-place): the guide's owner
  // double-clicks the text (or presses the pencil) and THE ONE editor opens
  // right here; Save writes through the splice-save every source uses (only
  // the changed block, CAS on the note's version). A guide someone else owns
  // never offers it.
  const [editingBody, setEditingBody] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const saveTitle = async (title: string) => {
    await updateStudyGuide(guide, { title: title.trim() });
    onBodySaved();
  };
  const saveBody = async (text: string) => {
    await spliceSaveBody({ body: guide.content ?? "", version: guide.version ?? 1 }, text, noteBodyStore(guide.id));
    onBodySaved();
  };
  const [findOpen, setFindOpen] = useState(false);
  const [findFocusRequest, setFindFocusRequest] = useState(0);
  const openFind = () => { setFindOpen(true); setFindFocusRequest((value) => value + 1); };
  const passage = useStudyPassageActions(guide);
  useEffect(() => {
    const onFindShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        setFindFocusRequest((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onFindShortcut, true);
    return () => window.removeEventListener("keydown", onFindShortcut, true);
  }, []);
  useEffect(() => {
    if (jumpRequest === null) return;
    const headings = readerRef.current?.querySelector(".study-guide-reader-content")?.querySelectorAll("h1,h2,h3,h4,h5,h6");
    const target = jumpRequest.index === -1 ? readerRef.current : headings?.item(jumpRequest.index);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpRequest]);
  return <main className="relative flex h-full min-h-0 flex-col bg-background">
    <div className="absolute right-3 top-2 z-20 flex gap-1">
      {/* THE content action set: Copy, Plain, Export, Print, Transform — one click each. */}
      <RichCopySplit size="sm" label={`Study guide "${guide.label || "Untitled guide"}"`} human={() => guide.content ?? ""} contentFlavor="markdown" exportTitle={guide.label || "Study guide"} viewKey={richDocumentViewKey(noteIdentityContentSource(guide.id), "")} className="rounded-md border border-border bg-background" />
      <Button icon={<Search aria-hidden />} variant="outline" aria-label="Search this guide" title="Search this guide" onClick={openFind} />
      <Button icon={<Pencil aria-hidden />} variant="outline" aria-label="Edit study guide" title="Edit study guide" onClick={canEdit ? () => setEditingBody(true) : onEdit} />
      {canEdit && <Button icon={<TextCursorInput aria-hidden />} variant="outline" aria-label="Rename study guide" title="Rename study guide" onClick={() => setEditingTitle(true)} />}
      {canDelete && <Button icon={<Trash2 aria-hidden />} variant="outline" aria-label="Delete study guide" title="Delete study guide" onClick={onDelete} disabled={deleting} />}
    </div>
    {findOpen && <div className="absolute right-3 top-11 z-30 w-[min(96%,520px)]"><RenderedFindBar rootRef={readerRef} onClose={() => setFindOpen(false)} label="Find in this guide" focusRequest={findFocusRequest} /></div>}
    <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto">
      <div ref={readerRef} className="w-full px-3 py-3">
        {(editingTitle || !/^\s*#\s/.test(guide.content ?? "")) && <div className="mb-7 border-b border-border pb-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Study guide</p>
          {/* EDIT IN PLACE, inline: double-click the title (or Rename in the bar). */}
          <EditInPlaceText value={guide.label ?? ""} canEdit={canEdit} editing={editingTitle} onEditingChange={setEditingTitle} write={saveTitle} label="Study guide title" className="mt-1" inputClassName="text-2xl font-semibold tracking-tight text-foreground">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{guide.label || "Untitled guide"}</h1>
          </EditInPlaceText>
        </div>}
        <AnnotatedContent className="study-guide-reader-content" passageActions={passage.actions}>
          <EditInPlace
            value={guide.content ?? ""}
            canEdit={canEdit}
            editing={editingBody}
            onEditingChange={setEditingBody}
            write={saveBody}
            discardDescription="The guide stays exactly as it was saved; what you typed here is dropped."
            editor={{ imagePolicy: "ai", surfaceName: "matrx-user/education-study-guides", sourceFeature: "notes", contentSource: noteIdentityContentSource(guide.id) }}
          >
          <RichDocument imagePolicy="ai" content={guide.content ?? ""} source={noteIdentityContentSource(guide.id)} actionsVariant="icon-only" actionsPosition="top-right" actionsBehavior="hover-only" />
          </EditInPlace>
        </AnnotatedContent>
      </div>
    </div>
    {passage.tutor}
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

function StudyGuideReaderInner({ initialGuideId, startInEdit = false, defaultLayout }: StudyGuideReaderProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const resolveNewNoteOrganization = useNewNoteOrganization();
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
  const [editingGuide, setEditingGuide] = useState(startInEdit);
  const [titleDraft, setTitleDraft] = useState("");
  const titleGuideIdRef = useRef<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [creatingGuide, setCreatingGuide] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [deletingGuide, setDeletingGuide] = useState(false);

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
    if (guide && (!editingGuide || titleGuideIdRef.current !== guide.id)) {
      titleGuideIdRef.current = guide.id;
      setTitleDraft(guide.label);
    }
  }, [guide, editingGuide]);

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
      router.replace(`/education/study-guides/${guide.id}`);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not save the guide. Your draft is still available in the editor.");
      setEditingGuide(true);
    }
  };

  const persistGuide = async (plan: { title: string; content: string }) => {
    const organizationId = await resolveNewNoteOrganization();
    return createStudyGuide({ ...plan, organizationId });
  };

  const createManualGuide = async () => {
    if (creatingGuide) return;
    setCreatingGuide(true);
    try {
      const note = await persistGuide({ title: "Untitled study guide", content: "" });
      router.push(`/education/study-guides/${note.id}?edit=1`);
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not create the study guide.");
    } finally {
      setCreatingGuide(false);
    }
  };

  const deleteGuide = async () => {
    if (!pendingDelete || deletingGuide) return;
    setDeletingGuide(true);
    try {
      await dispatch(deleteNote(pendingDelete.id)).unwrap();
      setPendingDelete(null);
      router.replace("/education/study-guides");
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Could not move the study guide to Trash.");
    } finally {
      setDeletingGuide(false);
    }
  };

  // The detail route (/education/study-guides/[id]) is its own surface: one guide,
  // its notes and comments, and write targets. The library route keeps the list surface.
  const surfaceName = initialGuideId ? EDUCATION_STUDY_GUIDE_SURFACE_NAME : "matrx-user/education-study-guides";
  const annotationsRef = useRef<StudyGuideAnnotationSnapshot>({});
  const guideRef = useRef(guide);
  const guidesRef = useRef(guides);
  const editingRef = useRef(editingGuide);
  useEffect(() => {
    guideRef.current = guide;
    guidesRef.current = guides;
    editingRef.current = editingGuide;
  });

  const getDetailScope = () => {
    const notes = annotationsRef.current;
    const termsReady = Boolean(guide) && !detailsLoading.terms && !detailsError.terms;
    const guideReady = Boolean(guide) && !loading && !error;
    const detailsFailure = detailsError.terms || notes.error;
    // A finished read that found nothing is the access gate (missing or not shared), never an empty guide.
    const missing = !loading && !guide && !error ? "This study guide does not exist, or the person does not have access to it." : null;
    return createEducationStudyGuideScope({
      guide_loaded: guideReady,
      reader_mode: editingGuide ? "edit" : "read",
      active_details_tab: tab,
      ...(guide && guideReady ? {
        study_guide: {
          id: guide.id,
          title: guide.label || "Untitled guide",
          content: guide.content ?? "",
          version: Math.max(1, guide.version ?? 1),
          updated_at: guide.updated_at ?? null,
          tags: guide.tags ?? [],
          key_term_count: termsReady ? terms.length : null,
          personal_note_count: notes.personal ? notes.personal.length : null,
          comment_count: notes.comments ? notes.comments.length : null,
        },
        guide_id: guide.id,
        guide_title: guide.label || "Untitled guide",
        guide_content: guide.content ?? "",
        outline: parseNoteOutline(guide.content ?? "").map((heading, index) => ({ index, level: heading.level, text: heading.text })),
        ...(notes.personal ? { personal_annotations: notes.personal } : {}),
        ...(notes.comments ? { guide_comments: notes.comments } : {}),
        context: { guideId: guide.id, organizationId: guide.organization_id, mode: editingGuide ? "edit" : "read" },
      } : {}),
      ...(!guidesLoading && !guidesError ? { available_guides: guides.map((item) => ({ id: item.id, title: item.label, version: item.version })) } : {}),
      ...(termsReady ? { key_terms: terms.map((item) => ({ id: item.id, term: item.term, definition: item.definition })) } : {}),
      ...(missing || guidesError || error || editError ? { load_error: missing || guidesError || editError || (error instanceof Error ? error.message : "Could not load the guide.") } : {}),
      ...(detailsFailure ? { details_error: detailsFailure } : {}),
    });
  };

  // guide_content — the guide's body, saved through the reader's own splice-save
  // (the same `guideSource(...).save` an accepted suggestion uses: CAS on the note's version).
  const getWriteHandlers = (): SurfaceWriteHandlers => {
    const guideTargets = collectionWriteHandlers(
      {
        plural: "study_guides",
        singular: "study guide",
        create: {
          parse: parseCreateStudyGuidesValue,
          run: async (plan) => {
            const note = await persistGuide(plan);
            return { id: note.id, name: note.label };
          },
          nameOf: (plan) => plan.title,
          refusalFor: (cause) => undefined,
        },
        update: {
          parse: (value) => {
            if (editingRef.current) refuseSurfaceWrite("The person has a guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
            return parseUpdateStudyGuidesValue(
              value,
              guidesRef.current.map((item) => ({ id: item.id, title: item.label, version: item.version })),
            );
          },
          run: async (plan) => {
            if (editingRef.current) refuseSurfaceWrite("The person has a guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
            const current = await loadStudyGuide(plan.id);
            if (!current) throw new Error(`"${plan.title}" is no longer available to update.`);
            if (current.version !== plan.expectedVersion)
              throw new Error(`"${current.label}" changed after this agent run. Reload the study-guide list and try again.`);
            const saved = await updateStudyGuide(current, {
              ...(plan.changed.includes("title") ? { title: plan.title } : {}),
              ...(plan.content !== undefined ? { content: plan.content } : {}),
            });
            setIndexTick((tick) => tick + 1);
            if (guideRef.current?.id === saved.id) setGuide(saved);
            return { id: saved.id, name: saved.label };
          },
          nameOf: (plan) => plan.title,
          changedOf: (plan) => plan.changed,
        },
        delete: {
          parse: (value) => {
            if (editingRef.current) refuseSurfaceWrite("The person has a guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
            return parseDeleteStudyGuidesValue(
              value,
              guidesRef.current.map((item) => ({ id: item.id, title: item.label })),
            );
          },
          run: async (plan) => {
            if (editingRef.current) refuseSurfaceWrite("The person has a guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
            await dispatch(deleteNote(plan.id)).unwrap();
            return { id: plan.id, name: plan.title };
          },
          nameOf: (plan) => plan.title,
        },
      },
      refuseSurfaceWrite,
    );
    const collectionDelete = guideTargets.delete_study_guides;
    const guardedGuideTargets: SurfaceWriteHandlers = {
      ...guideTargets,
      delete_study_guides: {
        ...collectionDelete,
        apply: async (value) => {
          if (editingRef.current) refuseSurfaceWrite("The person has a guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
          const plans = parseDeleteStudyGuidesValue(
            value,
            guidesRef.current.map((item) => ({ id: item.id, title: item.label })),
          );
          const outcome = await collectionDelete.apply(value);
          if (guideRef.current && plans.some((plan) => plan.id === guideRef.current?.id)) router.replace("/education/study-guides");
          else retryIndex();
          return outcome;
        },
      },
    };
    return initialGuideId ? {
      ...guardedGuideTargets,
    guide_content: {
      validate: (value) => {
        const current = guideRef.current;
        if (!current) refuseSurfaceWrite("The guide has not loaded, so there is nothing to edit yet.");
        if (editingRef.current) refuseSurfaceWrite("The person has the guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
        parseGuideContentValue(value, current.content ?? "");
      },
      apply: async (value) => {
        const current = guideRef.current;
        if (!current) refuseSurfaceWrite("The guide has not loaded, so there is nothing to edit yet.");
        if (editingRef.current) refuseSurfaceWrite("The person has the guide open in the editor. Ask them to press \"Back to reading\" first; nothing was changed.");
        const next = parseGuideContentValue(value, current.content ?? "");
        await guideSource(current, () => undefined).save!(next);
        const saved = await loadStudyGuide(current.id);
        if (saved) setGuide(saved);
        retryDetails();
        return {
          summary: `Saved the guide "${current.label || "Untitled guide"}" (${formatCount(next.length)} characters, now version ${saved?.version ?? "?"}).`,
          data: { id: current.id, version: saved?.version ?? null, characters: next.length },
        };
      },
    },
    } : guardedGuideTargets;
  };

  const getListScope = () => createEducationStudyGuidesScope({
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
    ...(!guidesLoading && !guidesError ? { available_guides: guides.map((item) => ({ id: item.id, title: item.label, version: item.version })) } : {}),
    ...(guide && !detailsLoading.terms && !detailsError.terms ? { key_terms: terms.map((item) => ({ id: item.id, term: item.term, definition: item.definition })) } : {}),
    ...(guidesError || error || editError ? { load_error: guidesError || editError || (error instanceof Error ? error.message : "Could not load the guide.") } : {}),
    ...(detailsError.notes || detailsError.terms ? { details_error: detailsError.notes || detailsError.terms || "" } : {}),
  });

  const getScope = initialGuideId ? getDetailScope : getListScope;
  const agentBridge = guide && initialGuideId ? <StudyGuideAgentBridge snapshotRef={annotationsRef} isEditing={editingGuide} /> : null;
  // The canonical right-click menu covers the whole reader (sidebars and gate states
  // included), carrying the open guide's identity when there is one.
  const withMenu = (node: React.ReactNode) => (
    <NonEditableContextMenu
      sourceFeature="notes"
      surfaceName={surfaceName}
      menuVersion={1}
      getApplicationScope={getScope}
      {...(guide
        ? {
            contentSource: noteIdentityContentSource(guide.id),
            entity: { type: "note", id: guide.id, title: guide.label || "Untitled guide" },
            contextData: { content: guide.content ?? "", guideId: guide.id },
            extraSections: [{ id: "study-guide-selection", label: "Study guide", primary: true, items: [{ kind: "item" as const, id: "retry-study-guide", label: "Refresh study guide", icon: BookOpen, onSelect: retryGuide }] }],
          }
        : { contentSource: { type: "raw" as const } })}
    >
      <div className="contents">{node}</div>
    </NonEditableContextMenu>
  );

  const canDeleteGuide = Boolean(guide && guides.some((item) => item.id === guide.id));
  const readerState = loading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Loading study guide</div> : error || (initialGuideId && !guide) ? <AccessGate token="note" id={initialGuideId ?? ""} error={error} onRetry={retryGuide} fallbackHref="/education/study-guides" fallbackLabel="Study guides" /> : guide ? editingGuide ? <main className="flex h-full min-h-0 flex-col bg-background"><div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-2 py-1">{editError && <ErrorNotice size="inline" className="min-w-0 flex-1 text-xs" message={editError} />}<Button icon={<BookOpen aria-hidden />} variant="outline" className="ml-auto" onClick={() => { void finishEditing(); }}>Back to reading</Button></div><div className="min-h-0 flex-1"><NoteWorkspace instanceId={`study-guide-edit:${guide.id}`} noteId={guide.id} className="bg-transparent" /></div></main> : <ReaderContent guide={guide} onEdit={() => { setEditError(null); setTitleDraft(guide.label); dispatch(setNoteEditorMode({ id: guide.id, mode: "write" })); setEditingGuide(true); }} onDelete={() => setPendingDelete(guide)} canDelete={canDeleteGuide} deleting={deletingGuide} jumpRequest={outlineJump} canEdit={canDeleteGuide} onBodySaved={() => { void loadStudyGuide(guide.id).then((saved) => { if (saved) setGuide(saved); }); }} /> : <div className="flex h-full items-center justify-center px-6 text-center"><div><BookOpen className="mx-auto h-8 w-8 text-primary" aria-hidden /><h1 className="mt-3 text-lg font-semibold">Choose a study guide</h1><p className="mt-1 text-sm text-muted-foreground">Select a guide from the left to start reviewing.</p></div></div>;

  const reader = loading || error || !guide ? <div className="scroll-page-end-space h-full min-h-0 overflow-y-auto">{readerState}</div> : readerState;

  const withSidecar = (node: React.ReactNode) => guide ? <AnnotationSidecarProvider source={guideSource(guide, () => { void loadStudyGuide(guide.id).then((next) => { if (next) setGuide(next); }); })}>{node}</AnnotationSidecarProvider> : node;

  const deleteDialog = <ConfirmDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)} title="Move study guide to Trash" description={archiveConfirmSentence(pendingDelete ? `“${pendingDelete.label || "Untitled guide"}”` : "this study guide")} confirmLabel="Move to Trash" variant="destructive" busy={deletingGuide} onConfirm={deleteGuide} />;

  if (isMobile) return withSidecar(<SurfaceRuntimeProvider surfaceName={surfaceName} getScope={getScope} getWriteHandlers={getWriteHandlers}>{agentBridge}{withMenu(<PanelControlProvider initialLayouts={[defaultLayout]}><div className="matrx-touch-targets flex h-full min-h-0 flex-col"><div className="flex items-center justify-between border-b border-border bg-background px-3 py-2"><Button variant="quiet" onClick={() => setMobilePanel("guides")}>Study guides</Button><Button variant="quiet" onClick={() => setMobilePanel("details")}>Study details</Button></div><div className="min-h-0 flex-1">{reader}</div><Drawer open={mobilePanel === "guides"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study guides</DrawerTitle></DrawerHeader><DrawerBody><GuideList guides={guides} activeLabel={guide?.label} activeId={guide?.id ?? initialGuideId} content={guide?.content ?? ""} onJump={(index) => { setOutlineJump((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 })); setMobilePanel(null); }} loading={guidesLoading} error={guidesError} onRetry={retryIndex} onCreate={() => { void createManualGuide(); }} creating={creatingGuide} /></DrawerBody></DrawerContent></Drawer><Drawer open={mobilePanel === "details"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study details</DrawerTitle></DrawerHeader><DrawerBody><Inspector guide={guide} mobile tab={tab} onTabChange={setTab} terms={terms} loading={tab === "terms" ? detailsLoading.terms : false} error={tab === "terms" ? detailsError.terms : null} onRetry={retryDetails} /></DrawerBody></DrawerContent></Drawer>{deleteDialog}</div></PanelControlProvider>)}</SurfaceRuntimeProvider>);

  return withSidecar(<SurfaceRuntimeProvider surfaceName={surfaceName} getScope={getScope} getWriteHandlers={getWriteHandlers}>{agentBridge}{withMenu(<PanelControlProvider initialLayouts={[defaultLayout]}>
    <div className="relative h-full min-h-0 overflow-hidden">
      <ReaderPanelControls />
      <ClientGroup id="study-guide-reader" groupKey="study-guide-reader" cookieName="panels:study-guide-reader" defaultLayout={defaultLayout} orientation="horizontal" className="h-full w-full" resizeTargetMinimumSize={{ coarse: 20, fine: 10 }}>
        <RegisteredPanel registerAs="guides" groupKey="study-guide-reader" id="guides" collapsible collapsedSize="0%" defaultSize="250px" minSize="190px">
          <GuideList guides={guides} activeLabel={guide?.label} activeId={guide?.id ?? initialGuideId} content={guide?.content ?? ""} onJump={(index) => setOutlineJump((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 }))} loading={guidesLoading} error={guidesError} onRetry={retryIndex} onCreate={() => { void createManualGuide(); }} creating={creatingGuide} />
        </RegisteredPanel>
        <Handle hideWhenCollapsed={["guides"]} />
        <Panel id="reader" minSize="35%">
          <ReaderPanelBody>{reader}</ReaderPanelBody>
        </Panel>
        <Handle hideWhenCollapsed={["inspector"]} />
        <RegisteredPanel registerAs="inspector" groupKey="study-guide-reader" id="inspector" collapsible collapsedSize="0%" defaultSize="290px" minSize="220px">
          <Inspector guide={guide} tab={tab} onTabChange={setTab} terms={terms} loading={tab === "terms" ? detailsLoading.terms : false} error={tab === "terms" ? detailsError.terms : null} onRetry={retryDetails} />
        </RegisteredPanel>
      </ClientGroup>
      {deleteDialog}
    </div>
  </PanelControlProvider>)}</SurfaceRuntimeProvider>);
}

export function StudyGuideReader(props: StudyGuideReaderProps) {
  const userId = useAppSelector(selectUserId);
  return <StudyGuideReaderInner key={`${userId}:${props.initialGuideId ?? "library"}:${props.startInEdit ? "edit" : "read"}`} {...props} />;
}
