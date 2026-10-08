"use client";

// features/spaces/ai/AskAiMenu.tsx — Notion's "Ask AI" box (M1 empty line, M2 selection): a prompt
// field over the suggested actions; a run streams under it through the one pipeline (`LiveRunDisplay`),
// then Replace / Insert below / Discard / Try again (Explain: Insert below only). The answer's Markdown
// becomes blocks through `notionMarkdownToBlocks`. Not wired → the box says "AI is not connected yet".

import { Popover, PopoverAnchor, PopoverContent } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { useLiveRunStatus } from "@ai-matrx/chat/agents/components/live-run/useLiveRunStatus";
import { useRetainRequestForViewer } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { selectLatestAnswerText } from "@ai-matrx/chat/agents/redux/execution-system/selectors/aggregate.selectors";
import { useAppSelector } from "@ai-matrx/chat/store/hooks";
import {
  AlignLeft,
  ArrowUp,
  BookOpen,
  Check,
  ChevronRight,
  CornerDownLeft,
  Languages,
  ListCollapse,
  Mic,
  PenLine,
  Redo2,
  Replace,
  SpellCheck,
  Text,
  Trash2,
  WrapText,
  Loader2,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import MarkdownStream from "@ai-matrx/chat/host/markdown-slots";
import { notionMarkdownToBlocks } from "@/lib/spaces-blocks/notion-markdown";

import { toEngine } from "../editor/convert";
import type { SpacesEditor } from "../editor/schema";
import { useWritingAssist, type WritingAction, type WritingRequest } from "./spaces-ai";

export interface AskAiTarget {
  /** Where the box opens (viewport px, under the selection or the empty line). */
  at: { left: number; top: number };
  mode: "selection" | "empty-line";
  blockIds: string[];
  selectedText: string;
  precedingMarkdown: string;
}

const TONES = ["Professional", "Casual", "Straightforward", "Confident", "Friendly"];
const LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Chinese", "Japanese", "Korean", "Arabic"];

interface Item {
  action: WritingAction;
  label: string;
  icon: ReactNode;
  sub?: { key: "tone" | "targetLanguage"; values: string[] };
}

const SELECTION_GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Edit or review selection",
    items: [
      { action: "improve", label: "Improve writing", icon: <PenLine size={16} /> },
      { action: "fix_spelling", label: "Fix spelling & grammar", icon: <SpellCheck size={16} /> },
      { action: "shorter", label: "Make shorter", icon: <ListCollapse size={16} /> },
      { action: "longer", label: "Make longer", icon: <WrapText size={16} /> },
      { action: "tone", label: "Change tone", icon: <Mic size={16} />, sub: { key: "tone", values: TONES } },
      { action: "simplify", label: "Simplify language", icon: <Text size={16} /> },
    ],
  },
  {
    title: "Generate from selection",
    items: [
      { action: "summarize", label: "Summarize", icon: <AlignLeft size={16} /> },
      { action: "translate", label: "Translate", icon: <Languages size={16} />, sub: { key: "targetLanguage", values: LANGUAGES } },
      { action: "explain", label: "Explain this", icon: <BookOpen size={16} /> },
    ],
  },
];

const EMPTY_LINE_GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Write",
    items: [
      { action: "continue", label: "Continue writing", icon: <PenLine size={16} /> },
      { action: "summarize", label: "Summarize this page", icon: <AlignLeft size={16} /> },
      { action: "translate", label: "Translate this page", icon: <Languages size={16} />, sub: { key: "targetLanguage", values: LANGUAGES } },
    ],
  },
];

/**
 * The answer itself, nothing else (Notion's card has no copy / edit / pin / share / speaker / thumbs):
 * the one stream renderer over the run's request, with the box's own Replace / Insert below / Try again
 * / Discard under it.
 */
function Answer({ conversationId }: { conversationId: string }) {
  const { requestId, isActive, statusText, errorMessage } = useLiveRunStatus(conversationId);
  useRetainRequestForViewer(requestId, "spaces-ask-ai");
  if (errorMessage) {
    return (
      <p className="px-2 pb-2 text-xs text-destructive">
        {errorMessage} <ErrorAlchemyMenu error={errorMessage} />
      </p>
    );
  }
  if (!requestId) {
    return (
      <p className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        {statusText ?? "Starting…"}
      </p>
    );
  }
  return (
    <div className="max-h-[40dvh] overflow-y-auto px-2">
      <MarkdownStream imagePolicy="ai" requestId={requestId} conversationId={conversationId} isStreamActive={isActive} hideCopyButton />
    </div>
  );
}

/** The settled answer text (never the live stream) — what Replace / Insert below write. */
function useAnswer(conversationId: string | null): string {
  return useAppSelector(selectLatestAnswerText(conversationId ?? "")) ?? "";
}

export function AskAiMenu({
  editor,
  target,
  page,
  onClose,
}: {
  editor: SpacesEditor;
  target: AskAiTarget;
  page: () => { title: string; markdown: string };
  onClose: () => void;
}) {
  const ai = useWritingAssist();
  const [prompt, setPrompt] = useState("");
  const [sub, setSub] = useState<Item | null>(null);
  const [last, setLast] = useState<WritingRequest | null>(null);
  const [notConnected, setNotConnected] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const answer = useAnswer(ai.conversationId);
  const inputRef = useRef<HTMLInputElement>(null);
  const groups = target.mode === "selection" ? SELECTION_GROUPS : EMPTY_LINE_GROUPS;
  const q = prompt.trim().toLowerCase();
  const done = Boolean(last) && !ai.isRunning && !failed;

  const start = (action: WritingAction, extra: Partial<WritingRequest> = {}) => {
    const { title, markdown } = page();
    const req: WritingRequest = {
      action,
      selectedText: target.selectedText,
      precedingMarkdown: target.precedingMarkdown,
      pageTitle: title,
      pageMarkdown: markdown,
      typedPrompt: prompt.trim() || undefined,
      ...extra,
    };
    setSub(null);
    setFailed(null);
    if (!ai.wired) {
      setNotConnected(true);
      return;
    }
    setLast(req);
    void ai.run(req).catch((e: unknown) => setFailed(e instanceof Error ? e.message : "The AI run failed."));
  };

  const blocksOfAnswer = () => {
    const { blocks } = notionMarkdownToBlocks(answer, { idSeed: `ai:${crypto.randomUUID()}` });
    return toEngine(blocks) as never[];
  };
  const insertBelow = () => {
    const after = target.blockIds[target.blockIds.length - 1];
    const made = blocksOfAnswer();
    if (made.length && after) editor.insertBlocks(made, after, "after");
    close();
  };
  const replace = () => {
    const made = blocksOfAnswer();
    if (made.length && target.blockIds.length) editor.replaceBlocks(target.blockIds, made);
    close();
  };
  const close = () => {
    ai.dismiss();
    onClose();
  };

  const canReplace = target.mode === "selection" && last?.action !== "explain";

  return (
    <Popover open onOpenChange={(o) => !o && close()}>
      <PopoverAnchor asChild>
        <span aria-hidden style={{ position: "fixed", left: target.at.left, top: target.at.top, width: 1, height: 1 }} />
      </PopoverAnchor>
      <PopoverContent
        surface="solid"
        align="start"
        side="bottom"
        className="spaces-ai w-[min(560px,92vw)] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {ai.conversationId && (ai.isRunning || last) ? (
          <div className="spaces-ai-answer">
            <Answer conversationId={ai.conversationId} />
          </div>
        ) : null}
        <form
          className="spaces-ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            if (prompt.trim()) start("prompt");
          }}
        >
          <AGENT_ICON size={16} className="text-[var(--spaces-ink-soft)]" />
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            placeholder={done ? "Tell AI what to do next…" : "Ask AI anything…"}
            aria-label="Ask AI"
            disabled={ai.isRunning}
          />
          <Button type="submit" variant="quiet" icon={<ArrowUp size={16} />} aria-label="Send" disabled={!prompt.trim() || ai.isRunning} />
        </form>
        {notConnected ? <p className="spaces-ai-note">AI is not connected yet</p> : null}
        {failed ? <p className="spaces-ai-note" data-tone="error">{failed}</p> : null}
        {done ? (
          <div className="spaces-ai-menu" role="menu">
            {canReplace ? <MenuRow icon={<Replace size={16} />} label="Replace selection" onClick={replace} /> : null}
            <MenuRow icon={<CornerDownLeft size={16} />} label="Insert below" onClick={insertBelow} />
            <MenuRow icon={<Redo2 size={16} />} label="Try again" onClick={() => last && start(last.action, last)} />
            <MenuRow icon={<Trash2 size={16} />} label="Discard" onClick={close} />
          </div>
        ) : !ai.isRunning ? (
          <div className="spaces-ai-menu" role="menu">
            {sub ? (
              <>
                <p className="spaces-ai-group">{sub.label}</p>
                {sub.sub!.values.map((v) => (
                  <MenuRow key={v} icon={<Check size={16} className="opacity-0" />} label={v} onClick={() => start(sub.action, { [sub.sub!.key]: v })} />
                ))}
              </>
            ) : (
              groups.map((g) => {
                const items = g.items.filter((i) => !q || i.label.toLowerCase().includes(q));
                if (!items.length) return null;
                return (
                  <div key={g.title}>
                    <p className="spaces-ai-group">{g.title}</p>
                    {items.map((i) => (
                      <MenuRow
                        key={i.label}
                        icon={i.icon}
                        label={i.label}
                        end={i.sub ? <ChevronRight size={14} /> : undefined}
                        onClick={() => (i.sub ? setSub(i) : start(i.action))}
                      />
                    ))}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MenuRow({ icon, label, end, onClick }: { icon: ReactNode; label: string; end?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="spaces-menu-row" onClick={onClick}>
      <span className="spaces-menu-row-icon">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {end}
    </button>
  );
}
