/**
 * features/file-analysis/redact/MaskDialog.tsx
 *
 * Configure + run a /redact/mask call. Collects every annotation flagged
 * `redact=true` (active status), shows the count, lets the user pick
 * mode + substitute style, then triggers the request and hands off the
 * returned session_key via KeyHandoff.
 */

"use client";

import { useMemo, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAnnotations } from "@/features/file-analysis/hooks/useAnnotations";
import * as Api from "@/features/file-analysis/api/file-analysis";
import {
  saveSession,
  type StoredSession,
} from "./session-keys";
import { KeyHandoff } from "./KeyHandoff";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

interface MaskDialogProps {
  fileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "reversible" | "destructive" | "annotation";
type Style = "bracket" | "shape";

export function MaskDialog({ fileId, open, onOpenChange }: MaskDialogProps) {
  const { annotations } = useAnnotations(fileId);
  const candidates = useMemo(
    () => annotations.filter((a) => a.redact && a.status === "active"),
    [annotations],
  );

  const [mode, setMode] = useState<Mode>("reversible");
  const [style, setStyle] = useState<Style>("bracket");
  const [running, setRunning] = useState(false);
  const downloadBlob = useDownloadBlob();
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<StoredSession | null>(null);
  const [maskedBlob, setMaskedBlob] = useState<Blob | null>(null);

  const handleRun = async () => {
    if (!candidates.length) return;
    if (mode === "destructive") {
      const ok = await confirm({
        title: "Destructive masking?",
        description:
          "Destructive mode produces a masked copy with NO restore key — the masked values cannot be recovered from it later. The original file itself stays unchanged. Use reversible mode if you may need the originals back.",
        confirmLabel: "Mask destructively",
        variant: "destructive",
      });
      if (!ok) return;
    }
    setRunning(true);
    setError(null);
    try {
      const spans = candidates.map((a) => ({
        pattern_id: a.label,
        category: a.label_category,
        page_number: a.page_number,
        bbox: a.bbox as { x0: number; y0: number; x1: number; y1: number },
        char_start: 0,
        char_end: 0,
        original_text: a.extracted_text ?? "",
        confidence_tier: "user",
      }));
      const { data } = await Api.maskFile(fileId, {
        spans,
        mode,
        substitute_style: style,
        substitute_formats: null,
        session_id: null,
        session_key_b64: null,
      });
      // Decode the masked PDF for download.
      if (data.masked_bytes_base64) {
        const bytes = Uint8Array.from(atob(data.masked_bytes_base64), (c) =>
          c.charCodeAt(0),
        );
        setMaskedBlob(new Blob([bytes], { type: "application/pdf" }));
      }
      // Persist the session key for the restore step.
      if (data.session_key_b64) {
        const stored: StoredSession = {
          session_id: data.session_id,
          session_key_b64: data.session_key_b64,
          file_id: fileId,
          mode: data.mode,
          created_at: Date.now(),
        };
        await saveSession(stored);
        setHandoff(stored);
      } else {
        // Destructive mode — no key, just close.
        onOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const downloadMasked = () => {
    if (!maskedBlob) return;
    downloadBlob({ blob: maskedBlob, filename: `${fileId}-masked.pdf` });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> Generate masked PDF
            </DialogTitle>
            <DialogDescription>
              {candidates.length} annotation
              {candidates.length === 1 ? "" : "s"} marked for redaction will be
              masked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <span className="text-xs font-medium">Mode</span>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reversible" className="text-xs">
                    Reversible — server returns a per-session AES key. You can
                    restore originals on the return path.
                  </SelectItem>
                  <SelectItem value="destructive" className="text-xs">
                    Destructive — original spans are removed for good.
                  </SelectItem>
                  <SelectItem value="annotation" className="text-xs">
                    Annotation only — flag spans, don't modify the file.
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "reversible" ? (
              <div className="space-y-1">
                <span className="text-xs font-medium">Substitute style</span>
                <Select value={style} onValueChange={(v) => setStyle(v as Style)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bracket" className="text-xs">
                      [BRACKET] — clear placeholders ([SSN_001], [EMAIL_001])
                    </SelectItem>
                    <SelectItem value="shape" className="text-xs">
                      Shape-preserving — fake but Luhn/format-valid values
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {maskedBlob ? (
              <Button
                variant="outline"
                onClick={downloadMasked}
                className="w-full text-xs"
              >
                Download masked PDF
              </Button>
            ) : null}

            {error ? (
              <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              disabled={running || !candidates.length}
              onClick={() => void handleRun()}
              size="sm"
            >
              {running ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Masking…
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KeyHandoff
        record={handoff}
        onClose={() => setHandoff(null)}
        onDownloadMasked={maskedBlob ? downloadMasked : undefined}
      />
    </>
  );
}
