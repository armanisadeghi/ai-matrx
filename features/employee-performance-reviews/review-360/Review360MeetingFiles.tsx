"use client";

// THE REVIEW MEETING'S RECORDING AND TRANSCRIPT (HR-360-REC), under the notes box on /hr/performance/<id>/meeting
// and in the Meet panel. They are files whose parent is the review's Confidential notes row, so they list for
// exactly the people who can read that row: HR always, the manager and the employee once HR shares. Every open
// goes through the audited door first (iam.open_confidential_audited), like the notes. Fixed height: no shift.

import { useEffect, useState } from "react";
import { Download, FileText, Lock, Video } from "lucide-react";
import { Badge, Button } from "@ai-matrx/design-system/controls";

import { downloadMediaSource } from "@/features/files/media-client/download";
import { toast } from "@/lib/toast";

import { listCaptureFiles, openCaptureFile, type CaptureFile } from "./meeting-notes";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; files: CaptureFile[] };

const BOX = "flex h-24 flex-col gap-1 rounded-md border border-border bg-card p-2";

export function Review360MeetingFiles({ notesId }: { notesId: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!notesId) return;
    let live = true;
    void listCaptureFiles(notesId).then((r) => {
      if (live) setState(r.ok ? { kind: "ready", files: r.data } : { kind: "error", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [notesId]);

  if (!notesId) return null;

  const open = async (file: CaptureFile) => {
    if (busy) return;
    setBusy(file.id);
    try {
      const door = await openCaptureFile(file.id);
      if (!door.ok) throw new Error(door.message);
      await downloadMediaSource({ kind: "file_id", fileId: file.id }, file.name);
    } catch (thrown) {
      toast.error(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setBusy(null);
    }
  };

  const head = (
    <div className="flex items-center gap-2">
      <h3 className="text-xs font-semibold">Recording and transcript</h3>
      <Lock className="h-3 w-3 text-muted-foreground" aria-label="Confidential" />
    </div>
  );

  if (state.kind === "loading") {
    return <section className={`${BOX} animate-pulse`} aria-label="Loading the recording and transcript" data-review-360-files="loading" />;
  }
  if (state.kind === "error") {
    return (
      <section className={BOX} data-review-360-files="error">
        {head}
        <p className="text-xs text-destructive">{state.message}<ErrorAlchemyMenu error={state.message} /></p>
      </section>
    );
  }
  return (
    <section className={BOX} data-review-360-files={state.files.length ? "list" : "empty"}>
      {head}
      {state.files.length === 0 ? (
        <Badge>None</Badge>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {state.files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm" data-review-360-file={f.kind}>
              {f.kind === "recording" ? <Video className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <Button variant="quiet" icon={<Download />} disabled={busy !== null} onClick={() => void open(f)}>
                {f.kind === "recording" ? "Download" : "Open"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
