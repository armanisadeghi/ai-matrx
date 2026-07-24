"use client";

// features/admin/shared-knowledge/components/IngestTab.tsx
//
// Curation ingest: pick an existing cloud file (canonical shared picker) or
// upload a new one (canonical fileHandler via useFileUpload — never a
// bespoke uploader), then submit it to P1's
// `POST /rag/library/stores/{store_id}/ingest`. The endpoint is a published
// day-1 stub that answers 501 until the P1-full pipeline (system-owner
// rehome + streamed progress) lands — that state renders as a clearly
// labeled "pipeline not yet live" card, never a swallowed error.

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  FolderOpen,
  Loader2,
  Send,
  Upload,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { openFilePicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import {
  ingestLibraryFile,
  isLibraryIngestNotLive,
} from "@/features/rag/api/library-ingest";
import type { SharedKnowledgeDirectory } from "../types";

type IngestPhase =
  | "idle"
  | "submitting"
  | "not_live"
  | "complete"
  | "error";

interface PickedFile {
  fileId: string;
  label: string;
}

export function IngestTab({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  const [storeId, setStoreId] = useState<string>(
    directory.stores[0]?.id ?? "",
  );
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [profile, setProfile] = useState("");
  const [phase, setPhase] = useState<IngestPhase>("idle");
  const [resultDetail, setResultDetail] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading, progress } = useFileUpload();

  const selectedStore =
    directory.stores.find((s) => s.id === storeId) ?? null;

  const onPickExisting = async () => {
    const ids = await openFilePicker({
      multi: false,
      title: "Choose a file to ingest",
      description: "The file becomes system-owned library content.",
    });
    const fileId = ids?.[0];
    if (!fileId) return;
    setPicked({ fileId, label: `Cloud file ${fileId.slice(0, 8)}…` });
    setPhase("idle");
    setResultDetail(null);
  };

  const onUploadNew = async (file: File) => {
    try {
      const normalized = await upload({ kind: "file", file });
      if (!normalized.fileId) {
        throw new Error("Upload finished without a file id");
      }
      setPicked({
        fileId: normalized.fileId,
        label: normalized.meta.fileName ?? file.name,
      });
      setPhase("idle");
      setResultDetail(null);
      toast.success("File uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const onSubmit = async () => {
    if (!storeId || !picked) return;
    setPhase("submitting");
    setResultDetail(null);
    try {
      const res = await ingestLibraryFile(storeId, picked.fileId, {
        profile: profile.trim() || null,
      });
      setPhase("complete");
      setResultDetail(res.detail);
      toast.success("Library ingest complete");
    } catch (e) {
      if (isLibraryIngestNotLive(e)) {
        // Honest stub state — the contract is live, the pipeline isn't.
        setPhase("not_live");
        setResultDetail(
          "The server validated the store and file, but the P1 ingest pipeline (system-owner rehome + streamed progress) has not shipped yet.",
        );
      } else {
        setPhase("error");
        setResultDetail(e instanceof Error ? e.message : "Ingest failed");
      }
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Target library store
        </label>
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a library store…" />
          </SelectTrigger>
          <SelectContent>
            {directory.stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
                {!s.isActive ? " (inactive)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedStore ? (
          <p className="text-xs text-muted-foreground">
            {selectedStore.memberCount} member
            {selectedStore.memberCount === 1 ? "" : "s"} ·{" "}
            {selectedStore.organizationName ?? "no owning org"}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Source file
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onPickExisting}>
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Choose existing file
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            Upload new file
            {uploading && progress
              ? ` (${Math.round(progress.ratio * 100)}%)`
              : ""}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadNew(f);
              e.target.value = "";
            }}
          />
        </div>
        {picked ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{picked.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {picked.fileId}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            No file selected yet.
          </div>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Ingest profile (optional)
        </label>
        <Input
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          placeholder="e.g. a library-tuned cleanup preset — unused until P1-full"
        />
      </div>

      <Button
        onClick={onSubmit}
        disabled={!storeId || !picked || phase === "submitting"}
      >
        {phase === "submitting" ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        Start library ingest
      </Button>

      {/* Labeled progress / result */}
      {phase !== "idle" ? (
        <div
          className={`rounded-md border px-3 py-2.5 text-sm ${
            phase === "error"
              ? "border-destructive/40 bg-destructive/10"
              : phase === "not_live"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-border bg-card"
          }`}
        >
          <div className="flex items-center gap-2 font-medium text-foreground">
            {phase === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Submitting to the
                ingest pipeline…
              </>
            ) : phase === "complete" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary" /> Ingest
                complete
              </>
            ) : phase === "not_live" ? (
              <>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-500" />{" "}
                Pipeline not yet live (contract verified)
              </>
            ) : (
              <>
                <CircleAlert className="h-4 w-4 text-destructive" /> Ingest
                failed
              </>
            )}
          </div>
          {resultDetail ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {resultDetail}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
