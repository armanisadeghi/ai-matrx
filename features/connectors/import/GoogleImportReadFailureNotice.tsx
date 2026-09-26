"use client";

/**
 * features/connectors/import/GoogleImportReadFailureNotice.tsx
 *
 * THE FOURTH STATE, ON SCREEN — the one posture every Google import panel
 * renders when the read did not happen. See `./read-failure.ts` for the law
 * and the defect (F-113): a failed read is not an empty read, and the remedy
 * is something on THIS screen, never a parameter to set.
 *
 * ONE component, both panels: Contacts and Tasks fail the same way (the same
 * `resolve_google_account` refusal, through the same service), so the person
 * meets the same sentence and the same choice in both. A per-panel copy is how
 * the two would drift into two ideas of what a failed Google read looks like.
 */

import Link from "next/link";
import { CircleAlert, RefreshCw, UserCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  GOOGLE_CONNECTIONS_HREF,
  type GoogleImportReadFailure,
} from "./read-failure";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface GoogleImportReadFailureNoticeProps {
  failure: GoogleImportReadFailure;
  /** The account already chosen, so the picker can show which one is in use. */
  chosenAccount?: string | null;
  /** Re-run the read against this account. */
  onChooseAccount: (account: string) => void;
  /** Re-run the same read. The remedy for a failure nothing else can resolve. */
  onRetry: () => void;
  /** True while a read is in flight, so neither remedy can be double-pressed. */
  busy?: boolean;
}

export function GoogleImportReadFailureNotice({
  failure,
  chosenAccount = null,
  onChooseAccount,
  onRetry,
  busy = false,
}: GoogleImportReadFailureNoticeProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-amber-500/10 px-4 py-3">
      <p className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {failure.sentence}
        <ErrorAlchemyMenu error={failure.sentence} />
      </p>
      {failure.kind === "several_accounts" && failure.accounts.length > 0 ? (
        // THE REMEDY IS THE PRESS: the accounts the server named ARE the
        // choice, and pressing one re-runs the read against it.
        <div className="flex flex-wrap gap-2">
          {failure.accounts.map((account) => (
            <Button
              key={account}
              size="sm"
              variant={account === chosenAccount ? "secondary" : "outline"}
              className="h-8 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={() => onChooseAccount(account)}
            >
              <UserCheck className="h-3.5 w-3.5" />
              {account}
            </Button>
          ))}
        </div>
      ) : failure.kind === "several_accounts" ? (
        // The server named several accounts and none we can send back. THE
        // DOOR: the screen that lists what this person has connected.
        <Link
          href={GOOGLE_CONNECTIONS_HREF}
          className="text-xs font-medium text-foreground underline underline-offset-2"
        >
          Open your Google connections
        </Link>
      ) : (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 px-2 text-xs"
            disabled={busy}
            onClick={onRetry}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
