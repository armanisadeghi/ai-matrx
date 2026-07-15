"use client";

// features/admin/catalogs/components/AddFromLinkDialog.tsx
//
// THE headline flow: paste any HuggingFace / Civitai / direct URL →
// POST {aidream}/api/catalog-resolver/resolve (user's Supabase JWT bearer via
// the canonical BackendClient) → pick a file → a prefilled entry editor opens
// with the resolver's suggestions pre-applied. The admin reviews and saves
// through the normal diff-confirmed RPC path — the resolver never writes.
//
// The endpoint ships from a parallel aidream session; unreachable/404 shows a
// "resolver requires the latest aidream deploy" notice, never a crash.

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CloudDownload,
  ExternalLink,
  FileBox,
  Link2,
  Loader2,
  ScanSearch,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAccessToken } from "@/lib/redux/slices/userSlice";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { formatBytes } from "@/features/admin/shared/UrlProbeField";
import { resolveCatalogLink } from "@/features/admin/catalogs/resolver";
import { CATALOG_KINDS, CATALOG_KEY_REGEX } from "@/features/admin/catalogs/schemas";
import type {
  EntryPrefill,
  ResolveLinkResult,
  ResolvedFile,
} from "@/features/admin/catalogs/types";

const KIND_HINT_AUTO = "__auto__";

interface AddFromLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kind of the table the dialog was opened from (pre-fills the hint). */
  defaultKind?: string | null;
  /** Hands the reviewed prefill to the parent, which opens the entry editor. */
  onPick: (prefill: EntryPrefill) => void;
}

type ResolveState =
  | { status: "idle" }
  | { status: "resolving" }
  | { status: "resolved"; result: ResolveLinkResult }
  | { status: "not_deployed"; message: string }
  | { status: "error"; message: string };

function sourceBadgeLabel(source: ResolveLinkResult["source"]): string {
  if (source === "huggingface") return "Hugging Face";
  if (source === "civitai") return "Civitai";
  return "Direct URL";
}

/** Derive a key that passes the DB CHECK from a filename / model name. */
function deriveKey(raw: string): string {
  const stripped = raw.replace(/\.(gguf|safetensors|bin|onnx|pt|zip|tar\.gz)$/i, "");
  const cleaned = stripped
    .replace(/[^A-Za-z0-9._:@/ -]/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 200);
  return CATALOG_KEY_REGEX.test(cleaned) ? cleaned : `entry-${Date.now()}`;
}

export function AddFromLinkDialog({
  open,
  onOpenChange,
  defaultKind,
  onPick,
}: AddFromLinkDialogProps) {
  const accessToken = useAppSelector(selectAccessToken);
  const baseUrl = useAppSelector(selectResolvedBaseUrl);

  const [url, setUrl] = useState("");
  const [kindHint, setKindHint] = useState<string>(
    defaultKind ?? KIND_HINT_AUTO,
  );
  const [state, setState] = useState<ResolveState>({ status: "idle" });
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resolvedKindHint = kindHint === KIND_HINT_AUTO ? null : kindHint;

  const runResolve = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!baseUrl) {
      setState({
        status: "error",
        message:
          "No aidream server URL configured (NEXT_PUBLIC_BACKEND_URL_*) — cannot reach the resolver.",
      });
      return;
    }
    if (!accessToken) {
      setState({
        status: "error",
        message: "No session access token available — reload and sign in again.",
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSelectedFileUrl(null);
    setState({ status: "resolving" });
    const outcome = await resolveCatalogLink({
      baseUrl,
      accessToken,
      url: trimmed,
      kindHint: resolvedKindHint,
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;
    if (outcome.status === "ok") {
      setState({ status: "resolved", result: outcome.result });
      if (outcome.result.files.length === 1) {
        setSelectedFileUrl(outcome.result.files[0].download_url);
      }
    } else {
      setState(outcome);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      abortRef.current?.abort();
      setState({ status: "idle" });
      setSelectedFileUrl(null);
      setUrl("");
    }
    onOpenChange(next);
  };

  const buildPrefill = (
    result: ResolveLinkResult,
    file: ResolvedFile,
  ): EntryPrefill => {
    // Prefer the resolver's own suggestion for this exact file. Suggestions
    // with a null artifact_url (artifact-less kinds / skeletons) can't match
    // by URL — fall back to matching by kind (hint first), attaching the
    // selected file as the artifact.
    const suggestion =
      result.suggestions.find((s) => s.artifact_url === file.download_url) ??
      result.suggestions.find(
        (s) =>
          s.artifact_url === null &&
          (resolvedKindHint === null || s.kind === resolvedKindHint),
      ) ??
      result.suggestions.find((s) => s.artifact_url === null) ??
      null;
    if (suggestion) {
      return {
        kind: suggestion.kind,
        key: suggestion.key,
        payload: suggestion.payload,
        artifact_url: suggestion.artifact_url ?? file.download_url,
        artifact_sha256: suggestion.artifact_sha256 ?? file.sha256 ?? null,
        artifact_size_bytes:
          suggestion.artifact_size_bytes ?? file.size_bytes ?? null,
        notes: suggestion.notes ?? `Added from ${result.canonical_url}`,
      };
    }
    const fallbackKind =
      resolvedKindHint ??
      result.suggestions[0]?.kind ??
      defaultKind ??
      CATALOG_KINDS[0].slug;
    return {
      kind: fallbackKind,
      key: deriveKey(file.filename || result.name),
      payload: {
        name: result.name,
        ...(result.license ? { license: result.license } : {}),
        ...(result.description ? { description: result.description } : {}),
        source_url: result.canonical_url,
        filename: file.filename,
        ...(file.label ? { quant_label: file.label } : {}),
      },
      artifact_url: file.download_url,
      artifact_sha256: file.sha256 ?? null,
      artifact_size_bytes: file.size_bytes ?? null,
      notes: `Added from ${result.canonical_url}`,
    };
  };

  const result = state.status === "resolved" ? state.result : null;
  const selectedFile =
    result?.files.find((f) => f.download_url === selectedFileUrl) ?? null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" /> Add from link
          </DialogTitle>
          <DialogDescription>
            Paste any Hugging Face or Civitai URL (or a direct file URL). The
            aidream resolver extracts the files and suggests a catalog entry —
            you review and save it through the normal diff-confirmed path.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="add-from-link-url">Link</Label>
              <Input
                id="add-from-link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runResolve();
                  }
                }}
                placeholder="https://huggingface.co/… or https://civitai.com/models/…"
                className="font-mono text-sm"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-52">
              <Label htmlFor="add-from-link-kind">Kind hint</Label>
              <Select value={kindHint} onValueChange={setKindHint}>
                <SelectTrigger id="add-from-link-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KIND_HINT_AUTO}>Auto-detect</SelectItem>
                  {CATALOG_KINDS.map((k) => (
                    <SelectItem key={k.slug} value={k.slug}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={() => void runResolve()}
              disabled={state.status === "resolving" || url.trim().length === 0}
              className="shrink-0"
            >
              {state.status === "resolving" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="mr-1.5 h-4 w-4" />
              )}
              Resolve
            </Button>
          </div>

          {state.status === "resolving" ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Asking the resolver…
              upstream registries can take a few seconds.
            </div>
          ) : null}

          {state.status === "not_deployed" ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-700 dark:text-amber-400">
              <CloudDownload className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{state.message}</p>
            </div>
          ) : null}

          {state.status === "error" ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{state.message}</p>
            </div>
          ) : null}

          {result ? (
            <div className="space-y-3">
              <div className="space-y-1 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{sourceBadgeLabel(result.source)}</Badge>
                  <span className="font-medium">{result.name}</span>
                  {result.license ? (
                    <Badge variant="secondary" className="font-normal">
                      {result.license}
                    </Badge>
                  ) : null}
                  <a
                    href={result.canonical_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> open source page
                  </a>
                </div>
                {result.description ? (
                  <p className="line-clamp-3 text-xs text-muted-foreground">
                    {result.description}
                  </p>
                ) : null}
              </div>

              {result.files.length === 0 ? (
                <p className="rounded-md border border-border px-3 py-4 text-sm text-muted-foreground">
                  The resolver found no downloadable files at this link.
                </p>
              ) : (
                <div className="max-h-[38vh] space-y-1 overflow-y-auto rounded-md border border-border p-1">
                  {result.files.map((file) => {
                    const selected = file.download_url === selectedFileUrl;
                    return (
                      <button
                        key={file.download_url}
                        type="button"
                        onClick={() => setSelectedFileUrl(file.download_url)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                          selected
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50",
                        )}
                      >
                        <FileBox className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {file.filename}
                        </span>
                        {file.label ? (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {file.label}
                          </Badge>
                        ) : null}
                        <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                          {formatBytes(file.size_bytes)}
                        </span>
                        <span
                          className="w-24 shrink-0 truncate text-right font-mono text-[10px] text-muted-foreground"
                          title={file.sha256 ?? undefined}
                        >
                          {file.sha256 ? file.sha256.slice(0, 12) : "no hash"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!selectedFile}
                  onClick={() => {
                    if (!selectedFile) return;
                    onPick(buildPrefill(result, selectedFile));
                    handleClose(false);
                  }}
                >
                  Use this file
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
