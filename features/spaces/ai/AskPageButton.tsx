"use client";

// features/spaces/ai/AskPageButton.tsx — "Ask about this page" (M4): a question field in the top bar;
// sending opens the chat panel at the right with the page title and its Markdown as hidden variables
// (the question is the only user input and the only words shown). Not wired → the field says "AI is not connected yet".

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { ArrowUp } from "lucide-react";
import { useState } from "react";

import { AGENT_ICON } from "@/components/icons/domain-icons";
import { toast } from "@/lib/toast";

import { useAskPage } from "./spaces-ai";

export function AskPageButton({ page }: { page: () => { title: string; markdown: string } }) {
  const { wired, ask } = useAskPage();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const send = () => {
    const q = question.trim();
    if (!q || !wired) return;
    setOpen(false);
    setQuestion("");
    void Promise.resolve(ask(page(), q)).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "The question could not be sent."));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="spaces-topbar-button" aria-label="Ask AI about this page" title="Ask AI about this page">
          <AGENT_ICON size={17} />
        </button>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */ surface="solid" align="end" className="spaces-ai w-[min(420px,92vw)] p-0">
        <form
          className="spaces-ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <AGENT_ICON size={16} className="text-[var(--spaces-ink-soft)]" />
          <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this page…" aria-label="Ask about this page" />
          <Button type="submit" variant="quiet" icon={<ArrowUp size={16} />} aria-label="Send" disabled={!question.trim() || !wired} />
        </form>
        {!wired ? <p className="spaces-ai-note">AI is not connected yet</p> : null}
      </PopoverContent>
    </Popover>
  );
}
