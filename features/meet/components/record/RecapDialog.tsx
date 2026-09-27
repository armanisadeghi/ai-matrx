"use client";

// features/meet/components/record/RecapDialog.tsx
//
// THE RECAP EMAIL, REVIEWED THEN SENT (Meet wave 3). Zoom's AI Companion and
// Gemini draft a follow-up; here the host sees exactly who gets it. The draft
// is the server's: subject and body arranged from the wrap-up the meeting's
// own mandate wrote (no new prompt), recipients = invitees and signed-in
// attendees. The host edits, picks people, and sends — nothing is ever sent
// without this click. "Check delivery" is a dry run: the server resolves every
// recipient and renders every email, and queues nothing.

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  loadFollowUpDraft,
  sendFollowUp,
  useMeetHost,
  type FollowUpDraft,
  type FollowUpSendResult,
  type MeetingId,
} from "@ai-matrx/meet/react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { errorSentence } from "@/features/meet/hooks/useMeetingActions";

function sentLine(draft: FollowUpDraft): string | null {
  if (!draft.lastSent) return null;
  const at = new Date(draft.lastSent.at);
  const when = Number.isNaN(at.getTime())
    ? draft.lastSent.at
    : at.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  return `A recap was sent ${when} to ${draft.lastSent.count} ${draft.lastSent.count === 1 ? "person" : "people"}.`;
}

export function RecapDialog({
  meetingId,
  open,
  onOpenChange,
}: {
  meetingId: MeetingId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const host = useMeetHost();
  const api = host?.api ?? null;
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [working, setWorking] = useState<"check" | "send" | null>(null);
  const [checked, setChecked] = useState<FollowUpSendResult | null>(null);

  useEffect(() => {
    if (!open || api === null) return undefined;
    let live = true;
    setDraft(null);
    setFailure(null);
    setChecked(null);
    loadFollowUpDraft(api, meetingId)
      .then((next) => {
        if (!live) return;
        setDraft(next);
        setSubject(next.subject);
        setBody(next.body);
        setChosen(
          new Set(next.recipients.filter((r) => r.reachable).map((r) => r.key)),
        );
      })
      .catch((thrown: unknown) => {
        if (live) setFailure(errorSentence(thrown));
      });
    return () => {
      live = false;
    };
  }, [open, api, meetingId]);

  const run = async (dryRun: boolean) => {
    if (api === null) return;
    setWorking(dryRun ? "check" : "send");
    try {
      const result = await sendFollowUp(api, meetingId, {
        subject,
        body,
        recipientKeys: [...chosen],
        dryRun,
      });
      if (dryRun) {
        setChecked(result);
        return;
      }
      const skipped = result.skipped.length;
      toast.success(
        `Recap sent to ${result.queued.length} ${result.queued.length === 1 ? "person" : "people"}${
          skipped ? `; ${skipped} skipped` : ""
        }.`,
      );
      onOpenChange(false);
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    } finally {
      setWorking(null);
    }
  };

  const count = chosen.size;
  const names = new Map(draft?.recipients.map((r) => [r.key, r.name]) ?? []);
  const allKeys = draft?.recipients.filter((r) => r.reachable).map((r) => r.key) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email the recap</DialogTitle>
          <DialogDescription>
            Written from this meeting&apos;s summary, decisions and action
            items. Edit anything before it goes out.
          </DialogDescription>
        </DialogHeader>

        {api === null ? (
          <p className="text-sm text-muted-foreground">
            Choose an organization from the avatar menu to send a recap.
          </p>
        ) : failure ? (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        ) : draft === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{" "}
            Preparing the recap…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div className="min-w-0 space-y-2">
              {!draft.wrapUpWritten ? (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                  The summary has not been written yet, so the recap has no
                  summary. You can still write one yourself below.
                </p>
              ) : null}
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Subject"
                className="h-9"
                maxLength={200}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Message"
                className="h-72 resize-y text-sm leading-relaxed"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">To</span>
                {allKeys.length > 1 ? (
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() =>
                      setChosen(
                        chosen.size === allKeys.length
                          ? new Set()
                          : new Set(allKeys),
                      )
                    }
                  >
                    {chosen.size === allKeys.length ? "None" : "All"}
                  </button>
                ) : null}
              </div>
              {draft.recipients.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody was invited and no signed-in person attended, so there
                  is nobody to send it to. Guests who joined by link without an
                  account cannot be emailed.
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {draft.recipients.map((r) => (
                    <li key={r.key}>
                      <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
                        <Checkbox
                          checked={chosen.has(r.key)}
                          disabled={!r.reachable}
                          onCheckedChange={(v) => {
                            const next = new Set(chosen);
                            if (v) next.add(r.key);
                            else next.delete(r.key);
                            setChosen(next);
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{r.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {r.email ??
                              (r.sources.includes("attendee")
                                ? "Attended"
                                : "Invited")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {sentLine(draft) ? (
                <p className="text-[11px] text-muted-foreground">
                  {sentLine(draft)}
                </p>
              ) : null}
              {checked ? (
                <div
                  className="rounded-md border border-border bg-muted/30 p-2 text-[11px]"
                  role="status"
                >
                  <p>
                    Would reach {checked.queued.length}{" "}
                    {checked.queued.length === 1 ? "person" : "people"}.
                    Nothing was sent.
                  </p>
                  {checked.skipped.map((s) => (
                    <p key={s.key} className="text-muted-foreground">
                      {names.get(s.key) ?? s.key}: {s.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            disabled={draft === null || count === 0 || working !== null}
            onClick={() => void run(true)}
          >
            {working === "check" ? "Checking…" : "Check delivery"}
          </Button>
          <Button
            disabled={
              draft === null ||
              count === 0 ||
              !subject.trim() ||
              !body.trim() ||
              working !== null
            }
            onClick={() => void run(false)}
            className="gap-1.5"
          >
            {working === "send" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            {count === 0
              ? "Choose who gets it"
              : `Send to ${count} ${count === 1 ? "person" : "people"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
