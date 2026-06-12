"use client";

import { useState, useCallback } from "react";
import {
  KeyRound,
  Copy,
  Check,
  Download,
  Loader2,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { SandboxAccessResponse } from "@/types/sandbox";

interface SshAccessPanelProps {
  /** Supabase row UUID — used for API calls only. */
  sandboxId: string;
  apiBasePath?: string;
  disabled?: boolean;
}

export function SshAccessPanel({
  sandboxId,
  apiBasePath = "/api/sandbox",
  disabled = false,
}: SshAccessPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<SandboxAccessResponse | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleRequestAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiBasePath}/${sandboxId}/access`, {
        method: "POST",
      });
      // Read as text first: platform-level failures (Vercel function crash /
      // timeout pages, proxy errors) return plain text, and a blind
      // resp.json() turns the real error into "Unexpected token … is not
      // valid JSON" — useless to the user.
      const raw = await resp.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      if (!resp.ok) {
        const message =
          (typeof body?.error === "string" && body.error) ||
          (typeof body?.message === "string" && body.message) ||
          (raw ? raw.slice(0, 200) : "") ||
          `Failed to generate SSH credentials (HTTP ${resp.status})`;
        throw new Error(message);
      }
      if (!body || typeof body.private_key !== "string") {
        throw new Error(
          "SSH service returned an unexpected response — try again.",
        );
      }
      setAccess(body as unknown as SandboxAccessResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sandboxId, apiBasePath]);

  const copyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    }
  }, []);

  const handleDownloadKey = useCallback(() => {
    if (!access) return;
    const blob = new Blob([access.private_key], {
      type: "application/x-pem-file",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // Use the orchestrator sandbox ID so the filename matches the SSH command.
    a.download = `sandbox-${access.sandbox_id}.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [access]);

  if (!access) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Direct SSH Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Generate temporary SSH credentials for direct shell access to this
            sandbox.
          </p>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2 mb-3">
              {error}
            </div>
          )}
          <Button
            onClick={handleRequestAccess}
            disabled={disabled || loading}
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4 mr-2" />
                Request SSH Access
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Use the orchestrator sandbox ID for the key filename so it matches
  // across the download, chmod instruction, and SSH command.
  const pemFilename = `sandbox-${access.sandbox_id}.pem`;

  // Build the SSH command with the local filename rather than the
  // server-side /tmp path that the orchestrator returns.
  const localSshCommand = `ssh -i ./${pemFilename} -o StrictHostKeyChecking=no -p ${access.port} ${access.username}@${access.host}`;

  // "localhost" means the SSH port is only reachable from inside the
  // server infrastructure, not directly from the user's machine.
  const requiresTunnel =
    access.host === "localhost" || access.host === "127.0.0.1";

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-green-600 dark:text-green-400" />
            SSH Credentials Ready
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestAccess}
            disabled={loading}
            className="h-7 px-2 text-xs"
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              "Regenerate"
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {requiresTunnel && (
          <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-amber-700 dark:text-amber-400">
              This sandbox runs on internal infrastructure. Direct SSH from your
              local machine requires port forwarding. Use the in-browser
              terminal above for immediate access.
            </p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            SSH Command
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-zinc-950 text-green-400 rounded-md p-2.5 overflow-x-auto">
              {localSshCommand}
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(localSshCommand, "command")}
              className="shrink-0 h-8 w-8 p-0"
            >
              {copiedField === "command" ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadKey}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download Key (.pem)
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => copyToClipboard(access.private_key, "key")}
            className="text-xs"
          >
            {copiedField === "key" ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                Key Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy Key
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-2">
          <p>After downloading the key, set permissions before connecting:</p>
          <code className="block font-mono bg-muted rounded px-2 py-1">
            chmod 600 {pemFilename}
          </code>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Credentials are temporary and expire when the sandbox is destroyed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
