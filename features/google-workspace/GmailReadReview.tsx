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
  modifyGmailMessage,
  listGmailLabels,
} from "@/features/marketing/google/service";
import type {
  GmailLabelSummary,
  GmailMessageDetail,
  GmailModifyAction,
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
  const canModify = accounts.some(
    (row) =>
      row.id === connectionId && row.scopes.includes(GOOGLE_SCOPE.gmailModify),
  );
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<GmailSearchResult | null>(null);
  const [message, setMessage] = useState<GmailMessageDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mutationStatus, setMutationStatus] = useState("");
  const [labelId, setLabelId] = useState("");
  const [labels, setLabels] = useState<GmailLabelSummary[] | null>(null);
  const [nextLabelOffset, setNextLabelOffset] = useState<number | null>(null);
  const [knownLabelIds, setKnownLabelIds] = useState<string[] | null>(null);
  const [undo, setUndo] = useState<{ action: GmailModifyAction; labelId?: string } | null>(null);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!connectionId || !query.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setMessage(null);
    setMutationStatus("");
    setKnownLabelIds(null);
    setUndo(null);
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
    setMutationStatus("");
    setKnownLabelIds(null);
    setUndo(null);
    try {
      const opened = await readGmailMessage(connectionId, messageId);
      setMessage(opened);
      setKnownLabelIds(opened.label_ids ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "This message could not open.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onModify(action: GmailModifyAction, labelOverride?: string, isUndo = false) {
    if (!connectionId || !message || !canModify || busy) return;
    const requestedLabelId = action === "add_label" || action === "remove_label"
      ? (labelOverride ?? labelId)
      : "";
    if (
      (action === "add_label" || action === "remove_label") &&
      !requestedLabelId
    ) {
      setError("Enter a Gmail label ID first.");
      return;
    }
    setBusy(true);
    setError("");
    setMutationStatus("");
    try {
      const updated = await modifyGmailMessage({
        connectionId,
        messageId: message.id,
        action,
        ...(action === "add_label" || action === "remove_label"
          ? { labelId: requestedLabelId }
          : {}),
      });
      if (updated.message_id !== message.id || !Array.isArray(updated.label_ids)) {
        throw new Error("Gmail did not confirm the changed message. Try again.");
      }
      const description: Record<GmailModifyAction, string> = {
        archive: "Archived",
        restore_inbox: "Restored to inbox",
        mark_read: "Marked as read",
        mark_unread: "Marked as unread",
        star: "Starred",
        unstar: "Removed star",
        add_label: "Added label",
        remove_label: "Removed label",
      };
      const labelForAction: Partial<Record<GmailModifyAction, string>> = {
        archive: "INBOX",
        restore_inbox: "INBOX",
        mark_read: "UNREAD",
        mark_unread: "UNREAD",
        star: "STARRED",
        unstar: "STARRED",
        add_label: requestedLabelId,
        remove_label: requestedLabelId,
      };
      const inverse: Record<GmailModifyAction, GmailModifyAction> = {
        archive: "restore_inbox",
        restore_inbox: "archive",
        mark_read: "mark_unread",
        mark_unread: "mark_read",
        star: "unstar",
        unstar: "star",
        add_label: "remove_label",
        remove_label: "add_label",
      };
      const changedLabel = labelForAction[action];
      const changed = knownLabelIds !== null && !!changedLabel &&
        knownLabelIds.includes(changedLabel) !== updated.label_ids.includes(changedLabel);
      setKnownLabelIds(updated.label_ids);
      setUndo(changed && !isUndo
        ? { action: inverse[action], ...(requestedLabelId ? { labelId: requestedLabelId } : {}) }
        : null);
      setMutationStatus(isUndo ? "Last change undone in Gmail." : `${description[action]} in Gmail.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "This message could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onLoadLabels(offset = 0) {
    if (!connectionId || !canModify || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await listGmailLabels(connectionId, offset);
      if (!Array.isArray(result.labels)) {
        throw new Error("Gmail did not return a label list. Try again.");
      }
      setLabels((previous) => offset === 0 ? result.labels : [...(previous ?? []), ...result.labels]);
      setNextLabelOffset(result.has_more ? result.next_offset : null);
      if (offset === 0) setLabelId("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gmail labels could not load.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Gmail reading</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search and open messages from the Google account you choose. Search
          reads only when you ask. If this account has Gmail change access,
          you can change an opened message with an explicit action. This screen
          does not sync your whole mailbox or send email.
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
            disabled={busy}
            onChange={(event) => {
              setSelectedConnectionId(event.target.value);
              setResult(null);
              setMessage(null);
              setMutationStatus("");
              setError("");
              setLabels(null);
              setNextLabelOffset(null);
              setLabelId("");
              setKnownLabelIds(null);
              setUndo(null);
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
      {mutationStatus ? (
        <div className="flex items-center gap-2 text-sm" role="status">
          <span>{mutationStatus}</span>
          {undo ? (
            <Button type="button" variant="link" disabled={busy} onClick={() => void onModify(undo.action, undo.labelId, true)}>
              Undo
            </Button>
          ) : null}
        </div>
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
          {canModify ? (
            <section aria-label="Gmail message actions" className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">Change this message in Gmail</p>
              <div className="flex flex-wrap gap-2">
                {([
                  ["archive", "Archive"],
                  ["mark_read", "Mark read"],
                  ["mark_unread", "Mark unread"],
                  ["star", "Star"],
                  ["unstar", "Remove star"],
                ] as const).map(([action, label]) => (
                  <Button
                    key={action}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onModify(action)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="mt-4">
                {labels === null ? (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void onLoadLabels()}>
                    Load Gmail labels
                  </Button>
                ) : labels.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No Gmail labels are available for this account.</p>
                ) : (
                  <>
                    <label htmlFor="gmail-label-picker" className="block text-sm font-medium">
                      Gmail label
                    </label>
                    <select
                      id="gmail-label-picker"
                      className="mt-1 h-10 w-full rounded-md border bg-background px-2 text-sm"
                      value={labelId}
                      onChange={(event) => setLabelId(event.target.value)}
                      disabled={busy}
                    >
                      <option value="">Choose a label</option>
                      {labels.map((label) => (
                        <option key={label.id} value={label.id}>{label.name}</option>
                      ))}
                    </select>
                    {nextLabelOffset !== null ? (
                      <Button type="button" variant="link" disabled={busy} onClick={() => void onLoadLabels(nextLabelOffset)}>
                        Load more labels
                      </Button>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" disabled={busy || !labelId} onClick={() => void onModify("add_label")}>
                        Add label
                      </Button>
                      <Button type="button" variant="outline" disabled={busy || !labelId} onClick={() => void onModify("remove_label")}>
                        Remove label
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : (
            <p className="mt-4 border-t pt-4 text-sm text-muted-foreground">
              This account has Gmail reading access. Message changes require a separate Gmail change grant.
            </p>
          )}
        </article>
      ) : null}
    </main>
  );
}
