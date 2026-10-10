"use client";

/**
 * Cursor accounts — the person's connected Cursor API keys, any number.
 *
 * Connect: paste a key from the Cursor Dashboard; the server checks it with
 * Cursor and keeps it only in the Vault (`features/ai-work/lib/cursorAccounts.ts`).
 * The server then delivers agent mail into the person's Cursor cloud agents.
 * The pasted key is component-local state only, cleared the moment it is sent.
 *
 * Beside the list: how a Cursor cloud agent joins (add it to a room on
 * /work/live) and how it sends (the AI Matrx MCP in Cursor's own settings).
 */

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { resolveBaseUrl } from "@/lib/python-client";
import {
  CURSOR_DASHBOARD_URL,
  connectCursorKey,
  cursorErrorMessage,
  disconnectCursorKey,
  readCursorAccounts,
  type CursorAccountRow,
} from "@/features/ai-work/lib/cursorAccounts";

const STATUS_LABEL: Record<string, string> = {
  connected: "Connected",
  needs_attention: "Key refused — connect it again",
  disconnected: "Disconnected",
};

export function CursorAccountsPanel() {
  const [rows, setRows] = useState<CursorAccountRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const mcpUrl = `${resolveBaseUrl().replace(/\/$/, "")}/api/matrx-mcp`;

  const load = () =>
    readCursorAccounts().then(
      (next) => {
        setLoadError(null);
        setRows(next);
      },
      (cause: unknown) => {
        setRows([]);
        setLoadError(cursorErrorMessage(cause, "Your Cursor accounts did not load."));
      },
    );
  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const typed = key.trim();
    if (!typed) return;
    setKey("");
    setBusy("connect");
    setRefusal(null);
    try {
      const out = await connectCursorKey(typed, label);
      toast.success(`Cursor account connected: ${out.label}`);
      setOpen(false);
      setLabel("");
      void load();
    } catch (cause) {
      setRefusal(cursorErrorMessage(cause, "Cursor did not accept this key."));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: CursorAccountRow) => {
    setBusy(`rm:${row.id}`);
    try {
      await disconnectCursorKey(row.id);
      void load();
    } catch (cause) {
      toast.error(cursorErrorMessage(cause, "Could not disconnect this key."));
    } finally {
      setBusy(null);
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section id="cursor-accounts" className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Cursor accounts</h2>
          <Button
            variant="outline"
            icon={<Plus />}
            onClick={() => {
              setOpen(true);
              setRefusal(null);
            }}
            disabled={busy !== null || open}
          >
            Connect
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivers messages to your Cursor cloud agents.
        </p>

        {open && (
          <form
            className="mt-3 space-y-2 rounded-lg border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Button asChild variant="quiet">
              <a href={CURSOR_DASHBOARD_URL} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Create a key in Cursor
              </a>
            </Button>
            <Input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your Cursor API key"
              autoComplete="off"
              aria-label="Cursor API key"
            />
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Name (optional)"
              autoComplete="off"
              aria-label="Name for this key"
            />
            {refusal && <ErrorNotice message={refusal} size="inline" />}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                icon={busy === "connect" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                disabled={busy !== null || !key.trim()}
              >
                {busy === "connect" ? "Checking with Cursor…" : "Connect"}
              </Button>
              <Button
                type="button"
                variant="quiet"
                icon={<X />}
                aria-label="Cancel"
                onClick={() => {
                  setOpen(false);
                  setKey("");
                  setRefusal(null);
                }}
                disabled={busy !== null}
              />
            </div>
          </form>
        )}

        <ul className="mt-3 divide-y divide-border">
          {rows === null && <li className="py-2 text-xs text-muted-foreground">Loading…</li>}
          {rows?.length === 0 && !loadError && (
            <li className="py-2 text-xs text-muted-foreground">No Cursor account connected.</li>
          )}
          {loadError && (
            <li className="py-2">
              <ErrorNotice message={loadError} size="inline" />
            </li>
          )}
          {rows?.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">{STATUS_LABEL[row.status] ?? row.status}</p>
              </div>
              <Button
                variant="quiet"
                icon={busy === `rm:${row.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                onClick={() => void remove(row)}
                disabled={busy !== null}
              >
                Disconnect
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Use AI Matrx in Cursor cloud agents</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>In Cursor, add an MCP server with the address below, then sign in.</li>
          <li>On Live, open a room and use + Cursor agent to add one of your agents.</li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">{mcpUrl}</code>
          <Button variant="outline" icon={copied ? <Check /> : <Copy />} onClick={() => void copyUrl()}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </section>
  );
}
