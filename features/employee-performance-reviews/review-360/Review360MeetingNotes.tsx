"use client";

// THE REVIEW MEETING'S CONFIDENTIAL NOTES BOX (HR-360 wave 3), under the side-by-side in the Meet
// panel and on the in-person page. The HR manager writes and shares; the employee and the manager
// see the notes only once HR shares them. Every open is logged (iam.open_confidential_audited).
// The box keeps one fixed height in every state, so nothing below it moves.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Lock, Save, Share2 } from "lucide-react";
import { Badge, Button, Textarea } from "@ai-matrx/design-system/controls";
import { useRecordsClient } from "@ai-matrx/records/react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";

import { useConfidentialServerStep } from "./Review360Host";
import { ensureMeetingNotes, openMeetingNotes, saveMeetingNotes, type MeetingNotesView } from "./meeting-notes";

type State =
  | { kind: "loading" }
  | { kind: "closed" }
  | { kind: "error"; message: string }
  | { kind: "ready"; view: MeetingNotesView | null; canWrite: boolean };

const BOX = "flex h-56 flex-col gap-1 rounded-md border border-border bg-card p-2";

export function Review360MeetingNotes({
  reviewId,
  organizationId,
  doc,
}: {
  reviewId: string;
  organizationId: string;
  doc: Record<string, unknown>;
}) {
  const client = useRecordsClient();
  const userId = useAppSelector(selectUserId);
  const serverStep = useConfidentialServerStep();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const notesId = typeof doc.meeting_notes === "string" && doc.meeting_notes ? doc.meeting_notes : null;

  const load = useCallback(async (): Promise<State> => {
    if (!userId) return { kind: "error", message: "Sign in first" };
    const me = await client.workPerson({ user_id: userId, create: false });
    const myPerson = me.ok ? me.data : null;
    const isHr = myPerson !== null && myPerson === doc.hr_manager;
    if (!notesId) return isHr ? { kind: "ready", view: null, canWrite: true } : { kind: "closed" };
    const opened = await openMeetingNotes(client, notesId);
    if (!opened.ok) return { kind: "error", message: opened.message };
    if (!opened.data.open) return { kind: "closed" };
    const view = opened.data.view;
    return { kind: "ready", view, canWrite: myPerson !== null && myPerson === view.hrManager };
  }, [client, userId, notesId, doc.hr_manager]);

  useEffect(() => {
    let live = true;
    void load().then((next) => {
      if (!live) return;
      setState(next);
      if (next.kind === "ready") setDraft(next.view?.notes ?? "");
    });
    return () => {
      live = false;
    };
  }, [load]);

  const save = async (share: boolean) => {
    if (busy || state.kind !== "ready") return;
    setBusy(true);
    try {
      let id = state.view?.id ?? null;
      if (!id) {
        const made = await ensureMeetingNotes(client, organizationId, serverStep, { id: reviewId, doc });
        if (!made.ok) throw new Error(made.message);
        id = made.data;
      }
      const res = await saveMeetingNotes(client, organizationId, id, share ? { notes: draft, shared: true } : { notes: draft });
      if (!res.ok) throw new Error(res.message);
      setState({
        kind: "ready",
        canWrite: true,
        view: { id, notes: draft, shared: share || (state.view?.shared ?? false), hrManager: state.view?.hrManager ?? null },
      });
      toast.success(share ? "Notes shared" : "Notes saved");
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(false);
    }
  };

  const head = (badge: ReactNode) => (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold">Meeting notes</h3>
      <Lock className="h-3 w-3 text-muted-foreground" aria-label="Confidential" />
      {badge}
    </div>
  );

  if (state.kind === "loading") {
    return <section className={`${BOX} animate-pulse`} aria-label="Loading the meeting notes" data-review-360-notes="loading" />;
  }
  if (state.kind === "error") {
    return (
      <section className={BOX} data-review-360-notes="error">
        {head(null)}
        <p className="text-xs text-destructive">{state.message}</p>
      </section>
    );
  }
  if (state.kind === "closed") {
    return (
      <section className={BOX} data-review-360-notes="closed">
        {head(<Badge>Not shared yet</Badge>)}
      </section>
    );
  }
  if (!state.canWrite) {
    return (
      <section className={BOX} data-review-360-notes="read">
        {head(state.view?.shared ? <Badge>Shared</Badge> : null)}
        <p className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm">{state.view?.notes || "Nothing written"}</p>
      </section>
    );
  }
  const dirty = draft !== (state.view?.notes ?? "");
  return (
    <section className={BOX} data-review-360-notes="write">
      {head(state.view?.shared ? <Badge>Shared</Badge> : <Badge>HR only</Badge>)}
      <Textarea
        aria-label="Meeting notes"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="min-h-0 flex-1 resize-none text-base md:text-sm"
      />
      <div className="flex items-center justify-end gap-1">
        <Button variant="quiet" icon={<Save />} disabled={busy || !dirty} onClick={() => void save(false)}>
          Save
        </Button>
        {state.view?.shared ? null : (
          <Button variant="primary" icon={<Share2 />} disabled={busy || (!state.view && !draft)} onClick={() => void save(true)}>
            Share
          </Button>
        )}
      </div>
    </section>
  );
}
