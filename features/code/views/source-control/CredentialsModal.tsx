"use client";

import React, { useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Trash2,
  Zap,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SandboxGitAdapter } from "../../adapters/SandboxGitAdapter";

interface CredentialsModalProps {
  adapter: SandboxGitAdapter;
  onClose: () => void;
}

type CredentialKind = "github" | "ssh";

/**
 * Modal for managing the active sandbox's git credentials.
 *
 * Two flavours are supported:
 *  - GitHub PAT — stored server-side and used for HTTPS clone/push/pull.
 *  - SSH private key — stored as a file in the sandbox; used for git@... URLs.
 *
 * Credential bodies never leave this component except via the adapter call;
 * state is dropped on close so a stray reload doesn't leak tokens.
 */
export const CredentialsModal: React.FC<CredentialsModalProps> = ({
  adapter,
  onClose,
}) => {
  const [kind, setKind] = useState<CredentialKind>("github");
  const [token, setToken] = useState("");
  const [scope, setScope] = useState<"read" | "write">("write");
  const [sshKey, setSshKey] = useState("");
  const [knownHosts, setKnownHosts] = useState("");
  const [revealToken, setRevealToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (kind === "github") {
        if (!token.trim()) throw new Error("Paste a GitHub personal access token.");
        await adapter.setGithubToken(token.trim(), scope);
        setMessage("GitHub token stored.");
        setToken("");
      } else {
        if (!sshKey.trim()) throw new Error("Paste an SSH private key.");
        await adapter.setSshKey(sshKey, knownHosts || undefined);
        setMessage("SSH key stored.");
        setSshKey("");
        setKnownHosts("");
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adapter.revokeCredentials();
      setMessage("Credentials revoked.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const useWorkspaceToken = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await adapter.useWorkspaceToken(scope);
      setMessage(
        "Workspace GitHub token attached — git push/pull are ready in this sandbox.",
      );
    } catch (err) {
      const raw = extractErrorMessage(err);
      // Friendlier copy when the server doesn't have the token configured.
      if (raw.includes("412")) {
        setError(
          "Workspace token isn't configured. Ask an admin to set MATRX_SANDBOX_GH_TOKEN on the server.",
        );
      } else {
        setError(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-md border border-neutral-300 bg-white text-[12px] shadow-xl dark:border-neutral-700 dark:bg-neutral-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} />
            <h2 className="font-semibold">Git Credentials</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X size={14} />
          </button>
        </div>
        <div className="space-y-2 p-3">
          <div className="flex h-7 items-center gap-1 rounded-sm bg-neutral-100 p-0.5 dark:bg-neutral-900">
            <Tab active={kind === "github"} onClick={() => setKind("github")}>
              GitHub PAT
            </Tab>
            <Tab active={kind === "ssh"} onClick={() => setKind("ssh")}>
              SSH key
            </Tab>
          </div>
          {kind === "github" ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void useWorkspaceToken()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/60"
              >
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Zap size={12} />
                )}
                Use Matrx workspace token
              </button>
              <p className="text-[10px] leading-tight text-neutral-500 dark:text-neutral-400">
                One-click bootstrap using the server-side{" "}
                <code className="font-mono">MATRX_SANDBOX_GH_TOKEN</code>. The
                token never reaches your browser. Use this for{" "}
                <code className="font-mono">armanisadeghi</code> repos.
              </p>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                <span className="text-[9px] uppercase tracking-wider text-neutral-400">
                  or paste a token
                </span>
                <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              </div>
              <label className="block text-[11px] text-neutral-600 dark:text-neutral-400">
                Personal access token
                <div className="mt-1 flex items-stretch gap-1">
                  <input
                    type={revealToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_…"
                    className="h-7 flex-1 rounded-sm border border-neutral-300 bg-white px-2 text-[12px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealToken((v) => !v)}
                    className="flex h-7 w-7 items-center justify-center rounded-sm border border-neutral-300 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    aria-label={revealToken ? "Hide token" : "Show token"}
                  >
                    {revealToken ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </label>
              <label className="block text-[11px] text-neutral-600 dark:text-neutral-400">
                Scope
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "read" | "write")}
                  className="mt-1 h-7 w-full rounded-sm border border-neutral-300 bg-white px-2 text-[12px] dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <option value="read">read (clone/pull)</option>
                  <option value="write">write (clone/pull/push)</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] text-neutral-600 dark:text-neutral-400">
                Private key (PEM)
                <textarea
                  value={sshKey}
                  onChange={(e) => setSshKey(e.target.value)}
                  rows={6}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----"}
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-white p-2 font-mono text-[11px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
              <label className="block text-[11px] text-neutral-600 dark:text-neutral-400">
                known_hosts (optional)
                <textarea
                  value={knownHosts}
                  onChange={(e) => setKnownHosts(e.target.value)}
                  rows={2}
                  placeholder="github.com ssh-ed25519 …"
                  className="mt-1 w-full rounded-sm border border-neutral-300 bg-white p-2 font-mono text-[11px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
                />
              </label>
            </div>
          )}

          {error && (
            <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          {message && !error && (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              {message}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-3 py-2 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={busy}
            className="flex items-center gap-1 rounded-sm border border-red-300 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <Trash2 size={12} />
            Revoke
          </button>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-neutral-300 px-2 py-1 text-[11px] text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="flex items-center gap-1 rounded-sm border border-blue-400 bg-blue-500 px-2 py-1 text-[11px] text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Tab: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex h-6 flex-1 items-center justify-center rounded-sm text-[11px] transition-colors",
      active
        ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
    )}
  >
    {children}
  </button>
);
