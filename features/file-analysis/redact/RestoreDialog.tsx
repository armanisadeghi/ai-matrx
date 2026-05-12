/**
 * features/file-analysis/redact/RestoreDialog.tsx
 *
 * Paste the LLM/3rd-party response that contains substitute markers,
 * pick the session id (auto-filled from IndexedDB for known sessions),
 * and restore the originals via POST /redact/restore.
 */

"use client";

import { useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as Api from "@/features/file-analysis/api/file-analysis";
import {
  getSession,
  listSessionsForFile,
  type StoredSession,
} from "./session-keys";

interface RestoreDialogProps {
  fileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RestoreDialog({ fileId, open, onOpenChange }: RestoreDialogProps) {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [key, setKey] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [restored, setRestored] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    listSessionsForFile(fileId).then((list) => {
      setSessions(list);
      if (list.length && !sessionId) {
        setSessionId(list[0].session_id);
        setKey(list[0].session_key_b64);
      }
    });
  }, [open, fileId, sessionId]);

  // Auto-fill key when sessionId changes from the dropdown.
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId).then((s) => {
      if (s) setKey(s.session_key_b64);
    });
  }, [sessionId]);

  async function handleRestore() {
    if (!text.trim() || !sessionId || !key) return;
    setRunning(true);
    setError(null);
    setRestored("");
    try {
      const { data } = await Api.restoreText({
        session_id: sessionId,
        session_key_b64: key,
        text,
      });
      setRestored(data.text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4" /> Restore originals
          </DialogTitle>
          <DialogDescription>
            Paste a response that contains masked substitutes (e.g. an LLM's
            summary). With the matching session key, originals are swapped in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs font-medium">Session</span>
              {sessions.length ? (
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pick a session…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem
                        key={s.session_id}
                        value={s.session_id}
                        className="text-xs"
                      >
                        {new Date(s.created_at).toLocaleString()} —{" "}
                        {s.session_id.slice(0, 8)}…
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="session-id (uuid)"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  className="h-9 text-xs"
                />
              )}
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium">Session key (base64)</span>
              <Input
                placeholder="base64 AES-256-GCM key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="h-9 font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium">Masked text</span>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Paste the masked text or LLM response here…"
              className="text-xs"
            />
          </div>

          {restored ? (
            <div className="space-y-1">
              <span className="text-xs font-medium">Restored text</span>
              <Textarea
                value={restored}
                readOnly
                rows={5}
                className="text-xs"
              />
            </div>
          ) : null}

          {error ? (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} size="sm">
            Close
          </Button>
          <Button
            disabled={running || !text.trim() || !sessionId || !key}
            onClick={() => void handleRestore()}
            size="sm"
          >
            {running ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1" /> Restoring…
              </>
            ) : (
              "Restore"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
