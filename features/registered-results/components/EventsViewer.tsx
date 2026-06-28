"use client";

import { Construction } from "lucide-react";

export interface EventsViewerProps {
  nodeData: unknown;
  brokerId: string;
}

/**
 * Registered workflow output viewer — UI preserved, data layer pending rebuild
 * on the external workflows app (workflows.aimatrx.com) / wf_ API.
 */
export default function EventsViewer({ brokerId }: EventsViewerProps) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm">
        <Construction className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium text-foreground">
            Events viewer — rebuild pending
          </p>
          <p className="mt-1 text-muted-foreground">
            This surface is kept for registered workflow results. The legacy
            implementation was removed with the old workflow UI; it will be
            rewired to the Vite workflow system.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            broker: {brokerId}
          </p>
        </div>
      </div>
    </div>
  );
}
