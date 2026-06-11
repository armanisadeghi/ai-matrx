/**
 * features/file-analysis/studio/panels/DocumentOpsPanel.tsx
 *
 * Document-level operations — everything that produces a derivative PDF
 * by transforming the whole file, not a specific page. Wraps the existing
 * matrx-utils PDF endpoints (already wired in ENDPOINTS.pdf.*):
 *
 *   - Scrub (metadata + attachments + JavaScript)
 *   - Flatten annotations
 *   - Strip metadata
 *   - Compress (low / medium / high quality)
 *   - Split into N parts (returns ZIP)
 *
 * Each op shows progress + lets the user download the result file.
 */

"use client";

import { useState } from "react";
import {
  Combine,
  Download,
  Eraser,
  FileText,
  Loader2,
  Scissors,
  Shield,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePdfClient as usePdfDemoApi } from "@/features/pdf/api/client";
import { useDownloadBlob } from "@/features/pdf/hooks/useDownloadBlob";
import { PdfPresetPicker } from "@/features/pdf/components/PdfPresetPicker";
import type { PdfBinaryResult as BinaryResult } from "@/features/pdf/api/client";
import { buildPdfSourceFromFileId } from "@/features/pdf/utils/source";

interface Props {
  fileId: string;
}

type OpKey =
  | "scrub"
  | "flatten"
  | "stripMetadata"
  | "compress"
  | "split";

export function DocumentOpsPanel({ fileId }: Props) {
  const api = usePdfDemoApi();
  const downloadBlob = useDownloadBlob();
  const [busy, setBusy] = useState<OpKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ op: OpKey; result: BinaryResult } | null>(null);

  const [compressLevel, setCompressLevel] = useState<"1" | "2" | "3">("2");
  const [splitParts, setSplitParts] = useState("2");

  async function run(
    op: OpKey,
    endpoint: Parameters<typeof api.postPdfBlob>[0],
    body: Record<string, unknown>,
  ) {
    setBusy(op);
    setError(null);
    setResult(null);
    try {
      const r = await api.postPdfBlob(endpoint, {
        ...buildPdfSourceFromFileId(fileId),
        ...body,
      });
      setResult({ op, result: r });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function downloadResult() {
    if (!result) return;
    downloadBlob(result.result);
  }

  return (
    <div className="h-full overflow-y-auto p-3 text-xs">
      <div className="space-y-3">
        <SectionTitle>Privacy & Cleanup</SectionTitle>

        <OpCard
          icon={Shield}
          label="Scrub"
          description="Strip metadata, attachments, and JavaScript actions"
          running={busy === "scrub"}
          onRun={() =>
            void run("scrub", "scrub", {
              metadata: true,
              attachments: true,
              javascript: true,
            })
          }
        />

        <OpCard
          icon={Eraser}
          label="Flatten annotations"
          description="Bake form fields and annotations into page pixels"
          running={busy === "flatten"}
          onRun={() => void run("flatten", "flattenAnnotations", {})}
        />

        <OpCard
          icon={FileText}
          label="Strip metadata"
          description="Remove /Info, XMP, and custom properties"
          running={busy === "stripMetadata"}
          onRun={() => void run("stripMetadata", "stripMetadata", {})}
        />

        <SectionTitle>Quality</SectionTitle>

        <OpCard
          icon={Zap}
          label="Compress"
          description="Reduce file size via image-quality reduction"
          running={busy === "compress"}
          onRun={() =>
            void run("compress", "compress", {
              level: Number.parseInt(compressLevel, 10),
            })
          }
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 shrink-0">
              Level
            </span>
            <Select
              value={compressLevel}
              onValueChange={(v) => setCompressLevel(v as "1" | "2" | "3")}
            >
              <SelectTrigger className="h-7 flex-1 text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1" className="text-[11px]">
                  1 — Smallest (low quality)
                </SelectItem>
                <SelectItem value="2" className="text-[11px]">
                  2 — Medium (recommended)
                </SelectItem>
                <SelectItem value="3" className="text-[11px]">
                  3 — High quality
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </OpCard>

        <SectionTitle>Document Operations</SectionTitle>

        <OpCard
          icon={Scissors}
          label="Split"
          description="Break the PDF into N equal parts (result is a ZIP)"
          running={busy === "split"}
          onRun={() => {
            const n = Number.parseInt(splitParts, 10);
            if (!n || n < 2) {
              setError("Parts must be >= 2");
              return;
            }
            void run("split", "split", { parts: n });
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-16 shrink-0">
              Parts
            </span>
            <Input
              type="number"
              min={2}
              value={splitParts}
              onChange={(e) => setSplitParts(e.target.value)}
              className="h-7 w-20 text-[11px]"
            />
          </div>
        </OpCard>

        <SectionTitle>Annotation-driven</SectionTitle>

        <div className="rounded border border-border bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
          <p className="mb-1">
            <span className="font-medium text-foreground">Reorder · Crop · Insert · Merge</span>
          </p>
          <p>
            Reorder via drag-and-drop in the Pages panel (coming next), Crop
            from the canvas in Draw mode (drag a rectangle + "Crop page" from
            the context menu), and Merge from the file list with multi-select.
          </p>
        </div>

        {result ? (
          <div className="flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/5 p-2">
            <Button
              size="sm"
              onClick={downloadResult}
              className="h-7 text-[10px]"
            >
              <Download className="h-3 w-3 mr-1" />
              Download {result.result.filename}
            </Button>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {(result.result.blob.size / 1024).toFixed(1)} KB
            </span>
          </div>
        ) : null}
        {error ? (
          <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-[11px] text-destructive">
            {error}
          </div>
        ) : null}

        <PdfPresetPicker fileId={fileId} className="pt-1" />
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-1">
      {children}
    </p>
  );
}

interface OpCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  children?: React.ReactNode;
  running?: boolean;
  onRun: () => void;
}

function OpCard({
  icon: Icon,
  label,
  description,
  children,
  running,
  onRun,
}: OpCardProps) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-start gap-2 px-2.5 py-2">
        <div className="shrink-0 mt-0.5 w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
          <Icon className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium leading-tight">{label}</p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {description}
          </p>
        </div>
        <Button
          size="sm"
          disabled={running}
          onClick={onRun}
          className="h-6 shrink-0 text-[10px]"
        >
          {running ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Run"
          )}
        </Button>
      </div>
      {children ? (
        <div className="border-t border-border px-2.5 py-2">{children}</div>
      ) : null}
    </div>
  );
}
