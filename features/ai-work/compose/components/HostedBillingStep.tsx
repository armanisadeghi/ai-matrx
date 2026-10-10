"use client";

/**
 * Who pays for a hosted Claude Code run: AI Matrx credits (the default, the
 * behavior before this control existed) or the person's own Claude plan.
 *
 * "Your Claude plan" needs the person signed in to Claude Code INSIDE their
 * Matrx Sandbox. That sign-in is Claude Code's own: we start it, the person
 * signs in on Anthropic's page, pastes back the code it shows, and the box
 * holds the credential. Every answer rendered here is the server's latest
 * `OwnPlanStatus` (`features/ai-work/lib/ownPlan.ts`) — nothing is inferred.
 *
 * The pasted code is component-local state only: never Redux, never storage,
 * never logged, and cleared the moment it is submitted.
 *
 * Starting the sign-in may boot the sandbox (a minute or two); the button says
 * so while it waits instead of a bare spinner.
 */

import { useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  KeyRound,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import {
  cancelOwnPlanSignIn,
  readOwnPlanStatus,
  signOutOwnPlan,
  type HostedBilling,
  type OwnPlanStatus,
} from "@/features/ai-work/lib/ownPlan";

import { Spinner } from "@/components/ui/loaders/Spinner";
import {
  connectClaudeAccount,
  redeemClaudeCode,
} from "@/features/ai-work/lib/connectClaudeAccount";
const PROVIDER = "claude_code" as const;

type Busy = "reading" | "starting" | "code" | "cancel" | "sign-out" | null;

export interface HostedBillingStepProps {
  billing: HostedBilling;
  onBillingChange: (billing: HostedBilling) => void;
  /** The latest own-plan status, owned by the composer so Run can read it. */
  status: OwnPlanStatus | null;
  onStatusChange: (status: OwnPlanStatus | null) => void;
}

export function HostedBillingStep({
  billing,
  onBillingChange,
  status,
  onStatusChange,
}: HostedBillingStepProps) {
  const [busy, setBusy] = useState<Busy>(null);
  const [code, setCode] = useState("");

  // Only the newest request may change what the person sees: a status read
  // that answers after Connect must not drop "Starting your sandbox" or
  // overwrite the sign-in link the later answer carries.
  const latest = useRef(0);

  const run = async (
    kind: Exclude<Busy, null>,
    call: () => Promise<OwnPlanStatus>,
  ) => {
    const id = ++latest.current;
    setBusy(kind);
    try {
      const next = await call();
      if (id === latest.current) onStatusChange(next);
    } catch (error) {
      if (id === latest.current) toast.error(getUserMessage(error));
    } finally {
      if (id === latest.current) setBusy(null);
    }
  };

  // Start-then-poll with a bounded wait (the shared Connect flow): a cold
  // sandbox answers "starting" at once and the flow waits for its link.
  const connectUntilLink = async (): Promise<OwnPlanStatus> => {
    const outcome = await connectClaudeAccount(undefined, new AbortController().signal);
    if (outcome.kind === "signed_in" || outcome.kind === "awaiting") return outcome.status;
    if (outcome.kind === "cancelled") throw new Error("Connect was cancelled.");
    throw new Error(outcome.message);
  };

  const submitCode = async () => {
    const value = code;
    // Cleared before the request resolves: the code lives nowhere after submit.
    setCode("");
    if (!value.trim()) return;
    // Bounded: Claude's answer within seconds, or "redeeming" polled to its end.
    await run("code", async () => {
      const outcome = await redeemClaudeCode(value, undefined, new AbortController().signal);
      if (outcome.kind === "settled") return outcome.status;
      if (outcome.kind === "cancelled") throw new Error("The sign-in was cancelled.");
      throw new Error(outcome.message);
    });
  };

  const state = status?.state ?? null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <span className="type-secondary font-medium text-foreground">Who pays</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={billing}
        onValueChange={(value) => {
          // A single-choice group reports "" when the active item is pressed
          // again; a run always has a payer, so that press changes nothing.
          if (!value) return;
          onBillingChange(value as HostedBilling);
          // Read the sign-in the moment the person picks their own plan. The
          // status door never starts a sandbox, so this costs nothing.
          // Never while a sign-in step is in flight: that answer is newer.
          if (value === "own_plan" && busy === null) {
            void run("reading", () => readOwnPlanStatus(PROVIDER));
          }
        }}
        className="justify-start"
        aria-label="Who pays"
      >
        <ToggleGroupItem
          value="platform"
          className="px-2.5 text-xs pointer-coarse:min-h-11 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary-ink"
        >
          AI Matrx credits
        </ToggleGroupItem>
        <ToggleGroupItem
          value="own_plan"
          className="px-2.5 text-xs pointer-coarse:min-h-11 data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-primary-ink"
        >
          Your Claude plan
        </ToggleGroupItem>
      </ToggleGroup>

      {billing === "own_plan" && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2.5">
          {busy === "reading" && !status ? (
            <span className="flex items-center gap-1.5 type-secondary text-muted-foreground">
              <Spinner size="xs" className="text-current" />
              Checking your Claude sign-in
            </span>
          ) : state === "signed_in" || state === "signed_in_not_plan" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 type-secondary text-foreground">
                {state === "signed_in" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {state === "signed_in"
                  ? "Signed in to Claude"
                  : "Signed in, but not on a Claude plan"}
              </span>
              <Button
                icon={busy === "sign-out" ? (
                  <Spinner size="xs" className="text-current" />
                ) : (
                  <LogOut />
                )}
                type="button"
                variant="outline"
                onClick={() => run("sign-out", () => signOutOwnPlan(PROVIDER))}
                disabled={busy !== null}
              >
                Sign out
              </Button>
            </div>
          ) : state === "awaiting_code" || state === "awaiting_browser" ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {status?.sign_in_url && (
                  <Button asChild variant="outline">
                    <a
                      href={status.sign_in_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open Claude sign-in
                    </a>
                  </Button>
                )}
                {state === "awaiting_browser" && (
                  <Button
                    icon={<RefreshCw />}
                    type="button"
                    variant="outline"
                    onClick={() =>
                      run("reading", () => readOwnPlanStatus(PROVIDER))
                    }
                    disabled={busy !== null}
                  >
                    Check again
                  </Button>
                )}
                <Button
                  icon={<X />}
                  type="button"
                  variant="quiet"
                  onClick={() =>
                    run("cancel", () => cancelOwnPlanSignIn(PROVIDER))
                  }
                  disabled={busy !== null}
                >
                  Cancel
                </Button>
              </div>
              {state === "awaiting_browser" && status?.user_code && (
                <span className="type-secondary text-foreground">
                  Enter this code there:{" "}
                  <span className="font-mono">{status.user_code}</span>
                </span>
              )}
              {state === "awaiting_code" && (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitCode();
                  }}
                >
                  <Input
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="Paste the code Claude shows"
                    aria-label="Claude sign-in code"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    icon={busy === "code" ? (
                      <Spinner size="xs" className="text-current" />
                    ) : (
                      <KeyRound />
                    )}
                    variant="primary"
                    type="submit"
                    disabled={busy !== null || !code.trim()}
                  >
                    Connect
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                icon={busy === "starting" ? (
                  <Spinner size="xs" className="text-current" />
                ) : (
                  <KeyRound />
                )}
                type="button"
                variant="outline"
                onClick={() => run("starting", connectUntilLink)}
                disabled={busy !== null}
              >
                Connect your Claude account
              </Button>
              {busy === "starting" && (
                <span className="type-secondary text-muted-foreground">
                  Starting your sandbox can take a minute or two
                </span>
              )}
            </div>
          )}
          {status?.detail && (
            <span className="type-secondary text-muted-foreground">
              {status.detail}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
