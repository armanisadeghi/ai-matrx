"use client";

// features/spaces/ai/spaces-ai.ts — the AI port of Spaces (contract.ts SpacesAiPort, parity § M).
//
// Two fixed jobs, both mandates (the agent lives in the database; nothing here names an agent or a prompt):
//   spaces.writing_assist — the selection / empty-line "Ask AI" actions (M1, M2), run headless for text
//                           through `useLiveAgentRun`, streamed by `<LiveRunDisplay>` (the one pipeline);
//   spaces.ask_page       — "Ask about this page" (M4), a chat-assistant run through `launchAgentExecution`.
// Each job is looked up in the installed `MANDATE_KEYS`; until @ai-matrx/agents publishes it the job is
// not wired and the surface says "AI is not connected yet". Both are disclosed in the top Agents menu
// (`useDeclaredSurfaceMandates`) only when wired — never a dead job in the menu.

import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useLiveAgentRun } from "@ai-matrx/chat/agents/hooks/useLiveAgentRun";
import { launchAgentExecution } from "@ai-matrx/chat/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import { useAppDispatch } from "@ai-matrx/chat/store/hooks";
import { useDeclaredSurfaceMandates, type SurfaceMandateRef } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";

type MandateKey = SurfaceMandateRef["mandateKey"];

/** A key from the installed declared set, or null while the package does not carry it yet. */
function declaredKey(name: string): MandateKey | null {
  const value = (MANDATE_KEYS as unknown as Record<string, string | undefined>)[name];
  return value ? (value as MandateKey) : null;
}

export const WRITING_ASSIST_KEY = declaredKey("spaces__writing_assist");
export const ASK_PAGE_KEY = declaredKey("spaces__ask_page");
/** "Build with AI" / "Ask AI to change this page" — the Space Builder (ai/SpaceBuilder.tsx). */
export const BUILD_KEY = declaredKey("spaces__build");
/** "Database with AI" / "Redesign with AI" — the Database Designer (ai/DatabaseDesigner.tsx). */
export const DESIGN_DATABASE_KEY = declaredKey("spaces__design_database");
/** "Import from Notion" — the Move-in Assistant (ai/MoveIn.tsx). */
export const MOVE_IN_KEY = declaredKey("spaces__move_in");
/** AI autofill properties of a database block (data/ai-autofill.tsx). */
export const AUTOFILL_KEY = declaredKey("spaces__autofill");

const SURFACE_KEY = "spaces-page";
const SOURCE_FEATURE = "documents" as const;

export type WritingAction =
  | "improve"
  | "fix_spelling"
  | "shorter"
  | "longer"
  | "tone"
  | "simplify"
  | "summarize"
  | "translate"
  | "explain"
  | "continue"
  | "prompt";

export interface WritingRequest {
  action: WritingAction;
  selectedText: string;
  precedingMarkdown: string;
  pageTitle: string;
  pageMarkdown: string;
  tone?: string;
  targetLanguage?: string;
  /** What the person typed — only that; page content goes as named variables. */
  typedPrompt?: string;
}

/** Registers the wired jobs in the top Agents menu; draws nothing. */
export function useSpacesAiDisclosure(): void {
  const refs: SurfaceMandateRef[] = [];
  if (WRITING_ASSIST_KEY) refs.push({ mandateKey: WRITING_ASSIST_KEY, does: "writes and edits text on this page, and writes AI blocks" });
  if (ASK_PAGE_KEY) refs.push({ mandateKey: ASK_PAGE_KEY, does: "answers questions about this page" });
  useDeclaredSurfaceMandates(refs);
}

/** The Space Builder, disclosed wherever its doors are (the whole Spaces frame); draws nothing. */
export function useSpaceBuilderDisclosure(): void {
  useDeclaredSurfaceMandates(BUILD_KEY ? [{ mandateKey: BUILD_KEY, does: "builds a Space or changes this page on request" }] : []);
}

/** M1 / M2 — one writing run at a time; the live text is read from `conversationId`. */
export function useWritingAssist() {
  const live = useLiveAgentRun();
  const run = async (req: WritingRequest): Promise<string> => {
    if (!WRITING_ASSIST_KEY) throw new Error("AI is not connected yet");
    const out = await live.run<unknown>({
      mandateKey: WRITING_ASSIST_KEY,
      variables: {
        action: req.action,
        selected_text: req.selectedText,
        preceding_markdown: req.precedingMarkdown,
        page_title: req.pageTitle,
        page_markdown: req.pageMarkdown,
        tone: req.tone ?? "",
        target_language: req.targetLanguage ?? "",
      },
      userInput: req.typedPrompt || undefined,
      expect: "text",
      surfaceName: null,
      sourceFeature: SOURCE_FEATURE,
      surfaceKey: SURFACE_KEY,
    });
    return typeof out === "string" ? out : "";
  };
  return { ...live, wired: Boolean(WRITING_ASSIST_KEY), run };
}

/** M4 — "Ask about this page": opens the chat assistant with the page as named variables. */
export function useAskPage() {
  const dispatch = useAppDispatch();
  const ask = (page: { title: string; markdown: string }, question: string) => {
    if (!ASK_PAGE_KEY) throw new Error("AI is not connected yet");
    return dispatch(
      launchAgentExecution({
        mandateKey: ASK_PAGE_KEY,
        surfaceKey: SURFACE_KEY,
        sourceFeature: SOURCE_FEATURE,
        runtime: { variables: { page_title: page.title, page_markdown: page.markdown }, userInput: question || undefined },
        // Notion's page chat: a panel at the right, the page given as hidden context — the variables are
        // supplied, never shown as fields, and only the person's question appears in the transcript.
        config: { displayMode: "sidebar", allowChat: true, autoRun: true, showVariablePanel: false, showDefinitionMessages: false },
      }),
    );
  };
  return { wired: Boolean(ASK_PAGE_KEY), ask };
}
