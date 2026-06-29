"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Bug,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Hash,
  Home,
  RefreshCw,
  Shield,
  Terminal,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin, selectUser } from "@/lib/redux/slices/userSlice";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  attemptChunkReload,
  isChunkLoadError,
} from "@/components/errors/chunk-load-recovery";
import { captureReactRenderError } from "@/lib/diagnostics/captureReactError";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorBoundaryViewProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Human-readable name of the section that failed, e.g. "Agents" */
  context?: string;
  /** Override the default home path ("/") */
  homePath?: string;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/** Strip minified Next.js chunk URLs from a stack trace — noise for AI models. */
function cleanStackForAI(stack: string): string {
  return stack
    .split("\n")
    .map((line) =>
      line.replace(
        /\(https?:\/\/[^\s)]+\/_next\/static\/chunks\/([^:)]+)(?::[0-9]+)*\)/g,
        "(<chunk:$1>)",
      ),
    )
    .join("\n");
}

function buildAIContext(
  error: Error & { digest?: string },
  user: ReturnType<typeof selectUser>,
  timestamp: string,
  url: string,
  userAgent: string,
): string {
  const cleanStack = error.stack ? cleanStackForAI(error.stack) : null;
  const uaShort = userAgent
    .replace(/Mozilla\/\S+\s*/, "")
    .replace(/\(.*?\)\s*/g, "")
    .trim()
    .slice(0, 120);

  const lines: (string | null)[] = [
    "## Runtime Error Report",
    "",
    "### Error",
    `- **Type:** \`${error.name}\``,
    `- **Message:** ${error.message}`,
    error.digest ? `- **Digest:** \`${error.digest}\`` : null,
    "",
    "### Context",
    `- **Timestamp:** ${timestamp}`,
    `- **URL:** \`${url}\``,
    `- **Browser:** ${uaShort || userAgent.slice(0, 120)}`,
    "",
    "### User",
    `- **ID:** \`${user.id ?? "unauthenticated"}\``,
    `- **Email:** ${user.email ?? "—"}`,
    `- **Role:** ${user.isAdmin ? "admin" : "user"}`,
    `- **Auth provider:** ${user.appMetadata?.provider ?? "unknown"}`,
    "",
  ];

  if (cleanStack) {
    lines.push("### Stack Trace", "```", cleanStack, "```", "");
  }

  lines.push(
    "---",
    "_Copied from the AI Matrx Admin error boundary. Please help diagnose and fix this error._",
  );

  return lines.filter((l) => l !== null).join("\n");
}

// ---------------------------------------------------------------------------
// Primitive sub-components
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={cn("text-xs text-foreground break-all", mono && "font-mono")}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function CopyForAIButton({
  error,
  user,
  timestamp,
  url,
  userAgent,
}: {
  error: Error & { digest?: string };
  user: ReturnType<typeof selectUser>;
  timestamp: string;
  url: string;
  userAgent: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildAIContext(error, user, timestamp, url, userAgent);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border",
        copied
          ? "bg-green-500/15 border-green-500/30 text-green-500"
          : "bg-violet-500/10 border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300",
      )}
      title="Copy a clean, structured summary for pasting into an AI chat"
    >
      {copied ? <Check className="h-3 w-3" /> : <Boxes className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy for AI"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Admin debug panel
// ---------------------------------------------------------------------------

function AdminPanel({ error }: { error: Error & { digest?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const [stackExpanded, setStackExpanded] = useState(false);
  const user = useAppSelector(selectUser);

  const timestamp = new Date().toISOString();
  const userAgent =
    typeof window !== "undefined" ? navigator.userAgent : "unknown";
  const url = typeof window !== "undefined" ? window.location.href : "unknown";

  const fullDump = JSON.stringify(
    {
      timestamp,
      url,
      error: {
        name: error.name,
        message: error.message,
        digest: error.digest,
        stack: error.stack,
      },
      user: { id: user.id, email: user.email, isAdmin: user.isAdmin },
      userAgent,
    },
    null,
    2,
  );

  return (
    <div className="w-full mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      {/* Header — always visible, acts as collapse toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 hover:bg-amber-500/15 transition-colors text-left"
      >
        <Shield className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">
          Admin Debug Context
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] border-amber-500/30 text-amber-500/80 pointer-events-none"
          >
            Only visible to admins
          </Badge>
          {/* Isolated click — must not toggle the panel */}
          <span onClick={(e) => e.stopPropagation()}>
            <CopyForAIButton
              error={error}
              user={user}
              timestamp={timestamp}
              url={url}
              userAgent={userAgent}
            />
          </span>
          <span className="text-amber-500/60">
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Error details */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Bug className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-semibold text-foreground">
                Error Details
              </span>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/60 px-3 py-1">
              <InfoRow label="Type" value={error.name} mono />
              <InfoRow label="Message" value={error.message} />
              {error.digest && (
                <InfoRow label="Digest" value={error.digest} mono />
              )}
              <InfoRow label="Timestamp" value={timestamp} mono />
            </div>
          </div>

          {/* Request context */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">
                Request Context
              </span>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/60 px-3 py-1">
              <InfoRow label="URL" value={url} mono />
              <InfoRow label="User Agent" value={userAgent} />
            </div>
          </div>

          {/* User context */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">
                User Context
              </span>
            </div>
            <div className="rounded-lg bg-background/60 border border-border/60 px-3 py-1">
              <InfoRow label="User ID" value={user.id ?? "not set"} mono />
              <InfoRow label="Email" value={user.email ?? "not set"} />
              <InfoRow
                label="Last Sign In"
                value={user.lastSignInAt ?? "unknown"}
                mono
              />
              <InfoRow
                label="Auth Provider"
                value={user.appMetadata?.provider ?? "unknown"}
              />
            </div>
          </div>

          {/* Stack trace */}
          {error.stack && (
            <div>
              <button
                onClick={() => setStackExpanded((p) => !p)}
                className="flex items-center gap-1.5 mb-2 w-full text-left group"
              >
                <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">
                  Stack Trace
                </span>
                <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
                  {stackExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              </button>
              {stackExpanded && (
                <div className="relative rounded-lg bg-zinc-950 dark:bg-black border border-border/60 overflow-hidden">
                  <div className="absolute top-2 right-2">
                    <CopyButton text={error.stack} />
                  </div>
                  <pre className="text-[11px] font-mono text-zinc-300 p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                    {error.stack}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Full JSON dump */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              Full JSON dump
            </span>
            <CopyButton text={fullDump} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function ErrorBoundaryView({
  error,
  reset,
  context,
  homePath = "/",
}: ErrorBoundaryViewProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const isStaleChunk = isChunkLoadError(error);

  useEffect(() => {
    console.error(`[ErrorBoundary${context ? ` — ${context}` : ""}]`, error);
    // Stale-tab recovery — see chunk-load-recovery.ts for the why.
    if (isStaleChunk) {
      attemptChunkReload(error);
    } else {
      // Feed the systemwide Error Inspector. One place here covers every
      // route-level error.tsx (they all delegate to ErrorBoundaryView).
      captureReactRenderError(error, {
        boundary: "RouteErrorBoundary",
        relation: context,
        componentStack: error.digest ? `digest: ${error.digest}` : null,
      });
    }
  }, [error, context, isStaleChunk]);

  if (isStaleChunk) {
    return (
      <div className="h-full flex items-center justify-center py-12 px-4">
        <div className="text-center">
          <RefreshCw className="h-6 w-6 mx-auto mb-3 text-muted-foreground animate-spin" />
          <h2 className="text-base font-semibold mb-1">
            Updating to the latest version…
          </h2>
          <p className="text-sm text-muted-foreground">
            A new build was deployed. Reloading this tab.
          </p>
        </div>
      </div>
    );
  }

  const handleReset = () => {
    setResetting(true);
    reset();
  };

  return (
    <div className="h-full flex items-start justify-center overflow-y-auto py-12 px-4">
      <div className="w-full max-w-xl flex flex-col items-center">
        {/* Icon */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-destructive/20 blur-xl scale-150 opacity-60" />
          <div className="relative p-4 rounded-2xl bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        {/* Heading + error info */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold tracking-tight mb-2">
            Something went wrong
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
            {error.message ||
              "An unexpected error occurred while loading this page."}
          </p>
          {error.digest && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <Hash className="h-3 w-3 text-muted-foreground/60" />
              <span className="text-[11px] font-mono text-muted-foreground/60">
                Error ID: {error.digest}
              </span>
              <CopyButton text={error.digest} />
            </div>
          )}
          {error.name && error.name !== "Error" && (
            <div className="mt-2">
              <Badge variant="destructive" className="text-[11px] font-mono">
                {error.name}
              </Badge>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
          <Button onClick={handleReset} disabled={resetting} className="gap-2">
            <RefreshCw className={cn("h-4 w-4", resetting && "animate-spin")} />
            {resetting ? "Retrying…" : "Try again"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="gap-2"
          >
            Go back
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push(homePath)}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            Home
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/50 mb-4">
          If this keeps happening, try refreshing the page or clearing your
          cache.
        </p>

        {/* Admin-only debug panel */}
        {isAdmin && <AdminPanel error={error} />}
      </div>
    </div>
  );
}
