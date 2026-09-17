"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileUp, Inbox, Mail, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { Checkbox } from "@/components/ui/checkbox";
import { AgentCredit } from "../AgentCredit";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { callApi } from "@/lib/api/call-api";
import { useAppStore } from "@/lib/redux/hooks";
import type { paths } from "@/types/python-generated/api-types";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import { useScrollIntoViewOnAppear } from "@/lib/durable-run/useScrollIntoViewOnAppear";
import { useRunResultOnce } from "../../durable-run/useRunResultOnce";
import type { Rulebook } from "../../types";
import {
  describeIngest,
  parseIngestSummary,
  type IngestSummary,
} from "./IngestSourceDialog";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { DurableRunInterruption } from "@/lib/durable-run/DurableRunInterruption";
import {
  DurableRunStopButton,
  DurableRunStopped,
} from "@/lib/durable-run/DurableRunStop";
import {
  durableRunDialogOnOpenChange,
  shouldReopenForRun,
} from "@/lib/durable-run/durableRunDialogClose";

/**
 * 🚨 THE BOX'S OWN INSTRUCTION HAS TO BE TRUE (cold walk 5, finding 4,
 * 2026-09-16). It used to read "your reply on top and the message you were
 * answering underneath, exactly as your mail app shows it" — and a thread in
 * exactly that shape, the two halves separated by nothing but a blank line, is
 * unsplittable by construction: two paragraphs of prose are indistinguishable
 * from one message of two paragraphs. A first-timer who did exactly what the
 * box said was told "Nothing to shadow — you never replied in it", with nothing
 * naming what to change.
 *
 * The box now teaches the one thing the parser keys on, and shows it. The same
 * example is a constant beside the parser in aidream
 * (`mail_parsers.PASTE_DOOR_EXAMPLE`) and is run through the REAL parser by
 * `test_the_paste_door_example_parses.py` on every test run, so these words and
 * the code behind them cannot drift apart again.
 */
export const SHADOW_PASTE_MARKER_LINE = "My reply:";

export const SHADOW_PASTE_PLACEHOLDER = `Paste the message you got, then a line reading "${SHADOW_PASTE_MARKER_LINE}" on its own, then what you sent. Like this:

Hi — we have a pallet of "assorted IT equipment" from a county courthouse IT closet ready for pickup tomorrow. Can we route it straight to the shredder line to save a day on turnaround?

${SHADOW_PASTE_MARKER_LINE}
No — anything from a government building goes to our manual teardown line no matter what the manifest calls it, because government hardware routinely has drives with case records on them.

A copy straight out of your mail app works too, as long as it kept its "On … wrote:" line, its "-----Original Message-----" block, or the original quoted with ">".`;


/**
 * "Shadow your inbox" — the `shadow_inbox` Distillation Approach.
 *
 * Arman's own catalog words for it: "Your Understudy drafts replies to your
 * real messages; you edit them before sending, and the difference between the
 * two is what gets distilled. The only Approach that SAVES you time."
 *
 * The mechanism, and the reason this is not a mode of the chat lane: before we
 * read the Expert's reply, an AI drafts the reply anyone competent would have
 * sent — WITHOUT ever being shown theirs — and the distance between the two is
 * what becomes rules. Where a generalist quotes a rate, this person refuses
 * until they see the manifest; that refusal is the rule.
 *
 * TWO DOORS, and the second one is honest about not being open:
 *
 * - PASTE a thread, or UPLOAD the .eml / .mbox your mail app exports. Always
 *   available, works with Gmail, Outlook and anything else, no provider
 *   involved. The server splits the quoted history back out, so one exported
 *   reply carries BOTH halves of the comparison.
 * - FROM YOUR INBOX — pick threads from the last N days where you replied.
 *   This needs a mailbox connected with permission to read replies. When no
 *   such grant exists the picker is ABSENT, not dead: one sentence saying what
 *   is missing, and never a control that looks pressable and is not
 *   (`GET /masterworks/inbox/connection` answers, the surface obeys).
 *
 * Rules land as drafts through the same review loop as every lane. Durable run
 * (`useMasterworkRun`) — reload mid-distillation and it picks back up.
 *
 * TWO HOSTS, ONE IMPLEMENTATION (Arman's ruling: every creation/working mode
 * gets a real URL): the Rulebook page's dialog (`variant="dialog"`, default,
 * opened by `?shadowInbox=1` or the Approach picker) and the route
 * `/masterwork/[id]/inbox` (`variant="page"`) both render exactly this
 * component.
 */

const CONNECTION_PATH = "/masterworks/inbox/connection" satisfies keyof paths;
const PREVIEW_PATH = "/masterworks/inbox/preview" satisfies keyof paths;
const INGEST_PATH = "/masterworks/ingest-inbox" satisfies keyof paths;

/** What a mail app actually exports. Mirrors the server's own reader. */
const EXPORT_ACCEPT = ".eml,.mbox,.txt,.zip";
/** The server refuses selections beyond its cost cap; warn before launching. */
const MAX_SELECTED = 100;

type InboxDoor = "paste" | "upload" | "connected";

interface ThreadRow {
  key: string;
  subject: string;
  participants: string[];
  messages: number;
  lastAt: string | null;
  snippet: string;
  youReplied: boolean;
  hasGivenDraft: boolean;
  nothingToShadow: string | null;
  yourWords: number;
}

interface ConnectionState {
  connected: boolean;
  accountEmail: string | null;
  connectionId: string | null;
  daysBackDefault: number | null;
  howToConnect: string | null;
}

const SHADOW_INBOX_DESCRIPTION =
  "Before we read your reply, an AI writes the reply anyone competent would " +
  "have sent — without ever being shown yours. The difference between the two " +
  "is what becomes your rules. Everything lands as drafts you approve.";

export function ShadowInboxDialog({
  open,
  onOpenChange,
  rulebook,
  onIngested,
  onFollowupSeed,
  variant = "dialog",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onIngested?: () => void;
  onFollowupSeed?: (seed: string) => void;
  /** "page" renders the same lane bare for /masterwork/[id]/inbox. */
  variant?: "dialog" | "page";
}) {
  const store = useAppStore();
  const { upload } = useFileUpload();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [door, setDoor] = useState<InboxDoor>("paste");
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [expertEmail, setExpertEmail] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [ownRepliesOnly, setOwnRepliesOnly] = useState(true);
  const [daysBack, setDaysBack] = useState(30);
  const [preparing, setPreparing] = useState(false);
  const [rows, setRows] = useState<ThreadRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<string[]>([]);
  const [connection, setConnection] = useState<ConnectionState | null>(null);

  const run = useMasterworkRun<IngestSummary>({
    surface: "shadow_inbox",
    rulebookId: rulebook.id,
    path: INGEST_PATH,
    parseResult: parseIngestSummary,
  });
  const running = run.running || preparing;
  const summary = run.result ? describeIngest(run.result) : null;

  // A summary the person has to scroll to find is a silent zero — this lane's
  // honest "we read it and found nothing" sentence is the whole answer to a run
  // that added no rules. Same class as census wall W17; see
  // `useScrollIntoViewOnAppear`.
  const summaryRef = useScrollIntoViewOnAppear<HTMLDivElement>(
    Boolean(summary),
    summary,
  );

  const resetPicker = () => {
    setRows(null);
    setSelected(new Set());
    setNotes([]);
    setFileId(null);
  };

  const reset = () => {
    run.reset();
    resetPicker();
    setPreparing(false);
  };

  useRunResultOnce(run, onIngested);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A run picked back up after a reload must be VISIBLE — rejoining behind a
  // closed dialog reads as "nothing happened", which is the defect durability
  // exists to kill. The latch is per RUN, not per mount.
  const reopenedRef = useRef(false);
  const dismissedRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!run.running) {
      reopenedRef.current = false;
      return;
    }
    if (reopenedRef.current || open) return;
    if (!shouldReopenForRun(run.runId, dismissedRunIdRef.current)) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, run.running, onOpenChange]);

  // ── the connected door: ask, then obey the answer ────────────────────────
  //
  // Asked once per open. `connected: false` is the ANSWER, not an error: the
  // third door simply is not offered, and the sentence the server wrote is
  // shown instead. Nothing here ever renders a control that cannot work.
  useEffect(() => {
    if (!open || connection !== null) return;
    let cancelled = false;

    void store
      .dispatch(callApi({ path: CONNECTION_PATH, method: "GET" }))
      .then((result) => {
        if (cancelled) return;
        const data = (
          result as {
            data?: {
              connected?: boolean;
              account_email?: string | null;
              connection_id?: string | null;
              days_back_default?: number | null;
              how_to_connect?: string | null;
            };
          }
        ).data;
        setConnection({
          connected: Boolean(data?.connected),
          accountEmail: data?.account_email ?? null,
          connectionId: data?.connection_id ?? null,
          daysBackDefault: data?.days_back_default ?? null,
          howToConnect: data?.how_to_connect ?? null,
        });
        if (data?.days_back_default) setDaysBack(data.days_back_default);
      });

    return () => {
      cancelled = true;
    };
  }, [open, connection, store]);

  // ── the doors → one picker ───────────────────────────────────────────────

  const previewSource = async (body: Record<string, unknown>): Promise<void> => {
    const result = await store.dispatch(
      callApi({ path: PREVIEW_PATH, method: "POST", body: body as never }),
    );
    const error = (result as { error?: { message?: string } }).error;
    if (error) {
      throw new Error(
        error.message ?? "We couldn't read that thread. Try again.",
      );
    }
    const data = (
      result as {
        data?: {
          threads?: {
            key: string;
            subject: string;
            participants?: string[];
            messages?: number;
            last_at?: string | null;
            snippet?: string;
            you_replied?: boolean;
            has_given_draft?: boolean;
            nothing_to_shadow?: string | null;
            your_words?: number;
          }[];
          expert_email?: string;
          notes?: string[];
        };
      }
    ).data;
    const threads = data?.threads ?? [];
    if (threads.length === 0) {
      throw new Error(
        "We couldn't find an email thread in that. Paste your reply together with the message you were answering, or upload the .eml your mail app exports.",
      );
    }
    const mapped: ThreadRow[] = threads.map((t) => ({
      key: t.key,
      subject: t.subject,
      participants: t.participants ?? [],
      messages: t.messages ?? 0,
      lastAt: t.last_at ?? null,
      snippet: t.snippet ?? "",
      youReplied: Boolean(t.you_replied),
      hasGivenDraft: Boolean(t.has_given_draft),
      nothingToShadow: t.nothing_to_shadow ?? null,
      yourWords: t.your_words ?? 0,
    }));
    setRows(mapped);
    // Only the threads there is actually something to shadow in are selected —
    // a row that cannot run is never silently included in a paid pass.
    setSelected(new Set(mapped.filter((t) => t.youReplied).map((t) => t.key)));
    if (data?.expert_email && !expertEmail) setExpertEmail(data.expert_email);
    setNotes(data?.notes ?? []);
  };

  const sourceBody = (): Record<string, unknown> => ({
    ...(expertEmail.trim() ? { expert_email: expertEmail.trim() } : {}),
    own_replies_only: ownRepliesOnly,
  });

  const prepareUpload = async () => {
    // Gated on the button, which says this in muted words before the press
    // (class sweep, 2026-09-16).
    if (!file) return;
    setPreparing(true);
    try {
      const uploaded = await upload(
        { kind: "file", file },
        {
          folderPath: "Masterwork/Inbox Threads",
          fileName: file.name,
          metadata: { sourceFeature: "masterwork", rulebook_id: rulebook.id },
        },
      );
      setFileId(uploaded.fileId);
      await previewSource({ ...sourceBody(), file_id: uploaded.fileId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read that export.",
      );
    } finally {
      setPreparing(false);
    }
  };

  const preparePaste = async () => {
    // Gated on the button; see `prepareUpload`.
    if (text.trim().length < 40) return;
    setPreparing(true);
    try {
      await previewSource({ ...sourceBody(), text });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not read that thread.",
      );
    } finally {
      setPreparing(false);
    }
  };

  // ── launch ───────────────────────────────────────────────────────────────

  const distill = async () => {
    // Gated on the button; see `prepareUpload`.
    if (door !== "connected" && selected.size === 0) return;
    if (selected.size > MAX_SELECTED) {
      toast.error(
        `That's ${selected.size} threads — keep a pass under ${MAX_SELECTED} (you can come back for the rest).`,
      );
      return;
    }
    const label =
      sourceNote.trim() ||
      (door === "connected"
        ? `my inbox, last ${daysBack} days`
        : `${selected.size} thread(s)`);
    const shared = {
      rulebook_id: rulebook.id,
      source_note: sourceNote.trim() || undefined,
      own_replies_only: ownRepliesOnly,
      ...(expertEmail.trim() ? { expert_email: expertEmail.trim() } : {}),
    };
    if (door === "connected" && connection?.connectionId) {
      await run.launch(
        { ...shared, connection_id: connection.connectionId, days_back: daysBack },
        label,
      );
      return;
    }
    await run.launch(
      {
        ...shared,
        ...(fileId ? { file_id: fileId } : { text }),
        thread_keys: [...selected],
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

  const shadowable = rows?.filter((r) => r.youReplied).length ?? 0;

  const content = (
    <>
      {/* A failure STAYS on screen with its reason and a way out. */}
      <DurableRunFailure
        error={run.error}
        retry={run.retry}
        running={run.running}
      />
      <DurableRunStopped message={run.stoppedMessage} retry={run.retry} />

      {summary ? (
        <div ref={summaryRef} className="space-y-3">
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
              <p className="text-xs text-muted-foreground">{run.waitMessage}</p>
            </div>
          ) : null}
          {run.running ? (
            <DurableRunInterruption interruption={run.interruption} />
          ) : null}
        </div>
      ) : rows ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelected(
                  new Set(rows.filter((r) => r.youReplied).map((r) => r.key)),
                )
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
              {selected.size} of {shadowable} thread
              {shadowable === 1 ? "" : "s"} you replied to
            </span>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
            {rows.map((row) => (
              <label
                key={row.key}
                className={cn(
                  "flex items-start gap-2.5 rounded-md p-2 transition-colors",
                  row.youReplied
                    ? "cursor-pointer hover:bg-accent/50"
                    : "cursor-default",
                  selected.has(row.key) && "bg-primary/5",
                )}
              >
                {/* A thread with nothing to shadow gets NO checkbox at all —
                    absent, never a disabled-looking one, and the row says why
                    in the same breath. */}
                {row.youReplied ? (
                  <Checkbox
                    checked={selected.has(row.key)}
                    onCheckedChange={() => toggle(row.key)}
                    className="mt-0.5"
                  />
                ) : (
                  <span className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {row.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.participants.slice(0, 3).join(", ") ||
                      "no addresses we could read"}
                    {row.messages ? ` · ${row.messages} messages` : ""}
                    {row.youReplied
                      ? ` · you wrote ${row.yourWords} words`
                      : ""}
                  </p>
                  {row.hasGivenDraft ? (
                    <p className="mt-0.5 text-xs text-primary">
                      Someone drafted this for you — we&apos;ll compare against
                      that too.
                    </p>
                  ) : null}
                  {row.nothingToShadow ? (
                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                      Nothing to shadow — {row.nothingToShadow}.
                    </p>
                  ) : null}
                  {row.snippet ? (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground/80">
                      {row.snippet}
                    </p>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
          {notes.map((note, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {note}
            </p>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor="shadow-inbox-note">
              Where is this from? (optional)
            </Label>
            <Input
              id="shadow-inbox-note"
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
              placeholder="e.g. the Northline quote thread, Sept 2026"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={cn(
              "grid grid-cols-1 gap-2",
              connection?.connected ? "sm:grid-cols-3" : "sm:grid-cols-2",
            )}
          >
            <button
              type="button"
              onClick={() => {
                setDoor("paste");
                resetPicker();
              }}
              className={cn(
                "rounded-md border p-2.5 text-left transition-colors",
                door === "paste"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <p className="text-sm font-medium text-foreground">
                Paste a thread
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Your reply and the message you were answering.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setDoor("upload");
                resetPicker();
              }}
              className={cn(
                "rounded-md border p-2.5 text-left transition-colors",
                door === "upload"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <p className="text-sm font-medium text-foreground">
                Upload an export
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The .eml or .mbox your mail app saves.
              </p>
            </button>
            {/* THE CONNECTED DOOR IS ABSENT, NOT DEAD. It renders only when the
                server says a mailbox can actually be read; otherwise the
                sentence below says what is missing. */}
            {connection?.connected ? (
              <button
                type="button"
                onClick={() => {
                  setDoor("connected");
                  resetPicker();
                }}
                className={cn(
                  "rounded-md border p-2.5 text-left transition-colors",
                  door === "connected"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-muted-foreground/40",
                )}
              >
                <p className="text-sm font-medium text-foreground">
                  From your inbox
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {connection.accountEmail ?? "Your connected mailbox"}.
                </p>
              </button>
            ) : null}
          </div>

          {connection && !connection.connected && connection.howToConnect ? (
            <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
              <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{connection.howToConnect}</span>
            </p>
          ) : null}

          {door === "upload" ? (
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
                      if (fileInputRef.current) fileInputRef.current.value = "";
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
                    Choose your exported thread
                  </span>
                  <span className="text-xs text-muted-foreground">
                    In Gmail or Outlook, open the thread and save or print it to
                    a file — .eml, .mbox and plain text all work.
                  </span>
                </button>
              )}
            </div>
          ) : null}

          {door === "paste" ? (
            <div className="space-y-1.5">
              <Label htmlFor="shadow-inbox-text">The thread</Label>
              <ProTextarea
                id="shadow-inbox-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={SHADOW_PASTE_PLACEHOLDER}
                rows={10}
                enableTextStats
              />
            </div>
          ) : null}

          {door === "connected" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-2.5">
              <Label htmlFor="shadow-inbox-days" className="text-xs">
                Look back
              </Label>
              <Input
                id="shadow-inbox-days"
                type="number"
                min={1}
                max={365}
                value={daysBack}
                onChange={(e) =>
                  setDaysBack(Math.max(1, Number(e.target.value) || 1))
                }
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="shadow-inbox-email">
              Which address is yours? (optional)
            </Label>
            <Input
              id="shadow-inbox-email"
              value={expertEmail}
              onChange={(e) => setExpertEmail(e.target.value)}
              placeholder="Leave blank to use the address you signed in with"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-md border border-border bg-card p-2.5">
            <Switch
              checked={ownRepliesOnly}
              onCheckedChange={setOwnRepliesOnly}
              aria-label="Only read threads you replied to"
            />
            <span className="min-w-0">
              <span className="block text-sm text-foreground">
                Only read threads you replied to
              </span>
              <span className="block text-xs text-muted-foreground">
                Your own judgment is in your own replies. Turn this off for a
                shared mailbox where someone answers on your behalf.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* A RUNNING DIALOG MUST STILL OFFER A WAY OUT. */}
      {!summary && run.running ? (
        <DialogFooter>
          <DurableRunStopButton
            cancel={run.cancel}
            cancelling={run.cancelling}
            running={run.running}
            leaveLabel={variant === "page" ? "Back to the Rulebook" : "Cancel"}
            reason="stopped from the shadow-inbox dialog"
            onLeave={() => {
              reset();
              onOpenChange(false);
            }}
          />
        </DialogFooter>
      ) : null}

      {!summary && !run.running && run.stages.length === 0 ? (
        <DialogFooter>
          <DurableRunStopButton
            cancel={run.cancel}
            cancelling={run.cancelling}
            running={running}
            leaveLabel={variant === "page" ? "Back to the Rulebook" : "Cancel"}
            reason="stopped from the shadow-inbox dialog"
            onLeave={() => {
              reset();
              onOpenChange(false);
            }}
          />
          {rows ? (
            /* A DISABLED PRIMARY ACTION SAYS WHY. */
            <GatedActionButton
              onClick={() => void distill()}
              disabled={running}
              reason={firstBlockingReason([
                {
                  when: shadowable === 0,
                  reason:
                    "None of these threads has a reply of yours to compare — there is nothing to shadow",
                },
                {
                  when: selected.size === 0,
                  reason: "Pick at least one thread to shadow",
                },
              ])}
            >
              {running
                ? "Shadowing…"
                : `Shadow ${selected.size || ""} thread${selected.size === 1 ? "" : "s"}`}
            </GatedActionButton>
          ) : door === "upload" ? (
            <GatedActionButton
              onClick={() => void prepareUpload()}
              disabled={running}
              reason={firstBlockingReason([
                { when: !file, reason: "Choose your exported thread first" },
              ])}
            >
              {preparing ? "Reading…" : "Read the export"}
            </GatedActionButton>
          ) : door === "paste" ? (
            <GatedActionButton
              onClick={() => void preparePaste()}
              disabled={running}
              reason={firstBlockingReason([
                {
                  when: text.trim().length < 40,
                  reason: "Paste at least 40 characters of the thread",
                },
              ])}
            >
              {preparing ? "Reading…" : "Read the thread"}
            </GatedActionButton>
          ) : (
            <Button onClick={() => void distill()} disabled={running}>
              {running ? "Shadowing…" : `Shadow my last ${daysBack} days`}
            </Button>
          )}
        </DialogFooter>
      ) : null}
    </>
  );

  if (variant === "page") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {SHADOW_INBOX_DESCRIPTION}
        </p>
        {content}
      </div>
    );
  }

  const handleDialogOpenChange = (next: boolean): void => {
    durableRunDialogOnOpenChange({
      running,
      reset,
      onOpenChange: (value) => {
        if (!value && running) dismissedRunIdRef.current = run.runId;
        onOpenChange(value);
      },
      runLabel: "Shadowing your inbox",
    })(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            Shadow your inbox
            <AgentCredit
              mandate={MANDATE_KEYS.masterwork__transcript_distiller}
              agent="masterwork_transcript_distiller"
            />
            {/* THE DOOR LAW — this working mode has its own URL. */}
            <Link
              href={`/masterwork/${rulebook.id}/inbox`}
              className="ml-auto mr-6 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
              title="Open this as its own page"
            >
              <ExternalLink className="h-3 w-3" />
              Full page
            </Link>
          </DialogTitle>
          <DialogDescription>{SHADOW_INBOX_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
