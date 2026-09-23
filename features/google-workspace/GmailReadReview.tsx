"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { useOpenConnectorConsentDialog } from "@/features/overlays/openers/connectorConsentDialog";
import {
  useGoogleCapabilities,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  readGmailMessage,
  searchGmail,
} from "@/features/marketing/google/service";
import type {
  GmailMessageDetail,
  GmailSearchResult,
} from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

/** Reviewer-sized mailbox read. Nothing is fetched until the user searches. */
export function GmailReadReview() {
  const openConsent = useOpenConnectorConsentDialog();
  const userId = useAppSelector(selectUserId);
  const inventory = useGoogleConnectionInventory();
  const capabilities = useGoogleCapabilities();
  const gmailReading = capabilities.data?.find(
    (capability) => capability.key === "gmail_read",
  );
  // The shared query is invalidated after consent succeeds. Keep the review
  // screen subscribed so a newly connected mailbox is usable without reload.
  const accounts = (inventory.data?.connections ?? []).filter(
    (row) =>
      row.owner_type === "user" &&
      row.owner_user_id === userId &&
      row.health === "connected" &&
      row.scopes.includes(GOOGLE_SCOPE.gmailReadonly),
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const connectionId = accounts.some((row) => row.id === selectedConnectionId)
    ? selectedConnectionId
    : (accounts[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GmailSearchResult | null>(null);
  const [message, setMessage] = useState<GmailMessageDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionId || !query.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setMessage(null);
    try {
      setResult(await searchGmail(connectionId, query.trim()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onOpen(messageId: string) {
    if (!connectionId || busy) return;
    setBusy(true);
    setError("");
    setMessage(null);
    try {
      setMessage(await readGmailMessage(connectionId, messageId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "This message could not open.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Gmail reading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and open messages from the Google account you choose. This
          reads only when you ask; it does not sync your whole mailbox, change
          messages, or send email.
        </p>
      </div>
      {!userId || inventory.isLoading ? (
        <p className="rounded-md border p-3 text-sm">Loading Google accounts…</p>
      ) : inventory.isError ? null : accounts.length === 0 ? (
        <p className="rounded-md border p-3 text-sm">
          No personal Google account with Gmail reading is connected here.{" "}
          {gmailReading?.eligible ? (
            <button
              type="button"
              className="underline"
              onClick={() => openConsent({ initialProductKeys: ["gmail_read"] })}
            >
              Connect Gmail reading
            </button>
          ) : gmailReading && !gmailReading.eligible ? (
            "Gmail reading is not available to you during this rollout."
          ) : capabilities.isLoading ? (
            "Checking Gmail reading availability…"
          ) : (
            "Gmail reading availability could not be verified. Try again shortly."
          )}
        </p>
      ) : (
        <form
          className="flex flex-col gap-2 rounded-md border p-3"
          onSubmit={(event) => void onSearch(event)}
        >
          <label className="text-sm font-medium" htmlFor="gmail-read-account">
            Google account
          </label>
          <select
            id="gmail-read-account"
            className="h-10 rounded-md border bg-background px-2 text-sm"
            value={connectionId}
            onChange={(event) => {
              setSelectedConnectionId(event.target.value);
              setResult(null);
              setMessage(null);
            }}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.account_email ??
                  account.account_name ??
                  "Google account"}
              </option>
            ))}
          </select>
          <label className="text-sm font-medium" htmlFor="gmail-read-query">
            Search Gmail
          </label>
          <div className="flex gap-2">
            <input
              className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
              id="gmail-read-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={200}
              placeholder="from:someone@example.com"
            />
            <Button type="submit" disabled={busy || !query.trim()}>
              Search
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Shows at most 20 matches. Search terms and messages are not saved by
            this screen.
          </p>
        </form>
      )}
      {error || inventory.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {error || "Google accounts could not load. Try again shortly."}
        </p>
      ) : null}
      {result ? (
        <section
          aria-label="Gmail search results"
          className="rounded-md border"
        >
          {result.messages.length === 0 ? (
            <p className="p-3 text-sm">No messages matched this search.</p>
          ) : (
            result.messages.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full border-b p-3 text-left last:border-b-0 hover:bg-muted/50"
                onClick={() => void onOpen(item.id)}
                disabled={busy}
              >
                <span className="block text-sm font-medium">
                  {item.subject}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {item.from_address} · {item.date}
                </span>
                <span className="block text-xs">{item.snippet}</span>
              </button>
            ))
          )}
          {result.has_more ? (
            <p className="p-3 text-xs text-muted-foreground">
              More messages may match. Refine your search to narrow the results.
            </p>
          ) : null}
        </section>
      ) : null}
      {message ? (
        <article
          aria-label="Opened Gmail message"
          className="rounded-md border p-4"
        >
          <h2 className="text-lg font-semibold">{message.subject}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            From: {message.from_address}
            <br />
            To: {message.to_address}
            <br />
            Date: {message.date}
          </p>
          <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm">
            {message.text_body ||
              message.snippet ||
              "No plain-text body is available for this message."}
          </pre>
          {message.truncated ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Only the first 64 KB of this message is shown.
            </p>
          ) : null}
        </article>
      ) : null}
    </main>
  );
}
