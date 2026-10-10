"use client";

/**
 * Claude accounts — the person's connected claude.ai accounts, any number.
 *
 * Each one is Claude Code's own sign-in, held in its own home inside the
 * person's Matrx Sandbox (`features/ai-work/lib/ownPlan.ts`, the same flow the
 * own-plan billing step uses), and listed from `users.integration_connections`
 * (provider `claude_ai`), which the server writes from the sandbox's answer.
 * The server's cloud courier uses these accounts to deliver agent mail into the
 * person's Claude cloud sessions, so connecting is the only step.
 *
 * The pasted code is component-local state only: never Redux, never storage,
 * never logged, and cleared the moment it is submitted.
 *
 * Below the list: how to add AI Matrx to Claude itself (claude.ai's own
 * connector settings, OAuth, once per Claude account) so cloud sessions can
 * send and read mail.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, LogOut, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Input } from "@ai-matrx/design-system/controls";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import { resolveBaseUrl } from "@/lib/python-client";
import { createClient } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";
import { isJsonObject } from "@/types/json";
import {
  abortableSleep,
  connectClaudeAccount,
} from "@/features/ai-work/lib/connectClaudeAccount";
import { SandboxCapacityList } from "@/features/ai-work/components/SandboxCapacityList";
import {
  cancelOwnPlanSignIn,
  capacityRefusalOf,
  readHostedCapacity,
  newClaudeAccountSlot,
  signOutOwnPlan,
  submitOwnPlanCode,
  type OwnPlanStatus,
  type SandboxCapacityRefusal,
  type SandboxOccupant,
} from "@/features/ai-work/lib/ownPlan";

const PROVIDER = "claude_code" as const;


const SLOT_WAIT_MS = 90_000;

/** After a Stop: wait until the cap no longer refuses (the box has really stopped). */
async function waitForFreeSlot(signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + SLOT_WAIT_MS;
  while (!signal.aborted && Date.now() < deadline) {
    try {
      if ((await readHostedCapacity()) === null) return;
    } catch {
      return; // not a verdict; let Connect itself give the honest answer
    }
    await abortableSleep(2_000, signal);
  }
}
const PRIMARY = "primary";
const CLAUDE_CONNECTORS_URL = "https://claude.ai/settings/connectors";

interface ClaudeAccountRow {
  id: string;
  label: string;
  status: string;
  slot: string | null;
}

async function readClaudeAccounts(): Promise<ClaudeAccountRow[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await getClaimsUser(supabase);
  if (authError) throw operationFailed("load your Claude accounts", authError);
  if (!user?.id) return [];
  const { data, error } = await supabase
    .schema("users")
    .from("integration_connections")
    .select("id, account_name, account_email, status, metadata")
    .eq("provider", "claude_ai")
    .eq("owner_type", "user")
    .eq("owner_user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw operationFailed("load your Claude accounts", error);
  return data.map((row) => {
    const slot = isJsonObject(row.metadata) ? row.metadata.account_slot : null;
    return {
      id: row.id,
      label: row.account_name ?? row.account_email ?? "Claude account",
      status: row.status,
      slot: typeof slot === "string" ? slot : null,
    };
  });
}

type Busy = "starting" | "code" | "cancel" | `out:${string}` | null;

export function ClaudeAccountsPanel() {
  const [rows, setRows] = useState<ClaudeAccountRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ slot: string; status: OwnPlanStatus } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [copied, setCopied] = useState(false);
  const [connectFailure, setConnectFailure] = useState<string | null>(null);
  const connectAbort = useRef<AbortController | null>(null);
  const [capacity, setCapacity] = useState<SandboxCapacityRefusal | null>(null);
  const connectorUrl = `${resolveBaseUrl().replace(/\/$/, "")}/api/matrx-mcp`;

  const load = () =>
    readClaudeAccounts().then(
      (next) => {
        setLoadError(null);
        setRows(next);
      },
      (cause: unknown) => {
        setRows([]);
        setLoadError(getUserMessage(cause));
      },
    );
  const reload = () => {
    void load();
  };
  useEffect(() => {
    void load();
  }, []);
  // A Connect never outlives the panel: leaving the page ends its polling.
  useEffect(() => () => connectAbort.current?.abort(), []);

  const connect = async (opts: { afterStop?: boolean } = {}) => {
    const taken = new Set((rows ?? []).filter((r) => r.status === "connected").map((r) => r.slot));
    const slot = taken.has(PRIMARY) ? newClaudeAccountSlot() : PRIMARY;
    setBusy("starting");
    setCapacity(null);
    setConnectFailure(null);
    const controller = new AbortController();
    connectAbort.current = controller;
    try {
      if (opts.afterStop) await waitForFreeSlot(controller.signal);
      if (controller.signal.aborted) return;
      const outcome = await connectClaudeAccount(slot, controller.signal);
      if (outcome.kind === "signed_in") {
        toast.success("Claude account connected");
        reload();
      } else if (outcome.kind === "awaiting") {
        setPending({ slot, status: outcome.status });
      } else if (
        outcome.kind === "failed" ||
        outcome.kind === "timeout" ||
        outcome.kind === "offline"
      ) {
        setConnectFailure(outcome.message);
      }
    } catch (cause) {
      const full = capacityRefusalOf(cause);
      if (full) setCapacity(full);
      else setConnectFailure(getUserMessage(cause));
    } finally {
      if (connectAbort.current === controller) connectAbort.current = null;
      setBusy(null);
    }
  };

  const cancelStarting = () => connectAbort.current?.abort();

  const finish = async () => {
    if (!pending || !code.trim()) return;
    const typed = code;
    setCode("");
    setBusy("code");
    try {
      const status = await submitOwnPlanCode(PROVIDER, typed, pending.slot);
      if (status.signed_in) {
        toast.success("Claude account connected");
        setPending(null);
        reload();
      } else {
        setPending({ slot: pending.slot, status });
      }
    } catch (cause) {
      toast.error(getUserMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!pending) return;
    setBusy("cancel");
    try {
      await cancelOwnPlanSignIn(PROVIDER, pending.slot);
    } catch (cause) {
      toast.error(getUserMessage(cause));
    } finally {
      setPending(null);
      setCode("");
      setBusy(null);
    }
  };

  const signOut = async (row: ClaudeAccountRow) => {
    if (!row.slot) return;
    setBusy(`out:${row.id}`);
    try {
      await signOutOwnPlan(PROVIDER, row.slot);
      reload();
    } catch (cause) {
      toast.error(getUserMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(connectorUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section id="claude-accounts" className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Claude accounts</h2>
          <Button
            variant="outline"
            icon={<Plus />}
            onClick={() => void connect()}
            disabled={busy !== null || pending !== null}
          >
            Connect
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivers messages to your Claude cloud sessions.
        </p>

        {busy === "starting" && (
          <div
            className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border p-3"
            role="status"
          >
            <span className="flex min-w-0 items-center gap-2 text-xs text-foreground">
              <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
              <span className="truncate">Starting your sandbox…</span>
            </span>
            <Button variant="quiet" onClick={cancelStarting}>
              Cancel
            </Button>
          </div>
        )}

        {connectFailure && busy !== "starting" && (
          <div className="mt-3 space-y-2 rounded-lg border border-border p-3" role="alert">
            <ErrorNotice message={connectFailure} size="inline" />
            <Button variant="outline" onClick={() => void connect()}>
              Try again
            </Button>
          </div>
        )}

        {capacity && busy !== "starting" && (
          <SandboxCapacityList
            capacity={capacity}
            disabled={busy !== null}
            onStopped={(o) => {
              setCapacity((current) =>
                current
                  ? { ...current, occupants: current.occupants.filter((x) => x.row_id !== o.row_id) }
                  : current,
              );
              return connect({ afterStop: true });
            }}
          />
        )}

        {pending && (
          <div className="mt-3 space-y-2 rounded-lg border border-border p-3">
            {pending.status.sign_in_url ? (
              <Button asChild variant="outline">
                <a href={pending.status.sign_in_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  Sign in on Claude
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{pending.status.detail}</p>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Paste the code Claude shows"
                autoComplete="off"
                aria-label="Code from Claude"
              />
              <Button
                variant="primary"
                icon={busy === "code" ? <Loader2 className="animate-spin" /> : <KeyRound />}
                onClick={() => void finish()}
                disabled={busy !== null || !code.trim()}
              >
                Finish
              </Button>
              <Button
                variant="quiet"
               
                aria-label="Cancel sign-in"
                onClick={() => void cancel()}
                disabled={busy !== null}
                icon={<X />}
              />
            </div>
            {pending.status.detail && pending.status.sign_in_url && (
              <p className="text-xs text-muted-foreground">{pending.status.detail}</p>
            )}
          </div>
        )}

        <ul className="mt-3 divide-y divide-border">
          {rows === null && (
            <li className="py-2 text-xs text-muted-foreground">Loading…</li>
          )}
          {rows?.length === 0 && !loadError && (
            <li className="py-2 text-xs text-muted-foreground">No Claude account connected.</li>
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
                <p className="text-xs text-muted-foreground">
                  {row.status === "connected" ? "Connected" : "Signed out"}
                </p>
              </div>
              {row.status === "connected" && row.slot && (
                <Button
                  variant="quiet"
                  icon={busy === `out:${row.id}` ? <Loader2 className="animate-spin" /> : <LogOut />}
                  onClick={() => void signOut(row)}
                  disabled={busy !== null}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Use AI Matrx in Claude cloud sessions
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
          <li>Open Claude connectors, signed in to each Claude account.</li>
          <li>Add custom connector, paste the address below, then Connect.</li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
            {connectorUrl}
          </code>
          <Button
            variant="outline"
            icon={copied ? <Check /> : <Copy />}
            onClick={() => void copyUrl()}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button asChild variant="outline" className="mt-3">
          <a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            Open Claude connectors
          </a>
        </Button>
      </div>
    </section>
  );
}
