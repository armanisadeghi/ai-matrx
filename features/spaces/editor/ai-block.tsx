"use client";

// features/spaces/editor/ai-block.tsx — C28: Notion's AI block. "/ai" puts a block on the page that asks what
// to write; the prompt runs the page's writing job (mandate `spaces.writing_assist`, action "prompt", the page
// as named variables — the same job the top Agents menu already discloses), the answer streams in place through
// the one pipeline (MarkdownStream), and the block keeps the prompt and its Markdown (`prompt`, `output`, `ranAt`)
// so it reads the same after a reload. Try again re-runs it; Edit changes the prompt.

import { Button } from "@ai-matrx/design-system/controls";
import { useLiveRunStatus } from "@ai-matrx/chat/agents/components/live-run/useLiveRunStatus";
import { useRetainRequestForViewer } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import MarkdownStream from "@ai-matrx/chat/ui/markdown-stream/MarkdownStream";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AGENT_ICON } from "@/components/icons/domain-icons";
import { toast } from "@/lib/toast";

import { useWritingAssist } from "../ai/spaces-ai";
import { useSpaces } from "../state/SpacesProvider";
import { fromEngine, plainText, type EngineBlock } from "./convert";
import { storedSpec } from "./stored-blocks";

type Ctx = { blockId: string; editor: never; update: (next: Record<string, unknown>) => void };

function Streaming({ conversationId }: { conversationId: string }) {
  const { requestId, isActive, statusText, errorMessage } = useLiveRunStatus(conversationId);
  useRetainRequestForViewer(requestId, "spaces-ai-block");
  if (errorMessage) return <p className="spaces-ai-block-error">{errorMessage}</p>;
  if (!requestId)
    return (
      <p className="spaces-ai-block-status">
        <Loader2 size={14} className="animate-spin" />
        {statusText ?? "Writing…"}
      </p>
    );
  return <MarkdownStream imagePolicy="ai" requestId={requestId} conversationId={conversationId} isStreamActive={isActive} hideCopyButton />;
}

function AiBlockView({ p, ctx }: { p: Record<string, unknown>; ctx: Ctx }) {
  const editor = ctx.editor as unknown as { isEditable: boolean; document: unknown[] };
  const editable = editor.isEditable;
  const prompt = typeof p.prompt === "string" ? p.prompt : "";
  const output = typeof p.output === "string" ? p.output : "";
  const [draft, setDraft] = useState(prompt);
  const [editing, setEditing] = useState(!output);
  const ai = useWritingAssist();
  const params = useParams<{ spaceId?: string }>();
  const { byId } = useSpaces();
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(prompt), [prompt]);
  // Keys typed in the prompt are the prompt's (ProseMirror and the page's key handlers listen above it), so
  // they stop at the field — which React's own handlers (at the root) then never see: Enter / Escape are here.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void generate(input.current?.value ?? draft);
    }
    if (e.key === "Escape" && output) setEditing(false);
  };
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const keep = (e: Event) => {
      e.stopPropagation();
      if (e.type === "keydown") keys.current(e as KeyboardEvent);
    };
    const types = ["keydown", "keypress", "keyup", "beforeinput", "paste", "mousedown", "pointerdown"] as const;
    types.forEach((t) => el.addEventListener(t, keep));
    return () => types.forEach((t) => el.removeEventListener(t, keep));
  }, [editing]);

  const generate = async (text: string) => {
    const ask = text.trim();
    if (!ask) return;
    setEditing(false);
    ctx.update({ ...p, prompt: ask });
    const blocks = fromEngine(editor.document as EngineBlock[]);
    const title = (params?.spaceId && byId.get(params.spaceId)?.title) || "";
    try {
      const answer = await ai.run({ action: "prompt", typedPrompt: ask, selectedText: "", precedingMarkdown: "", pageTitle: title, pageMarkdown: plainText(blocks) });
      if (answer.trim()) ctx.update({ ...p, prompt: ask, output: answer, ranAt: new Date().toISOString() });
      else toast.error("AI wrote nothing — try again");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI could not write this");
      if (!output) setEditing(true);
    }
  };

  const running = ai.isRunning && !!ai.conversationId;
  return (
    <div className="spaces-ai-block" contentEditable={false} data-ai-block="" data-state={running ? "running" : output ? "done" : "empty"}>
      {running ? (
        <div className="spaces-ai-block-body">
          <Streaming conversationId={ai.conversationId!} />
        </div>
      ) : output && !editing ? (
        <div className="spaces-ai-block-body">
          <MarkdownStream imagePolicy="ai" content={output} isStreamActive={false} hideCopyButton />
        </div>
      ) : null}
      {editable && !running ? (
        editing ? (
          <div className="spaces-ai-block-ask">
            <AGENT_ICON size={16} className="spaces-ai-block-icon" />
            <textarea
              ref={input}
              className="spaces-ai-block-input"
              rows={1}
              placeholder={ai.wired ? "Tell AI what to write…" : "AI is not connected yet"}
              disabled={!ai.wired}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button variant="primary" disabled={!ai.wired || !draft.trim()} onClick={() => void generate(draft)}>
              Generate
            </Button>
          </div>
        ) : (
          <div className="spaces-ai-block-tools" onMouseDown={(e) => e.stopPropagation()}>
            <span className="spaces-ai-block-prompt" title={prompt}>
              <AGENT_ICON size={13} />
              <span className="truncate">{prompt}</span>
            </span>
            <button type="button" onClick={() => void generate(prompt)} aria-label="Try again">
              <RotateCcw size={13} /> Try again
            </button>
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit prompt">
              <Pencil size={13} /> Edit
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

export const AiBlock = storedSpec("ai", (p, ctx) => <AiBlockView p={p} ctx={ctx} />);
