"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { extractErrorMessage } from "@/utils/errors";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { previewChatMessages, validateChatRequest, type ChatMessagesPreview, type ChatMessagesRequest } from "./service";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";

interface Props {
  connection: GoogleConnectionSummary | null;
  actorId: string | null;
  organizationId: string | null;
}

export function ChatMessagesReview({ connection, actorId, organizationId }: Props) {
  const [space, setSpace] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [size, setSize] = useState("");
  const [order, setOrder] = useState("");
  const [page, setPage] = useState<ChatMessagesPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<ChatMessagesRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const permitted = Boolean(connection && actorId && connection.owner_type === "user" &&
    connection.owner_user_id === actorId && connection.health === "connected" &&
    connection.scopes.includes(GOOGLE_SCOPE.chatMessagesReadonly));

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current += 1; };
  }, []);

  function clear() {
    epoch.current += 1;
    setPage(null);
    setError(null);
    setFailed(null);
    setBusy(false);
  }

  // The parent keys this component by account and organization. A switch
  // unmounts it and invalidates every unresolved context or page read.
  async function read(request: ChatMessagesRequest) {
    if (!permitted) return;
    const own = ++epoch.current;
    setPage(null);
    setError(null);
    setFailed(null);
    setBusy(true);
    try {
      validateChatRequest(request);
      const context = await ensureOrgId(organizationId);
      if (!mounted.current || epoch.current !== own) return;
      const result = await previewChatMessages(request, context);
      if (mounted.current && epoch.current === own) setPage(result);
    } catch (cause) {
      if (mounted.current && epoch.current === own) {
        setError(extractErrorMessage(cause));
        setFailed(request);
      }
    } finally {
      if (mounted.current && epoch.current === own) setBusy(false);
    }
  }

  function query(): ChatMessagesRequest | null {
    if (!connection || !order || !size) return null;
    const request: ChatMessagesRequest = {
      connection_id: connection.id,
      space_resource_name: space.trim(),
      start_time: start.trim(), end_time: end.trim(),
      page_size: Number(size),
      order_by: order === "createTime ASC" ? "createTime ASC" : "createTime DESC",
    };
    return request;
  }

  const base = query();
  return (
    <section aria-label="Google Chat messages" className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Google Chat messages</h2>
      <p className="mt-1 break-words text-xs text-muted-foreground">
        {connection ? (connection.account_email ?? connection.id) : "Choose a Google account"}
      </p>
      {!permitted ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          This personal account needs connected Google Chat message permission.
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs text-muted-foreground">Temporary text only · No AI, save or sync</p>
          <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-xs">Space resource name
              <input className="mt-1 w-full min-w-0 rounded border bg-background p-2 text-sm" value={space}
                placeholder="spaces/your-space-id" onChange={(event) => { clear(); setSpace(event.target.value); }} />
            </label>
            <label className="min-w-0 text-xs">Page size (1–1000)
              <input className="mt-1 w-full min-w-0 rounded border bg-background p-2 text-sm" type="number" min={1} max={1000} value={size}
                onChange={(event) => { clear(); setSize(event.target.value); }} />
            </label>
            <label className="min-w-0 text-xs">Start time (RFC3339)
              <input className="mt-1 w-full min-w-0 rounded border bg-background p-2 text-sm" value={start}
                placeholder="2026-10-01T00:00:00Z" onChange={(event) => { clear(); setStart(event.target.value); }} />
            </label>
            <label className="min-w-0 text-xs">End time (RFC3339)
              <input className="mt-1 w-full min-w-0 rounded border bg-background p-2 text-sm" value={end}
                placeholder="2026-10-02T00:00:00Z" onChange={(event) => { clear(); setEnd(event.target.value); }} />
            </label>
            <label className="min-w-0 text-xs">Order
              <select className="mt-1 w-full min-w-0 rounded border bg-background p-2 text-sm" value={order}
                onChange={(event) => { clear(); setOrder(event.target.value); }}>
                <option value="">Choose order</option>
                <option value="createTime ASC">Oldest first</option>
                <option value="createTime DESC">Newest first</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy || !base || !space || !start || !end} onClick={() => { if (base) void read(base); }}>Read one page</Button>
            {page?.continuation ? <Button variant="outline" disabled={busy || !base}
              onClick={() => { if (base && page.continuation) void read({ ...base, continuation: page.continuation }); }}>Next page</Button> : null}
            {failed ? <Button variant="outline" disabled={busy} onClick={() => void read(failed)}>Retry</Button> : null}
          </div>
          {busy ? <p role="status" className="mt-3 text-sm">Reading messages…</p> : null}
          {error ? <ErrorNotice error={error} /> : null}
          {!error && page ? (
            <div className="mt-4 min-w-0 space-y-3">
              <p className="text-xs text-muted-foreground">System messages and other content omitted</p>
              {page.messages.length === 0 ? <p role="status" className="text-sm">No messages in this page.</p> :
                page.messages.map((message) => (
                  <article key={message.resource_name} className="min-w-0 rounded border p-3 text-sm">
                    <p className="break-all text-xs text-muted-foreground">{message.resource_name}</p>
                    {message.thread_resource_name ? <p className="break-all text-xs">Thread: {message.thread_resource_name}</p> : null}
                    {message.sender_resource_name ? <p className="break-all text-xs">Sender: {message.sender_resource_name}</p> : null}
                    {message.sender_type ? <p className="break-words text-xs">Sender type: {message.sender_type}</p> : null}
                    {message.create_time ? <p className="break-all text-xs">Created: {message.create_time}</p> : null}
                    {message.text != null && (message.content_state === "text" || message.content_state === "text_with_other_content") ?
                      <p className="mt-2 whitespace-pre-wrap break-words">{message.text}</p> : null}
                    {message.content_state === "text_with_other_content" || message.content_state === "other_content" ?
                      <p className="mt-2 text-xs text-muted-foreground">Other content omitted.</p> : null}
                    {message.content_state === "unavailable" ? <p className="mt-2 text-xs text-muted-foreground">Content unavailable.</p> : null}
                  </article>
                ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
