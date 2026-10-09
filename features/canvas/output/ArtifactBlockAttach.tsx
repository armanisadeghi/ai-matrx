"use client";

/**
 * "Attach to chat" on an artifact block inside a message (rendered-output P2
 * WP4): one click attaches the type's default representation; the chevron
 * lists them all. The same `attachArtifactToChat` the canvas pane uses — the
 * screenshot captures the block as drawn, at attach time.
 */

import React, { useRef, useState } from "react";
import { ChevronDown, Paperclip } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getStore } from "@/lib/redux/store-singleton";
import { artifactAttachOptions, attachArtifactToChat } from "./artifactAttach";
import type { RenderedArtifactRepresentation } from "@ai-matrx/chat/agents/types/instance.types";

export interface ArtifactBlockAttachProps {
  type: string;
  data: unknown;
  title: string;
  conversationId: string;
  messageId?: string;
  blockIndex?: number;
  artifactId?: string;
  children: React.ReactNode;
}

export function ArtifactBlockAttach({
  type,
  data,
  title,
  conversationId,
  messageId,
  blockIndex,
  artifactId,
  children,
}: ArtifactBlockAttachProps) {
  const body = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const options = artifactAttachOptions(type, data);
  const [first] = options;

  const attachAs = async (representation: RenderedArtifactRepresentation) => {
    const store = getStore();
    if (!store) return;
    setBusy(true);
    try {
      await attachArtifactToChat({
        store,
        conversationId,
        type,
        title,
        data,
        canvasItemId: artifactId ?? null,
        blockKey: `${messageId ?? "message"}_${blockIndex ?? 0}_${type}`,
        representation,
        element: () => body.current,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group/artifact-attach relative" data-artifact-attach={type}>
      <div ref={body}>{children}</div>
      <div className="absolute bottom-1 right-1 flex items-center opacity-0 transition-opacity group-hover/artifact-attach:opacity-100 focus-within:opacity-100">
        <Button
          variant="quiet"
          icon={<Paperclip />}
          disabled={busy}
          onClick={() => void attachAs(first.value)}
          title={`Attach ${first.label.toLowerCase()} to chat`}
          aria-label={`Attach ${first.label.toLowerCase()} to chat`}
          data-artifact-attach-default={first.value}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" icon={<ChevronDown />} title="Attach to chat as…" aria-label="Attach to chat as…" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {options.map((option) => (
              <DropdownMenuItem
                key={option.value}
                disabled={Boolean(option.unavailable)}
                onSelect={() => void attachAs(option.value)}
                data-artifact-attach-as={option.value}
              >
                {option.unavailable ?? `Attach ${option.label.toLowerCase()}`}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
