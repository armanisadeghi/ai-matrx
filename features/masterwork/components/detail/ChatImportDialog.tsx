"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileUp, Sparkles, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import { callApi } from "@/lib/api/call-api";
import { useAppStore } from "@/lib/redux/hooks";
import { operationFailed } from "@/utils/errors";
import { supabase } from "@/utils/supabase/client";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";
import {
  describeIngest,
  parseIngestSummary,
  type IngestSummary,
} from "./IngestSourceDialog";

/**
 * "Import your AI chats" — the chat-import Distillation Approach.
 *
 * An Expert's history with ChatGPT / Claude / Gemini / Grok / Meta AI / coding
 * assistants is a distillation corpus: across many conversations they
 * corrected the AI, insisted on their way, rejected drafts, and repeated the
 * same demands. Three doors, one distiller:
 *
 * - UPLOAD the provider export (the whole zip is fine) — parsed server-side,
 *   then a conversation PICKER (never limited to one chat) with an optional
 *   AI shortlist assist, then `/masterworks/ingest-chat`.
 * - PASTE any conversation — the universal door.
 * - AI MATRX — the zero-upload lane: the conversations already here
 *   (coding sessions included) via `/masterworks/ingest-conversations`.
 *
 * The distiller mines the EXPERT'S OWN judgment, never the AI's opinions.
 * Rules land as drafts through the same review loop as every lane. Durable
 * run (`useMasterworkRun`) — reload mid-distillation and it picks back up.
 *
 * The public hand-holding guides ("how do I even get my export?") live at
 * /import/ai-chats — linked from here, reusable per THE HOUSE DOCTRINE
 * (features/source-onboarding/).
 *
 * TWO HOSTS, ONE IMPLEMENTATION (Arman's ruling: every creation/working mode
 * gets a real URL): the Rulebook page's dialog (`variant="dialog"`, default,
 * opened by the "Your AI chats" toolbar button or `?chatImport=1`, with a
 * "Full page" door) and the route `/masterwork/[id]/import`
 * (`variant="page"`) both render exactly this component.
 */

const PREVIEW_PATH = "/masterworks/chat-import/preview" satisfies keyof paths;
const SHORTLIST_PATH =
  "/masterworks/chat-import/shortlist" satisfies keyof paths;
const INGEST_CHAT_PATH = "/masterworks/ingest-chat" satisfies keyof paths;
const INGEST_CONVERSATIONS_PATH =
  "/masterworks/ingest-conversations" satisfies keyof paths;

const EXPORT_ACCEPT = ".zip,.json,.jsonl,.txt,.md";
/** The server refuses selections beyond its cost cap; warn before launching. */
const MAX_SELECTED = 200;

type ChatTab = "upload" | "paste" | "matrx";

interface ConversationRow {
  key: string;
  title: string;
  provider: string;
  turns: number;
  userWords: number;
  updatedAt: string | null;
  /** The shortlister's plain-language reason, when it picked this one. */
  reason?: string;
}

const TAB_OPTIONS: { value: ChatTab; title: string; blurb: string }[] = [
  {
    value: "upload",
    title: "Upload an export",
    blurb: "The zip or file your AI assistant gave you.",
  },
  {
    value: "paste",
    title: "Paste a conversation",
    blurb: "Works with anything — copy, paste, done.",
  },
  {
    value: "matrx",
    title: "Your AI Matrx chats",
    blurb: "Already here. Nothing to export.",
  },
];

function formatWords(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k words`;
  return `${count} words`;
}

const CHAT_IMPORT_DESCRIPTION =
  "Your chats with AI assistants are full of your own judgment — what you " +
  "corrected, insisted on, and rejected. Pick the conversations that matter " +
  "and we mine YOUR rules from them, never the AI's opinions. Everything " +
  "lands as drafts you approve.";

export function ChatImportDialog({
  open,
  onOpenChange,
  rulebook,
  initialTab,
  onIngested,
  onFollowupSeed,
  variant = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  initialTab?: ChatTab;
  onIngested?: () => void;
  onFollowupSeed?: (seed: string) => void;
  /** "page" renders the same lane bare for /masterwork/[id]/import. */
  variant?: "dialog" | "page";
}) {
  const store = useAppStore();
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<ChatTab>(initialTab ?? "upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [topic, setTopic] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [shortlisting, setShortlisting] = useState(false);
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<string[]>([]);

  const run = useMasterworkRun<IngestSummary>({
    surface: "chat",
    rulebookId: rulebook.id,
    path: tab === "matrx" ? INGEST_CONVERSATIONS_PATH : INGEST_CHAT_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running || preparing;
  const summary = run.result ? describeIngest(run.result) : null;
  const rejoining = run.status === "rejoining";

  const visibleRows = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(term));
  }, [rows, search]);

  const resetPicker = () => {
    setRows(null);
    setSelected(new Set());
    setSearch("");
    setNotes([]);
    setFileId(null);
  };

  const reset = () => {
    run.reset();
    resetPicker();
    setPreparing(false);
    setShortlisting(false);
  };

  useEffect(() => {
    if (run.result) onIngested?.();
  }, [run.result, onIngested]);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload must be VISIBLE (same rule as the
  // source dialog) — rejoining behind a closed dialog reads as "nothing
  // happened", which is the defect durability exists to kill.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !run.running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  // ── the three doors → one picker ─────────────────────────────────────────

  const previewSource = async (body: {
    file_id?: string;
    text?: string;
  }): Promise<void> => {
    const result = await store.dispatch(
      callApi({ path: PREVIEW_PATH, method: "POST", body: body as never }),
    );
    const error = (result as { error?: { message?: string } }).error;
    if (error) {
      throw new Error(
        error.message ?? "We couldn't read that export. Try again.",
      );
    }
    const data = (
      result as {
        data?: {
          conversations?: {
            key: string;
            title: string;
            provider: string;
            turns: number;
            user_words: number;
            updated_at?: string | null;
          }[];
          notes?: string[];
        };
      }
    ).data;
    const conversations = data?.conversations ?? [];
    if (conversations.length === 0) {
      throw new Error(
        "We couldn't find any conversations in that. If it's a zip, try the conversations file inside it — or paste the text directly.",
      );
    }
    setRows(
      conversations.map((c) => ({
        key: c.key,
        title: c.title,
        provider: c.provider,
        turns: c.turns,
        userWords: c.user_words,
        updatedAt: c.updated_at ?? null,
      })),
    );
    // Everything selected by default when small; the picker is the point when
    // large, so a big export starts empty and the Expert (or the assist) picks.
    setSelected(
      conversations.length <= 10
        ? new Set(conversations.map((c) => c.key))
        : new Set(),
    );
    setNotes(data?.notes ?? []);
  };

  const prepareUpload = async () => {
    if (!file) {
      toast.error("Choose your export file first.");
      return;
    }
    setPreparing(true);
    try {
      const uploaded = await upload(
        { kind: "file", file },
        {
          folderPath: "Masterwork/Chat Imports",
          fileName: file.name,
          metadata: { sourceFeature: "masterwork", rulebook_id: rulebook.id },
        },
      );
      setFileId(uploaded.fileId);
      await previewSource({ file_id: uploaded.fileId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read that export.",
      );
    } finally {
      setPreparing(false);
    }
  };

  const preparePaste = async () => {
    if (text.trim().length < 40) {
      toast.error("Paste a real conversation first.");
      return;
    }
    setPreparing(true);
    try {
      await previewSource({ text });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read that text.",
      );
    } finally {
      setPreparing(false);
    }
  };

  const loadMatrxConversations = useCallback(async () => {
    setPreparing(true);
    try {
      // Direct supabase-js — a plain DB listing, mine-scoped by RLS exactly
      // like the /chat history reads (VIEW LAW: chat.conversation's policy is
      // user-filtered; this list is deliberately "mine").
      const { data, error } = await supabase
        .schema("chat")
        .from("conversation")
        .select("id, title, message_count, updated_at, source_app")
        .is("deleted_at", null)
        .eq("is_ephemeral", false)
        .gt("message_count", 1)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw operationFailed("load your conversations", error);
      setRows(
        (data ?? []).map((c) => ({
          key: c.id,
          title: c.title?.trim() || "Untitled conversation",
          provider: c.source_app || "ai-matrx",
          turns: c.message_count ?? 0,
          userWords: 0,
          updatedAt: c.updated_at ?? null,
        })),
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not load your conversations.",
      );
    } finally {
      setPreparing(false);
    }
  }, []);

  // The AI Matrx tab needs no upload — offer the corpus the moment it opens.
  useEffect(() => {
    if (open && tab === "matrx" && rows === null && !preparing) {
      void loadMatrxConversations();
    }
  }, [open, tab, rows, preparing, loadMatrxConversations]);

  // ── the AI shortlist assist (upload/paste lanes) ─────────────────────────

  const shortlist = async () => {
    if (tab === "matrx") return;
    const body: Record<string, string> = {};
    if (fileId) body.file_id = fileId;
    else body.text = text;
    if (topic.trim()) body.topic = topic.trim();
    setShortlisting(true);
    try {
      let found: { key: string; reason: string }[] | null = null;
      await store.dispatch(
        callApi({
          path: SHORTLIST_PATH,
          method: "POST",
          body: body as never,
          onStreamEvent: (event) => {
            const data = (event as { data?: Record<string, unknown> }).data;
            if (
              data &&
              typeof data === "object" &&
              (data as { type?: string }).type === "masterwork_shortlist"
            ) {
              const items = (
                data as {
                  selected?: { key?: string; reason?: string }[];
                }
              ).selected;
              found = (items ?? [])
                .filter((i) => typeof i.key === "string")
                .map((i) => ({ key: i.key as string, reason: i.reason ?? "" }));
            }
          },
        }),
      );
      if (!found || (found as { key: string }[]).length === 0) {
        toast.info(
          "No standout conversations found — pick the ones you know matter.",
        );
        return;
      }
      const reasons = new Map(
        (found as { key: string; reason: string }[]).map((i) => [
          i.key,
          i.reason,
        ]),
      );
      setRows(
        (prev) =>
          prev?.map((r) => ({ ...r, reason: reasons.get(r.key) })) ?? prev,
      );
      setSelected(new Set(reasons.keys()));
      toast.success(
        `Suggested ${reasons.size} conversation${reasons.size === 1 ? "" : "s"} — adjust the selection and distill.`,
      );
    } catch {
      toast.error("The suggestion pass failed — pick by hand instead.");
    } finally {
      setShortlisting(false);
    }
  };

  // ── launch ───────────────────────────────────────────────────────────────

  const distill = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one conversation.");
      return;
    }
    if (selected.size > MAX_SELECTED) {
      toast.error(
        `That's ${selected.size} conversations — keep a pass under ${MAX_SELECTED} (you can come back for the rest).`,
      );
      return;
    }
    const label = sourceNote.trim() || `${selected.size} conversation(s)`;
    if (tab === "matrx") {
      await run.launch(
        {
          rulebook_id: rulebook.id,
          conversation_ids: [...selected],
          source_note: sourceNote.trim() || undefined,
        },
        label,
      );
      return;
    }
    await run.launch(
      {
        rulebook_id: rulebook.id,
        ...(fileId ? { file_id: fileId } : { text }),
        conversation_keys: [...selected],
        source_note: sourceNote.trim() || undefined,
      },
      label,
    );
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const content = (
    <>
        {summary ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">{summary}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Review the drafts
              </Button>
              {run.result?.followupSeed && onFollowupSeed ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const seed = run.result?.followupSeed;
                    reset();
                    onOpenChange(false);
                    if (seed) onFollowupSeed(seed);
                  }}
                >
                  Interview me about the gaps
                </Button>
              ) : null}
            </div>
          </div>
        ) : run.running || run.stages.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {run.stages.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {run.running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {rejoining
                    ? "Picking this back up — it kept working while you were away."
                    : "This keeps running on our servers even if you close this or reload — come back and it picks up where it left off."}
                </p>
              </div>
            ) : null}
          </div>
        ) : rows ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="h-8 max-w-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setSelected(new Set(visibleRows.map((r) => r.key)))
                }
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set())}
              >
                None
              </Button>
              <span className="text-xs text-muted-foreground">
                {selected.size} of {rows.length} selected
              </span>
            </div>

            {tab !== "matrx" ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2">
                <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What is this Rulebook about? (helps the suggestion)"
                  className="h-8 min-w-0 flex-1"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={shortlisting}
                  onClick={() => void shortlist()}
                >
                  {shortlisting ? "Suggesting…" : "Suggest a selection"}
                </Button>
              </div>
            ) : null}

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
              {visibleRows.map((row) => (
                <label
                  key={row.key}
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 rounded-md p-2 transition-colors hover:bg-accent/50",
                    selected.has(row.key) && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={selected.has(row.key)}
                    onCheckedChange={() => toggle(row.key)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {row.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.provider}
                      {row.userWords > 0
                        ? ` · you wrote ${formatWords(row.userWords)}`
                        : row.turns
                          ? ` · ${row.turns} messages`
                          : ""}
                    </p>
                    {row.reason ? (
                      <p className="mt-0.5 text-xs text-primary">
                        {row.reason}
                      </p>
                    ) : null}
                  </div>
                </label>
              ))}
              {visibleRows.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  Nothing matches that search.
                </p>
              ) : null}
            </div>
            {notes.map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                {note}
              </p>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="chat-import-note">
                Where is this from? (optional)
              </Label>
              <Input
                id="chat-import-note"
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
                placeholder="e.g. my ChatGPT export, Aug 2026"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TAB_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setTab(opt.value);
                    resetPicker();
                  }}
                  className={cn(
                    "rounded-md border p-2.5 text-left transition-colors",
                    tab === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border bg-card hover:border-muted-foreground/40",
                  )}
                >
                  <p className="text-sm font-medium text-foreground">
                    {opt.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {opt.blurb}
                  </p>
                </button>
              ))}
            </div>

            {tab === "upload" ? (
              <div className="space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={EXPORT_ACCEPT}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {file.name}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove the chosen file"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1.5 rounded-md border border-dashed border-border bg-card p-5 transition-colors hover:border-muted-foreground/40"
                  >
                    <FileUp className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      Choose your export
                    </span>
                    <span className="text-xs text-muted-foreground">
                      The whole zip is fine — ChatGPT, Claude, Gemini Takeout,
                      Grok, Meta, Cursor, Copilot, Claude Code.
                    </span>
                  </button>
                )}
                <p className="text-xs text-muted-foreground">
                  Don&apos;t have your export yet?{" "}
                  <Link
                    href="/import/ai-chats"
                    target="_blank"
                    className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                  >
                    See exactly how to get it
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </p>
              </div>
            ) : null}

            {tab === "paste" ? (
              <div className="space-y-1.5">
                <Label htmlFor="chat-import-text">The conversation</Label>
                <ProTextarea
                  id="chat-import-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the conversation here — any format works. Several conversations at once is fine."
                  rows={9}
                  enableTextStats
                />
              </div>
            ) : null}

            {tab === "matrx" && preparing ? (
              <div className="flex items-center gap-2 p-3">
                <LoadingSpinner size="sm" />
                <p className="text-sm text-muted-foreground">
                  Loading your conversations…
                </p>
              </div>
            ) : null}
          </div>
        )}

        {!summary && !run.running && run.stages.length === 0 ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={running}
            >
              {variant === "page" ? "Back to the Rulebook" : "Cancel"}
            </Button>
            {rows ? (
              <Button
                onClick={() => void distill()}
                disabled={running || selected.size === 0}
              >
                {running
                  ? "Distilling…"
                  : `Distill ${selected.size || ""} conversation${selected.size === 1 ? "" : "s"}`}
              </Button>
            ) : tab === "upload" ? (
              <Button
                onClick={() => void prepareUpload()}
                disabled={running || !file}
              >
                {preparing ? "Reading…" : "Read the export"}
              </Button>
            ) : tab === "paste" ? (
              <Button
                onClick={() => void preparePaste()}
                disabled={running || text.trim().length < 40}
              >
                {preparing ? "Reading…" : "Read the conversation"}
              </Button>
            ) : null}
          </DialogFooter>
        ) : null}
    </>
  );

  if (variant === "page") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {CHAT_IMPORT_DESCRIPTION}
        </p>
        {content}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Import your AI chats
            {/* THE DOOR LAW — this working mode has its own URL. */}
            <Link
              href={`/masterwork/${rulebook.id}/import`}
              className="ml-auto mr-6 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
              title="Open this as its own page"
            >
              <ExternalLink className="h-3 w-3" />
              Full page
            </Link>
          </DialogTitle>
          <DialogDescription>{CHAT_IMPORT_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
