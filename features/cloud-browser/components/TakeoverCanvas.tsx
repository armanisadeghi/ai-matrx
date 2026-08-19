"use client";

/**
 * TakeoverCanvas — the interactive stream canvas (D-8 tier 3).
 *
 * Appears ONLY during an active takeover (a person is actually driving). This is
 * the one expensive tier. The authenticated iframe is the WebRTC client; its
 * address comes from the server and its session cookie is HttpOnly.
 *
 * The canvas is never the only way to act: reconnect + return-control live in
 * accessible non-canvas controls beside it, and the controller banner names who
 * is driving above it.
 */

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Loader2, RotateCw } from "lucide-react";
import type { ControllerState, StreamTicketEnvelope } from "../types";
import { renewStreamTicket } from "../service";

export function TakeoverCanvas({
  controller,
  ticket,
  connecting,
  onReconnect,
  className,
}: {
  controller: ControllerState;
  ticket: StreamTicketEnvelope | null;
  connecting?: boolean;
  onReconnect: () => void;
  className?: string;
}) {
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<{
    sessionId: string;
    message: string;
  } | null>(null);
  const loaded = ticket !== null && loadedSessionId === ticket.streamSessionId;
  const visibleError =
    ticket !== null && connectionError?.sessionId === ticket.streamSessionId
      ? connectionError.message
      : null;

  useEffect(() => {
    if (!ticket?.control) return;
    const renew = window.setInterval(() => {
      void renewStreamTicket(ticket).catch(() => {
        setConnectionError({
          sessionId: ticket.streamSessionId,
          message:
            "The live browser connection expired. Reconnect to continue.",
        });
      });
    }, ticket.control.renewIntervalSeconds * 1000);
    return () => window.clearInterval(renew);
  }, [ticket]);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div
        className="relative flex-1 overflow-hidden rounded-md border border-border bg-slate-950"
        style={{
          aspectRatio: ticket
            ? `${ticket.viewport.width} / ${ticket.viewport.height}`
            : undefined,
        }}
      >
        {connecting || !ticket ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="text-sm">Connecting to the live browser…</span>
          </div>
        ) : (
          <>
            {!loaded ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-slate-300">
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                <span className="text-sm">Starting the live browser…</span>
              </div>
            ) : null}
            <iframe
              key={ticket.streamSessionId}
              src={ticket.endpoint}
              title="Live cloud browser"
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen"
              referrerPolicy="no-referrer"
              onLoad={() => setLoadedSessionId(ticket.streamSessionId)}
              onError={() =>
                setConnectionError({
                  sessionId: ticket.streamSessionId,
                  message:
                    "The live browser could not load. Reconnect to try again.",
                })
              }
            />
            {visibleError ? (
              <div className="absolute inset-x-3 bottom-3 z-20 rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground shadow">
                {visibleError}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Accessible, non-canvas controls (never rely on the canvas alone). */}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {ticket
            ? `Session ${ticket.streamSessionId} · lease revision ${controller.controlRevision}`
            : "No live session"}
        </span>
        <Button size="sm" variant="outline" onClick={onReconnect}>
          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
          Reconnect
        </Button>
      </div>
    </div>
  );
}
