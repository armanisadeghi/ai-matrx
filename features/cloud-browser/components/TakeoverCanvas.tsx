"use client";

/**
 * TakeoverCanvas — the interactive stream canvas (D-8 tier 3).
 *
 * Appears ONLY during an active takeover (a person is actually driving). This is
 * the one expensive tier. In this fixture build it renders a placeholder surface
 * standing in for the Selkies/WebRTC <video> the gateway serves after a claim
 * (S4); the real element binds to the minted stream endpoint at M3.
 *
 * The canvas is never the only way to act: reconnect + return-control live in
 * accessible non-canvas controls beside it, and the controller banner names who
 * is driving above it.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { Loader2, RotateCw, MonitorSmartphone } from "lucide-react";
import type { ControllerState, StreamTicketEnvelope } from "../types";

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
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div
        className="relative flex-1 overflow-hidden rounded-md border border-border bg-slate-950"
        style={{ aspectRatio: ticket ? `${ticket.viewport.width} / ${ticket.viewport.height}` : undefined }}
      >
        {connecting || !ticket ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            <span className="text-sm">Connecting to the live browser…</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <MonitorSmartphone className="h-8 w-8" aria-hidden />
            <span className="text-sm">
              Live control stream ({ticket.protocol})
            </span>
            <span className="text-xs">
              {ticket.viewport.width}×{ticket.viewport.height} ·{" "}
              {controller.isMe ? "you are driving" : `${controller.displayName ?? "a person"} is driving`}
            </span>
            <span className="text-[11px] text-slate-500">
              (fixture placeholder — the WebRTC video binds here at M3)
            </span>
          </div>
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
