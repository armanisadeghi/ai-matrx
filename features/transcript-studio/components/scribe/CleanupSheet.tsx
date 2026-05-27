"use client";

/**
 * CleanupSheet — Scribe's one-shot transcript cleanup drawer.
 *
 * Mirrors the agent options offered by the standalone Transcription Cleanup
 * window panel, but scoped to a Scribe session: the input is "all current
 * raw transcripts for this session" (joined in the same recording-by-recording
 * order the assistant context uses), the output is persisted as a
 * `studio_documents` row with `kind="scribe_cleanup"`, and the assistant
 * context builder picks it up automatically on the next turn as the
 * `cleaned_transcripts` named context — explicitly labeled as a DUPLICATE of
 * the raw recordings so the model never double-counts it.
 *
 * Phase 1 affordances (kept deliberately minimal — see ScribeScreen menu):
 *   - agent picker (defaults to AI_POST_PROCESS_AGENTS[0])
 *   - Run / Re-run button
 *   - live streaming preview with `<thinking>` stripped
 *   - "Saved" badge once persisted
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useSetting } from "@/features/settings/hooks/useSetting";
import { stripThinkingStreaming } from "@/features/notes/actions/quick-save/utils/stripThinking";
import type { CustomCleanerAgent } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import {
  AI_POST_PROCESS_AGENTS,
  DEFAULT_AI_POST_PROCESS_AGENT_ID,
  type AiPostProcessAgent,
} from "@/components/official-candidate/transcription-cleanup/ai-agents";
import { useAiPostProcess } from "@/components/official-candidate/transcription-cleanup/hooks/useAiPostProcess";
import {
  selectRawSegmentsForRecording,
  selectRecordingSegments,
  selectScribeCleanupDocument,
} from "../../redux/selectors";
import { upsertScribeCleanupDocumentThunk } from "../../redux/thunks";
import type { RootState } from "@/lib/redux/store";

interface CleanupSheetProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional — called after a successful persist so the parent can refresh
   *  the assistant's named-context payload for the next turn. */
  onPersisted?: () => void;
}

function useJoinedSessionTranscript(sessionId: string): string {
  return useAppSelector((state: RootState) => {
    const recordings = selectRecordingSegments(sessionId)(state);
    const parts: string[] = [];
    recordings.forEach((rec, idx) => {
      const raws = selectRawSegmentsForRecording(sessionId, rec.id)(state);
      const text = raws
        .map((r) => r.text)
        .join(" ")
        .trim();
      if (!text) return;
      const n = String(idx + 1).padStart(2, "0");
      parts.push(`# Recording ${n}\n${text}`);
    });
    return parts.join("\n\n").trim();
  });
}

export function CleanupSheet({
  sessionId,
  open,
  onOpenChange,
  onPersisted,
}: CleanupSheetProps) {
  const dispatch = useAppDispatch();
  const transcript = useJoinedSessionTranscript(sessionId);
  const existing = useAppSelector(selectScribeCleanupDocument(sessionId));

  // Picker — same options as the standalone Transcription Cleanup window:
  // built-in agents + the user's custom cleaner agents from preferences.
  const [customAgents] = useSetting<CustomCleanerAgent[]>(
    "userPreferences.transcription.customCleanerAgents",
  );
  const allAgents = useMemo<AiPostProcessAgent[]>(() => {
    if (!customAgents || customAgents.length === 0)
      return AI_POST_PROCESS_AGENTS;
    const customMapped: AiPostProcessAgent[] = customAgents.map((a) => ({
      id: a.id,
      name: a.displayName,
      transcriptVariableKey: a.transcriptVariableKey,
      contextSlotKey: a.contextSlotKey,
      contextVariableKey: a.contextVariableKey,
    }));
    return [...AI_POST_PROCESS_AGENTS, ...customMapped];
  }, [customAgents]);

  const [agentId, setAgentId] = useState<string>(
    DEFAULT_AI_POST_PROCESS_AGENT_ID,
  );
  const selectedAgent = useMemo<AiPostProcessAgent>(
    () => allAgents.find((a) => a.id === agentId) ?? allAgents[0],
    [agentId, allAgents],
  );

  const ai = useAiPostProcess();
  const { visible: streamed } = useMemo(
    () => stripThinkingStreaming(ai.accumulatedText ?? ""),
    [ai.accumulatedText],
  );

  // Persist exactly once per run when the request completes.
  const persistedFor = useRef<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (ai.phase !== "complete") return;
    const text = streamed.trim();
    if (!text) return;
    if (!ai.requestId || persistedFor.current === ai.requestId) return;
    persistedFor.current = ai.requestId;
    void dispatch(
      upsertScribeCleanupDocumentThunk({
        sessionId,
        content: text,
        agentName: selectedAgent.name,
      }),
    )
      .unwrap()
      .then(() => {
        setSavedAt(Date.now());
        onPersisted?.();
      })
      .catch(() => {
        // toast is handled inside the thunk
      });
  }, [
    ai.phase,
    ai.requestId,
    streamed,
    dispatch,
    sessionId,
    selectedAgent.name,
    onPersisted,
  ]);

  const handleRun = useCallback(() => {
    const t = transcript.trim();
    if (!t) {
      toast.error("Nothing to clean yet — record something first.");
      return;
    }
    setSavedAt(null);
    void ai.process({ agent: selectedAgent, transcript: t, context: "" });
  }, [transcript, selectedAgent, ai]);

  // Reset transient UI when the drawer closes so a re-open starts fresh.
  useEffect(() => {
    if (!open) {
      ai.reset();
      setSavedAt(null);
      persistedFor.current = null;
    }
    // ai.reset is stable enough; intentionally not in deps to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isBusy = ai.isBusy;
  const hasOutput = streamed.trim().length > 0;
  const hasTranscript = transcript.trim().length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto flex max-h-[88dvh] max-w-lg flex-col">
        <DrawerHeader className="pb-2 text-left">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" />
            Clean up transcripts
          </DrawerTitle>
          <p className="text-xs text-muted-foreground">
            Run an AI cleanup over every recording in this session. The cleaned
            copy is saved and given to your assistant as context (clearly
            labeled as a duplicate of the raw recordings).
          </p>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* Agent picker */}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">
              Cleanup style
            </legend>
            {allAgents.map((agent) => {
              const checked = agent.id === agentId;
              return (
                <label
                  key={agent.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-accent/40",
                  )}
                >
                  <input
                    type="radio"
                    name="scribe-cleanup-agent"
                    value={agent.id}
                    checked={checked}
                    onChange={() => setAgentId(agent.id)}
                    disabled={isBusy}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">
                      {agent.name}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {/* Run / status */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleRun}
              disabled={isBusy || !hasTranscript}
              className="gap-1.5"
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {existing && !isBusy ? "Re-run cleanup" : "Run cleanup"}
            </Button>
            {savedAt && !isBusy && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-500">
                <Check className="h-3.5 w-3.5" />
                Saved — your assistant has it now
              </span>
            )}
            {!hasTranscript && (
              <span className="text-xs text-muted-foreground">
                Record something to enable cleanup.
              </span>
            )}
            {ai.error && (
              <span className="text-xs text-destructive">{ai.error}</span>
            )}
          </div>

          {/* Output panel */}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3">
            {hasOutput ? (
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                {streamed}
              </pre>
            ) : existing ? (
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                {existing.content}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground">
                Output will appear here.
              </p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
