"use client";

import Link from "next/link";
import { initialOutlineExpansion, toggleOutlineSection, visibleOutlineItems } from "../outline";
import { StudyFlashcardLinks } from "./StudyFlashcardLinks";
import { useEffect, useRef, useState } from "react";
import { Panel, type Layout } from "react-resizable-panels";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Highlighter,
  LayoutPanelLeft,
  PanelRight,
  Loader2,
  NotebookPen,
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
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { noteIdentityContentSource } from "@/features/notes/richDocumentSource";
import type { Note, NoteListItem } from "@/features/notes/types";
import { parseNoteOutline, type NoteOutlineItem } from "@/features/notes/utils/noteOutline";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { PanelControlProvider, usePanelControls } from "@/features/resizable-panels/PanelControlProvider";
import { RegisteredPanel } from "@/features/resizable-panels/RegisteredPanel";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  loadStudyAnnotations,
  loadStudyGuide,
  loadStudyGuideIndex,
  loadStudyTerms,
  saveStudyAnnotation,
  StudyAnnotationLinkError,
  type StudyAnnotationAnchor,
  type StudyTerm,
} from "../service";

type InspectorTab = "notes" | "terms";

interface SelectionSnapshot {
  quote: string;
  anchor: StudyAnnotationAnchor;
  rect: DOMRect;
}

interface StudyGuideReaderProps {
  initialGuideId?: string;
  defaultLayout?: Layout;
}

interface AnnotationMetadata {
  studyAnnotation?: {
    kind?: "highlight" | "note";
    quote?: string;
    anchor?: StudyAnnotationAnchor | null;
  };
}

function annotationMetadata(note: Note): AnnotationMetadata {
  const value = note.metadata;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = (value as Record<string, unknown>).studyAnnotation;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
  const annotation = candidate as Record<string, unknown>;
  const anchor = annotation.anchor;
  const validAnchor = anchor && typeof anchor === "object" && !Array.isArray(anchor)
    && typeof (anchor as Record<string, unknown>).start === "number"
    && typeof (anchor as Record<string, unknown>).end === "number"
    && typeof (anchor as Record<string, unknown>).prefix === "string"
    && typeof (anchor as Record<string, unknown>).suffix === "string";
  return { studyAnnotation: {
    kind: annotation.kind === "highlight" || annotation.kind === "note" ? annotation.kind : undefined,
    quote: typeof annotation.quote === "string" ? annotation.quote : undefined,
    anchor: validAnchor ? anchor as StudyAnnotationAnchor : undefined,
  } };
}

function readerTextOffset(root: HTMLElement, node: Node, offset: number): number | null {
  const range = document.createRange();
  try {
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return null;
  }
}

function selectionFromReader(root: HTMLElement): SelectionSnapshot | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const rawQuote = selection.toString();
  const quote = rawQuote.trim();
  if (!quote) return null;
  const start = readerTextOffset(root, range.startContainer, range.startOffset);
  const end = readerTextOffset(root, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const leadingWhitespace = rawQuote.length - rawQuote.trimStart().length;
  const trailingWhitespace = rawQuote.length - rawQuote.trimEnd().length;
  const anchoredStart = start + leadingWhitespace;
  const anchoredEnd = end - trailingWhitespace;
  const text = root.textContent ?? "";
  const rect = range.getBoundingClientRect();
  return {
    quote,
    anchor: {
      start: anchoredStart,
      end: anchoredEnd,
      prefix: text.slice(Math.max(0, anchoredStart - 48), anchoredStart),
      suffix: text.slice(anchoredEnd, anchoredEnd + 48),
    },
    rect,
  };
}

function rangeForAnchor(root: HTMLElement, anchor: StudyAnnotationAnchor, quote: string): Range | null {
  const text = root.textContent ?? "";
  let start = anchor.start;
  let end = anchor.end;
  if (text.slice(start, end) !== quote || !text.slice(Math.max(0, start - anchor.prefix.length), start).endsWith(anchor.prefix) || !text.slice(end, end + anchor.suffix.length).startsWith(anchor.suffix)) {
    let match = text.indexOf(quote);
    let found = -1;
    while (match >= 0) {
      const prefix = text.slice(Math.max(0, match - anchor.prefix.length), match);
      const suffix = text.slice(match + quote.length, match + quote.length + anchor.suffix.length);
      if (prefix.endsWith(anchor.prefix) && suffix.startsWith(anchor.suffix)) { found = match; break; }
      match = text.indexOf(quote, match + 1);
    }
    if (found < 0) return null;
    start = found;
    end = found + quote.length;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let startOffset = 0;
  let endOffset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent ?? "";
    const next = cursor + value.length;
    if (!startNode && start >= cursor && start <= next) {
      startNode = node as Text;
      startOffset = start - cursor;
    }
    if (end >= cursor && end <= next) {
      endNode = node as Text;
      endOffset = end - cursor;
      break;
    }
    cursor = next;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function useAnnotationHighlights(
  readerRef: React.RefObject<HTMLDivElement | null>,
  annotations: Note[],
  guideId: string | undefined,
) {
  useEffect(() => {
    const css = CSS as typeof CSS & { highlights?: { set: (key: string, value: unknown) => void; delete: (key: string) => void } };
    const HighlightConstructor = (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!css.highlights || !HighlightConstructor || !guideId || !readerRef.current) return;
    const root = readerRef.current;
    const key = `study-guide-${guideId}`;
    const paint = () => {
      const ranges: Range[] = [];
      for (const annotation of annotations) {
        const data = annotationMetadata(annotation).studyAnnotation;
        if (data?.kind !== "highlight" || !data.anchor || !data.quote) continue;
        const range = rangeForAnchor(root, data.anchor, data.quote);
        if (range) ranges.push(range);
      }
      css.highlights?.set(key, new HighlightConstructor(...ranges));
    };
    paint();
    // RichDocument's content renderer may settle after the annotation request.
    const observer = new MutationObserver(paint);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); css.highlights?.delete(key); };

  }, [annotations, guideId, readerRef]);
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
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
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
  const outline = parseNoteOutline(content);
  const [expanded, setExpanded] = useState(() => initialOutlineExpansion(outline));
  const [activeHeading, setActiveHeading] = useState<number | null>(null);
  if (!outline.length) return null;
  return (
    <div className="border-t border-border py-1">
      <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">On this page</p>
      <div className="grid gap-0.5">{visibleOutlineItems(outline, expanded).map((item) => {
        const index = outline.indexOf(item);
        const hasChildren = outline[index + 1]?.level > item.level;
        return <OutlineItem key={`${item.headingIndex}:${item.charOffset}`} item={item} active={activeHeading === item.headingIndex} onJump={(headingIndex) => { setActiveHeading(headingIndex); if (hasChildren && expanded[headingIndex] === false) setExpanded((current) => toggleOutlineSection(outline, current, headingIndex)); onJump(headingIndex); }} hasChildren={hasChildren} expanded={expanded[item.headingIndex] !== false} onToggle={() => setExpanded((current) => toggleOutlineSection(outline, current, item.headingIndex))} />;
      })}</div>
    </div>
  );
}

function OutlineItem({ item, onJump, hasChildren, expanded, onToggle, active }: { item: NoteOutlineItem; onJump: (index: number) => void; hasChildren: boolean; expanded: boolean; onToggle: () => void; active: boolean }) {
  return <div className={cn("flex min-w-0 items-center border-l-2", active ? "border-primary bg-primary/10" : "border-transparent")} style={{ paddingLeft: `${Math.min(2, Math.max(0, item.level - 1)) * 10}px` }}>{hasChildren ? <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${item.text}`} onClick={onToggle} className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-accent">{expanded ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}</button> : <span className="w-5 shrink-0" />}<button type="button" onClick={() => onJump(item.headingIndex)} title={item.text} className={cn("min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded px-1 py-1 text-left text-xs hover:bg-accent [mask-image:linear-gradient(to_right,black_calc(100%_-_12px),transparent)]", active ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{item.text}</button></div>;
}

function AnnotationCard({ annotation }: { annotation: Note }) {
  const data = annotationMetadata(annotation).studyAnnotation;
  const quote = data?.quote ?? annotation.content ?? "";
  return <Link href={`/education/notes/${annotation.id}`} className="block rounded-xl border border-border bg-card p-1.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30">
    <div className="flex items-center gap-1.5 text-xs font-medium text-primary"><Highlighter className="h-3.5 w-3.5" aria-hidden />{data?.kind === "highlight" ? "Highlight" : "Your note"}</div>
    <p className="mt-1.5 line-clamp-4 text-sm leading-5 text-foreground">{quote}</p>
    {data?.kind === "note" && annotation.content && annotation.content !== quote && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{annotation.content}</p>}
  </Link>;
}

function Inspector({ guide, tab, onTabChange, annotations, terms, loading, error, onRetry }: { guide: Note | null; tab: InspectorTab; onTabChange: (tab: InspectorTab) => void; annotations: Note[]; terms: StudyTerm[]; loading: boolean; error: string | null; onRetry: () => void; mobile?: boolean }) {
  const openCard = useOpenFlashcardItemWindow();
  const [query, setQuery] = useState("");
  const visibleTerms = terms.filter((term) => `${term.term} ${term.definition}`.toLowerCase().includes(query.toLowerCase()));
  return <aside className="matrx-touch-targets flex h-full min-h-0 flex-col bg-muted/20">
    <div className="flex border-b border-border pr-8" role="tablist" aria-label="Study guide details">
      <button type="button" role="tab" aria-selected={tab === "notes"} onClick={() => onTabChange("notes")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "notes" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Your Notes</button>
      <button type="button" role="tab" aria-selected={tab === "terms"} onClick={() => onTabChange("terms")} className={cn("flex-1 border-b-2 px-1 py-2 text-xs font-medium", tab === "terms" ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>Key Terms</button>
    </div>
    <div role="tabpanel" aria-label={tab === "notes" ? "Your Notes" : "Key Terms"} className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto p-1.5">
      {loading ? <div className="space-y-3" aria-label="Loading study details">{[0,1,2].map((item) => <div key={item} className="h-24 animate-pulse rounded border border-border bg-muted" />)}</div> : error ? <div role="alert" className="rounded border border-destructive/30 p-3 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>Try again</Button></div> : tab === "notes" ? <div className="grid gap-3">{annotations.length ? annotations.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} />) : <p className="px-1 py-8 text-sm text-muted-foreground">Select a passage to highlight it or save a note here.</p>}</div> : <div className="grid gap-3">
        <Input aria-label="Search key terms" placeholder="Search terms…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-8 text-sm" />
        {visibleTerms.map((term) => <button key={term.id} type="button" onClick={() => openCard({ front: term.term, back: term.definition, title: term.term })} className="rounded border border-border bg-card p-1.5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"><p className="text-xs font-semibold text-primary">{term.term}</p><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{term.definition || "Open card"}</p></button>)}
        {!visibleTerms.length && <p className="py-5 text-sm text-muted-foreground">{terms.length ? "No terms match that search." : "Link a flashcard deck to see its key terms here."}</p>}
        {guide && <StudyFlashcardLinks guide={guide} onChanged={onRetry} />}
      </div>}
    </div>
  </aside>;
}

function SelectionActions({ selection, guide, onSave, saving, error }: { selection: SelectionSnapshot | null; guide: Note; onSave: (kind: "highlight" | "note", comment?: string) => Promise<void>; saving: boolean; error: string | null }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [comment, setComment] = useState("");
  const openFeedback = useOpenFeedbackWindow();
  if (!selection) return null;
  const tutorSeed = { title: guide.label || "Study guide", material: `Study guide: ${guide.label}\n\nSelected passage:\n${selection.quote}` };
  return <div className="fixed z-50" style={{ left: Math.max(12, Math.min(window.innerWidth - 224, selection.rect.left)), top: Math.max(12, Math.min(window.innerHeight - 260, selection.rect.bottom + 10)) }}>
    <div className="w-52 rounded-lg border border-border bg-popover p-1 shadow-lg">
      <Button size="sm" variant="ghost" className="w-full justify-start" disabled={saving} onClick={() => { void onSave("highlight").catch(() => {}); }}><Highlighter className="mr-2 h-3.5 w-3.5" aria-hidden />Highlight</Button>
      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <PopoverTrigger asChild><Button size="sm" variant="ghost" className="w-full justify-start"><NotebookPen className="mr-2 h-3.5 w-3.5" aria-hidden />Save a note</Button></PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="start"><p className="text-sm font-medium">Save a note about this passage</p><textarea value={comment} className="mt-2 min-h-20 w-full rounded-md border border-input bg-background p-2 text-base" placeholder="What do you want to remember?" onChange={(event) => setComment(event.target.value)} /><Button className="mt-2 w-full" size="sm" disabled={saving} onClick={() => { void onSave("note", comment).then(() => { setComment(""); setNoteOpen(false); }).catch(() => {}); }}>Save note</Button></PopoverContent>
      </Popover>
      <div className="my-1 h-px bg-border" />
      <AskTutorButton seed={tutorSeed} label="I don't get this" variant="ghost" className="w-full justify-start" />
      <AskTutorButton seed={tutorSeed} label="Ask a question" variant="ghost" className="w-full justify-start" />
      <div className="my-1 h-px bg-border" />
      <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => openFeedback({ title: "Report an issue with this study guide" })}><Send className="mr-2 h-3.5 w-3.5" aria-hidden />Report an issue</Button>
    </div>
    {error && <p className="mt-1 max-w-64 rounded border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</p>}
  </div>;
}

function ReaderContent({ guide, annotations, onSaved, onRetry, jumpRequest, onSelectionChange }: { guide: Note; annotations: Note[]; onSaved: (selection: SelectionSnapshot, kind: "highlight" | "note", comment?: string) => Promise<void>; onRetry: () => void; jumpRequest: { index: number; nonce: number } | null; onSelectionChange: () => void }) {
  const readerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useAnnotationHighlights(readerRef, annotations, guide.id);
  const capture = () => { setSelection(readerRef.current ? selectionFromReader(readerRef.current) : null); setSaveError(null); onSelectionChange(); };
  useEffect(() => {
    const clearSelectionMenu = () => setSelection(null);
    window.addEventListener("resize", clearSelectionMenu);
    return () => window.removeEventListener("resize", clearSelectionMenu);
  }, []);
  const save = async (kind: "highlight" | "note", comment?: string) => {
    if (!selection) return;
    setSaving(true);
    try {
      await onSaved(selection, kind, comment);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      setSaveError(null);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not save your annotation. Try again.");
      throw cause;
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (jumpRequest === null) return;
    const headings = readerRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6");
    headings?.item(jumpRequest.index)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpRequest]);
  return <main className="relative flex h-full min-h-0 flex-col bg-background">
    <div className="scroll-page-end-space min-h-0 flex-1 overflow-y-auto" onScroll={() => setSelection(null)} onPointerUp={capture} onKeyUp={capture}>
      <div className="w-full px-3 py-3">
        {!/^\s*#\s/.test(guide.content ?? "") && <div className="mb-7 border-b border-border pb-5"><p className="text-xs font-medium uppercase tracking-wide text-primary">Study guide</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{guide.label || "Untitled guide"}</h1></div>}
        <NonEditableContextMenu sourceFeature="notes" contentSource={noteIdentityContentSource(guide.id)} contextData={{ content: guide.content ?? "", guideId: guide.id }} extraSections={[{ id: "study-guide-selection", label: "Study guide", primary: true, items: [{ kind: "item", id: "retry-study-guide", label: "Refresh study guide", icon: BookOpen, onSelect: onRetry }] }]}>
          <div ref={readerRef} className="study-guide-reader-content"><RichDocument content={guide.content ?? ""} source={noteIdentityContentSource(guide.id)} actionsVariant="icon-only" actionsPosition="top-right" actionsBehavior="hover-only" /></div>
        </NonEditableContextMenu>
      </div>
    </div>
    <style jsx global>{`::highlight(study-guide-${guide.id}) { background: color-mix(in srgb, var(--primary) 28%, transparent); color: inherit; }`}</style>
    <SelectionActions selection={selection} guide={guide} onSave={save} saving={saving} error={saveError} />
  </main>;
}

function StudyGuideReaderInner({ initialGuideId, defaultLayout }: StudyGuideReaderProps) {
  const isMobile = useIsMobile();
  const userId = useAppSelector(selectUserId);
  const [guides, setGuides] = useState<NoteListItem[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(Boolean(userId));
  const [guidesError, setGuidesError] = useState<string | null>(null);
  const [guide, setGuide] = useState<Note | null>(null);
  const [annotations, setAnnotations] = useState<Note[]>([]);
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
  const retryAnnotation = useRef<{ id: string; kind: "highlight" | "note"; quote: string } | undefined>(undefined);

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
    void loadStudyAnnotations(guide.id).then((next) => { if (!stale) setAnnotations(next); })
      .catch((cause: unknown) => { if (!stale) setDetailsError((current) => ({ ...current, notes: cause instanceof Error ? cause.message : "Could not load your notes." })); })
      .finally(() => { if (!stale) setDetailsLoading((current) => ({ ...current, notes: false })); });
    void loadStudyTerms(guide.id).then((next) => { if (!stale) setTerms(next); })
      .catch((cause: unknown) => { if (!stale) setDetailsError((current) => ({ ...current, terms: cause instanceof Error ? cause.message : "Could not load key terms." })); })
      .finally(() => { if (!stale) setDetailsLoading((current) => ({ ...current, terms: false })); });
    return () => { stale = true; };
  }, [guide, detailsTick, userId]);

  const retryIndex = () => { setGuidesError(null); setGuidesLoading(true); setIndexTick((tick) => tick + 1); };
  const retryGuide = () => { setError(null); setLoading(true); setGuideTick((tick) => tick + 1); };
  const retryDetails = () => { setDetailsError({ notes: null, terms: null }); setDetailsLoading({ notes: true, terms: true }); setDetailsTick((tick) => tick + 1); };

  const saveAnnotation = async (selection: SelectionSnapshot, kind: "highlight" | "note", comment?: string) => {
    if (!guide?.organization_id) throw new Error("This guide does not have an organization available for annotations.");
    try {
      const saved = await saveStudyAnnotation({ noteId: guide.id, noteTitle: guide.label || "Study guide", quote: selection.quote, comment, kind, organizationId: guide.organization_id, anchor: selection.anchor, existingAnnotationId: retryAnnotation.current?.kind === kind && retryAnnotation.current.quote === selection.quote ? retryAnnotation.current.id : undefined });
      retryAnnotation.current = undefined;
      setTab("notes");
      setAnnotations((current) => [saved, ...current.filter((annotation) => annotation.id !== saved.id)]);
    } catch (cause) {
      if (cause instanceof StudyAnnotationLinkError) retryAnnotation.current = { id: cause.note.id, kind, quote: selection.quote };
      throw cause;
    }
  };

  const readerState = loading ? <div className="flex h-full items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />Loading study guide</div> : error || (initialGuideId && !guide) ? <AccessGate token="note" id={initialGuideId ?? ""} error={error} onRetry={retryGuide} fallbackHref="/education/study-guides" fallbackLabel="Study guides" /> : guide ? <ReaderContent guide={guide} annotations={annotations} onSaved={saveAnnotation} onRetry={retryGuide} jumpRequest={outlineJump} onSelectionChange={() => { retryAnnotation.current = undefined; }} /> : <div className="flex h-full items-center justify-center px-6 text-center"><div><BookOpen className="mx-auto h-8 w-8 text-primary" aria-hidden /><h1 className="mt-3 text-lg font-semibold">Choose a study guide</h1><p className="mt-1 text-sm text-muted-foreground">Select a guide from the left to start reviewing.</p></div></div>;

  const reader = loading || error || !guide ? <div className="scroll-page-end-space h-full min-h-0 overflow-y-auto">{readerState}</div> : readerState;

  if (isMobile) return <PanelControlProvider initialLayouts={[defaultLayout]}><div className="matrx-touch-targets flex h-full min-h-0 flex-col"><div className="flex items-center justify-between border-b border-border bg-background px-3 py-2"><Button size="sm" variant="ghost" onClick={() => setMobilePanel("guides")}>Study guides</Button><Button size="sm" variant="ghost" onClick={() => setMobilePanel("details")}>Notes & terms</Button></div><div className="min-h-0 flex-1">{reader}</div><Drawer open={mobilePanel === "guides"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study guides</DrawerTitle></DrawerHeader><DrawerBody><GuideList guides={guides} activeLabel={guide?.label} activeId={guide?.id ?? initialGuideId} content={guide?.content ?? ""} onJump={(index) => { setOutlineJump((current) => ({ index, nonce: (current?.nonce ?? 0) + 1 })); setMobilePanel(null); }} loading={guidesLoading} error={guidesError} onRetry={retryIndex} /></DrawerBody></DrawerContent></Drawer><Drawer open={mobilePanel === "details"} onOpenChange={(open) => !open && setMobilePanel(null)}><DrawerContent className="h-[92dvh]"><DrawerHeader><DrawerTitle>Study details</DrawerTitle></DrawerHeader><DrawerBody><Inspector guide={guide} mobile tab={tab} onTabChange={setTab} annotations={annotations} terms={terms} loading={detailsLoading[tab]} error={detailsError[tab]} onRetry={retryDetails} /></DrawerBody></DrawerContent></Drawer></div></PanelControlProvider>;

  return <PanelControlProvider initialLayouts={[defaultLayout]}>
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
          <Inspector guide={guide} tab={tab} onTabChange={setTab} annotations={annotations} terms={terms} loading={detailsLoading[tab]} error={detailsError[tab]} onRetry={retryDetails} />
        </RegisteredPanel>
      </ClientGroup>
    </div>
  </PanelControlProvider>;
}

export function StudyGuideReader(props: StudyGuideReaderProps) {
  const userId = useAppSelector(selectUserId);
  return <StudyGuideReaderInner key={`${userId}:${props.initialGuideId ?? "library"}`} {...props} />;
}
